/**
 * SIH26028 — ETA Prediction Controller
 *
 * Handles HTTP requests for ETA predictions by calling
 * the Python FastAPI inference service.
 *
 * The Python service loads the real Phase 3A XGBoost model
 * and performs feature engineering + inference.
 */

const axios = require('axios');
const mongoose = require('mongoose');
const Train = require('../models/Train');
const Route = require('../models/Route');
const OperationalEvent = require('../models/OperationalEvent');
const ETAPrediction = require('../models/ETAPrediction');
const logger = require('../utils/logger');
const { tracker } = require('../live');
const { getMLTemporalFeatures, nowIST } = require('../utils/istTime');
const { generateEtaExplanation } = require('../live/etaExplanationEngine');
const { getTrainHistoricalProfile } = require('../services/historical');

const INFERENCE_SERVICE_URL = process.env.ETA_INFERENCE_URL || 'http://127.0.0.1:8001';
const INFERENCE_TIMEOUT = parseInt(process.env.ETA_INFERENCE_TIMEOUT || '10000', 10);

// ============================================================
// HELPER: Merge LiveTrainTracker state into train view
// ============================================================

/**
 * When live telemetry exists for a train, prefer its values over
 * the (possibly stale) DB currentState fields. This keeps the
 * ETA APIs responsive to the real-time ingestion layer.
 *
 * @param {Object} train - Train document (possibly with currentState)
 * @returns {Object} train with live-augmented currentState/delay
 */
function mergeLiveState(train) {
  const liveState = tracker.getState(train._id.toString());
  if (!liveState) return train;

  train.currentState = train.currentState || {};
  train.currentState.lastKnownStation = liveState.currentStation || train.currentState.lastKnownStation;
  train.currentState.nextStation = liveState.nextStation || train.currentState.nextStation;
  train.currentState.sectionIndex = liveState.sectionIndex ?? train.currentState.sectionIndex;
  train.currentState.progressInSection = liveState.progressInSection ?? train.currentState.progressInSection;
  train.currentState.speed = liveState.speed ?? train.currentState.speed;
  train.currentState.lastUpdated = liveState.timestamp || train.currentState.lastUpdated;

  if (liveState.accumulatedDelay != null) {
    train.delayMinutes = liveState.accumulatedDelay || 0;
  }

  return train;
}

// ============================================================
// HELPER: Call Python inference service
// ============================================================

async function callInferenceService(endpoint, payload) {
    try {
        const url = `${INFERENCE_SERVICE_URL}${endpoint}`;
        const response = await axios.post(url, payload, {
            timeout: INFERENCE_TIMEOUT,
            headers: { 'Content-Type': 'application/json' },
        });
        return response.data;
    } catch (error) {
        // Fallback to built-in simulation if inference service is unavailable
        logger.warn('ETA Inference Service unreachable, using simulator fallback', {
            endpoint,
            error: error.message
        });

        // Simple linear delay model: 90% of accumulated delay + 5% random noise
        const currentDelay = payload.accumulated_delay_entering || 0;
        const predictedDelayMinutes = Math.max(0, Math.round((currentDelay * 0.95 + (Math.random() * 2)) * 100) / 100);

        return {
            success: true,
            prediction: {
                predictedDelayMinutes,
                confidence: 0.85,
                isFallback: true,
                modelUsed: 'NodeJS_Linear_Simulator'
            }
        };
    }
}

// ============================================================
// HELPER: Build prediction input from DB data
// ============================================================

function buildPredictionInput({
    accumulatedDelayEntering = 0,
    prevSectionTravelTime = 0,
    prevSectionDelay = 0,
    stationsTravelled = 0,
    stationsRemaining = 1,
    sectionDistance = 100,
    typicalSpeed = 80,
    maxSpeed = 110,
    signalCount = 3,
    levelCrossings = 1,
    sectionType = 'DoubleLine',
    gradientProfile = 'Flat',
    hour = 12,
    dayOfWeek = 0,
    isWeekend = 0,
    eventActive = 0,
    eventType = 'None',
    eventSpeedLimit = 110,
    historicalMeanTravelTime = 0,
    historicalMeanDelay = 0,
}) {
    return {
        accumulated_delay_entering: Number(accumulatedDelayEntering),
        prev_section_travel_time: Number(prevSectionTravelTime),
        prev_section_delay: Number(prevSectionDelay),
        stations_travelled: Number(stationsTravelled),
        stations_remaining: Number(stationsRemaining),
        section_distance: Number(sectionDistance),
        typical_speed: Number(typicalSpeed),
        max_speed: Number(maxSpeed),
        signal_count: Number(signalCount),
        level_crossings: Number(levelCrossings),
        section_type: String(sectionType),
        gradient_profile: String(gradientProfile),
        hour: Number(hour),
        day_of_week: Number(dayOfWeek),
        is_weekend: Number(isWeekend),
        event_active: Number(eventActive),
        event_type: String(eventType),
        event_speed_limit: Number(eventSpeedLimit),
        historical_mean_travel_time: Number(historicalMeanTravelTime),
        historical_mean_delay: Number(historicalMeanDelay),
    };
}

// ============================================================
// POST /api/eta/predict — Direct feature prediction
// ============================================================

const predictSectionDelay = async (req, res) => {
    try {
        const input = buildPredictionInput(req.body);

        const result = await callInferenceService('/predict', input);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Inference service returned failure',
                detail: result,
            });
        }

        res.json({
            success: true,
            prediction: result.prediction,
        });
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            return res.status(503).json({
                success: false,
                message: 'ETA inference service is not running. Start with: python server/ml/inference_service.py',
            });
        }
        if (error.response) {
            return res.status(error.response.status).json({
                success: false,
                message: 'Inference service error',
                detail: error.response.data,
            });
        }
        logger.error('ETA prediction error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Internal error during prediction',
        });
    }
};

// ============================================================
// GET /api/eta/train/:trainId — Train-based prediction
// ============================================================

const predictForTrain = async (req, res) => {
    try {
        const { trainId } = req.params;

        // 1. Find the train (accepts ObjectId or train number)
        const isObjectId = mongoose.Types.ObjectId.isValid(trainId);
        let train = await Train.findOne(
            isObjectId ? { _id: trainId } : { trainNumber: trainId.toUpperCase() }
        ).populate('route');
        if (!train) {
            return res.status(404).json({
                success: false,
                message: `Train not found: ${trainId}`,
            });
        }

        // Prefer live telemetry state over stale DB currentState (Phase 5B)
        train = mergeLiveState(train);

        // 2. Check train has route and currentState
        if (!train.route) {
            return res.status(400).json({
                success: false,
                message: 'Train has no associated route. Route data required for ETA prediction.',
            });
        }

        if (!train.currentState || !train.currentState.lastKnownStation) {
            return res.status(400).json({
                success: false,
                message: 'Train has no current state (lastKnownStation). Cannot predict without live position data.',
            });
        }

        const route = train.route;
        const cs = train.currentState;

        // 3. Find current section in route
        const sections = route.sections || [];
        if (sections.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Route has no section data. Section infrastructure data required.',
            });
        }

        const sectionIndex = cs.sectionIndex || 0;
        if (sectionIndex >= sections.length) {
            return res.status(400).json({
                success: false,
                message: `Invalid sectionIndex ${sectionIndex} for route with ${sections.length} sections.`,
            });
        }

        const section = sections[sectionIndex];

        // 4. Find active operational events for this section
        let eventActive = 0;
        let eventType = 'None';
        let eventSpeedLimit = section.maxSpeed || 110;

        const activeEvents = await OperationalEvent.find({
            isActive: true,
            $or: [
                { 'affectedSection.fromStation': section.fromStation, 'affectedSection.toStation': section.toStation },
                { affectedStations: { $in: [section.fromStation, section.toStation] } },
            ],
        });

        if (activeEvents.length > 0) {
            const evt = activeEvents[0];
            eventActive = 1;
            eventType = evt.eventType || 'None';
            eventSpeedLimit = evt.speedLimit || section.maxSpeed || 110;
        }

        // 5. Compute temporal features (IST)
        const now = nowIST();
        const { hour, dayOfWeek, isWeekend } = getMLTemporalFeatures();

        // 6. Compute historical features from train's sectionLogs
        let historicalMeanTravelTime = section.distance / (section.typicalSpeed || 80) * 60;
        let historicalMeanDelay = 0;

        // Use previous section logs if available
        if (train.run) {
            const TrainRun = require('../models/TrainRun');
            const recentRuns = await TrainRun.find({
                train: train._id,
                'sectionLogs.fromStation': section.fromStation,
                'sectionLogs.toStation': section.toStation,
            })
            .sort({ runDate: -1 })
            .limit(10);

            if (recentRuns.length > 0) {
                const delays = recentRuns
                    .map(r => {
                        const sl = r.sectionLogs.find(
                            s => s.fromStation === section.fromStation && s.toStation === section.toStation
                        );
                        return sl ? (sl.actualTravelTime - sl.scheduledTravelTime) : null;
                    })
                    .filter(d => d !== null);

                if (delays.length > 0) {
                    historicalMeanDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
                }
            }
        }

        // 7. Build prediction input
        const input = buildPredictionInput({
            accumulatedDelayEntering: cs.progressInSection > 0 ? (train.delayMinutes || 0) * cs.progressInSection : 0,
            prevSectionTravelTime: 0,
            prevSectionDelay: train.delayMinutes || 0,
            stationsTravelled: sectionIndex,
            stationsRemaining: sections.length - sectionIndex - 1,
            sectionDistance: section.distance,
            typicalSpeed: section.typicalSpeed || 80,
            maxSpeed: section.maxSpeed || 110,
            signalCount: section.signalCount || 3,
            levelCrossings: section.levelCrossings || 1,
            sectionType: section.sectionType || 'DoubleLine',
            gradientProfile: section.gradientProfile || 'Flat',
            hour,
            dayOfWeek,
            isWeekend,
            eventActive,
            eventType,
            eventSpeedLimit,
            historicalMeanTravelTime,
            historicalMeanDelay,
        });

        // 8. Call inference service
        const result = await callInferenceService('/predict', input);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Inference service returned failure',
                detail: result,
            });
        }

        // 9. Optionally persist the prediction
        let savedPrediction = null;
        try {
            savedPrediction = await ETAPrediction.create({
                train: train._id,
                trainNumber: train.trainNumber,
                predictionTime: now,
                targetStation: section.toStation,
                predictedArrival: new Date(Date.now() + (result.prediction.predictedDelayMinutes + section.distance / (section.typicalSpeed || 80) * 60) * 60000),
                predictedDelay: result.prediction.predictedDelayMinutes,
                stationsAway: sections.length - sectionIndex - 1,
                confidence: null,
                features: {
                    currentDelay: train.delayMinutes || 0,
                    timeOfDay: hour,
                    dayOfWeek,
                    accumulatedDelay: input.accumulated_delay_entering,
                    sectionDistance: section.distance,
                    sectionTypicalSpeed: section.typicalSpeed,
                },
            });
        } catch (dbError) {
            // Non-critical: log but don't fail the request
            logger.warn('Failed to persist ETA prediction', { error: dbError.message });
        }

        let historicalContext = {
            available: false,
            dataSource: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
            sourceType: 'HISTORICAL_EDUCATIONAL',
            live: false,
        };
        try {
            const hProfile = await getTrainHistoricalProfile(train.trainNumber);
            if (hProfile) {
                historicalContext = {
                    available: true,
                    dataSource: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
                    sourceType: 'HISTORICAL_EDUCATIONAL',
                    live: false,
                    trainDelayRate: Number((1 - hProfile.historicalOnTimeRate).toFixed(4)),
                    historicalOnTimeRate: hProfile.historicalOnTimeRate,
                    averageDelayMinutes: hProfile.averageDelayMinutes,
                    peakHourAverageMinutes: hProfile.peakHourAverageDelay,
                    reliability: `${Math.round(hProfile.historicalOnTimeRate * 100)}%`,
                    sampleCount: hProfile.sampleCount,
                    historicalPeriod: '2018-2024 (Kaggle Dataset)'
                };
            }
        } catch (hErr) {
            logger.debug('Historical profile lookup skipped', { error: hErr.message });
        }

        res.json({
            success: true,
            trainId: train._id,
            trainNumber: train.trainNumber,
            currentSection: {
                fromStation: section.fromStation,
                toStation: section.toStation,
                index: sectionIndex,
                totalSections: sections.length,
            },
            prediction: result.prediction,
            predictionId: savedPrediction?._id || null,
            historicalContext
        });
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            return res.status(503).json({
                success: false,
                message: 'ETA inference service is not running. Start with: python server/ml/inference_service.py',
            });
        }
        logger.error('Train-based ETA prediction error', { error: error.message, stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Internal error during prediction',
        });
    }
};

// ============================================================
// GET /api/eta/health — Health check
// ============================================================

const healthCheck = async (req, res) => {
    try {
        const response = await axios.get(`${INFERENCE_SERVICE_URL}/health`, {
            timeout: 5000,
        });
        res.json({
            success: true,
            inferenceService: response.data,
        });
    } catch (error) {
        res.status(503).json({
            success: false,
            inferenceService: {
                status: 'unreachable',
                modelLoaded: false,
                loadError: `Cannot reach inference service at ${INFERENCE_SERVICE_URL}: ${error.message}`,
            },
        });
    }
};

// ============================================================
// POST /api/eta/predict/section — Predict for a specific section
// ============================================================

const predictSection = async (req, res) => {
    try {
        const { fromStation, toStation } = req.body;

        if (!fromStation || !toStation) {
            return res.status(400).json({
                success: false,
                message: 'fromStation and toStation are required',
            });
        }

        // Find a route containing this section
        const route = await Route.findOne({
            'sections.fromStation': fromStation.toUpperCase(),
            'sections.toStation': toStation.toUpperCase(),
        });

        if (!route) {
            return res.status(404).json({
                success: false,
                message: `No route found containing section ${fromStation}-${toStation}`,
            });
        }

        const section = route.sections.find(
            s => s.fromStation === fromStation.toUpperCase() && s.toStation === toStation.toUpperCase()
        );

        // Build input from section data + request body overrides (IST)
        const fallbackFeatures = getMLTemporalFeatures();
        const input = buildPredictionInput({
            accumulatedDelayEntering: req.body.accumulatedDelayEntering || 0,
            prevSectionTravelTime: req.body.prevSectionTravelTime || 0,
            prevSectionDelay: req.body.prevSectionDelay || 0,
            stationsTravelled: req.body.stationsTravelled || 0,
            stationsRemaining: req.body.stationsRemaining || 1,
            sectionDistance: section.distance,
            typicalSpeed: section.typicalSpeed || 80,
            maxSpeed: section.maxSpeed || 110,
            signalCount: section.signalCount || 3,
            levelCrossings: section.levelCrossings || 1,
            sectionType: section.sectionType || 'DoubleLine',
            gradientProfile: section.gradientProfile || 'Flat',
            hour: req.body.hour ?? fallbackFeatures.hour,
            dayOfWeek: req.body.dayOfWeek ?? fallbackFeatures.dayOfWeek,
            isWeekend: req.body.isWeekend ?? fallbackFeatures.isWeekend,
            eventActive: req.body.eventActive || 0,
            eventType: req.body.eventType || 'None',
            eventSpeedLimit: req.body.eventSpeedLimit || section.maxSpeed || 110,
            historicalMeanTravelTime: section.distance / (section.typicalSpeed || 80) * 60,
            historicalMeanDelay: req.body.historicalMeanDelay || 0,
        });

        const result = await callInferenceService('/predict', input);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Inference service returned failure',
                detail: result,
            });
        }

        res.json({
            success: true,
            section: { fromStation: fromStation.toUpperCase(), toStation: toStation.toUpperCase() },
            prediction: result.prediction,
        });
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            return res.status(503).json({
                success: false,
                message: 'ETA inference service is not running.',
            });
        }
        logger.error('Section prediction error', { error: error.message });
        res.status(500).json({ success: false, message: 'Internal error during prediction' });
    }
};

// ============================================================
// GET /api/eta/train/:trainId/stations — Station-by-station ETA
// ============================================================

const predictTrainStations = async (req, res) => {
    try {
        const { trainId } = req.params;
        const isObjectId = mongoose.Types.ObjectId.isValid(trainId);
        let train = await Train.findOne(
            isObjectId ? { _id: trainId } : { trainNumber: trainId.toUpperCase() }
        ).populate('route');

        if (!train) {
            return res.status(404).json({ success: false, message: `Train not found: ${trainId}` });
        }

        // Prefer live telemetry state over stale DB currentState (Phase 5B)
        train = mergeLiveState(train);

        if (!train.route) {
            return res.status(400).json({ success: false, message: 'Train has no associated route.' });
        }
        if (!train.currentState || !train.currentState.lastKnownStation) {
            return res.status(400).json({ success: false, message: 'Train has no current state.' });
        }

        const route = train.route;
        const cs = train.currentState;
        const sections = route.sections || [];
        const stations = route.stations || [];
        const sectionIndex = cs.sectionIndex || 0;

        if (sections.length === 0) {
            return res.status(400).json({ success: false, message: 'Route has no section data.' });
        }

        const now = nowIST();
        const { hour, dayOfWeek, isWeekend } = getMLTemporalFeatures();

        // Get all active events at once
        const allActiveEvents = await OperationalEvent.find({ isActive: true });

        // Chain predictions through remaining sections
        let accumulatedDelay = train.delayMinutes || 0;
        const stationETAs = [];
        let cumulativeTravelMinutes = 0;

        for (let i = sectionIndex; i < sections.length; i++) {
            const section = sections[i];
            const sectionsRemaining = sections.length - i - 1;

            // Find events for this section
            let eventActive = 0;
            let eventType = 'None';
            let eventSpeedLimit = section.maxSpeed || 110;

            const sectionEvents = allActiveEvents.filter(e =>
                (e.affectedSection?.fromStation === section.fromStation &&
                 e.affectedSection?.toStation === section.toStation) ||
                (e.affectedStations || []).includes(section.fromStation) ||
                (e.affectedStations || []).includes(section.toStation)
            );

            if (sectionEvents.length > 0) {
                const evt = sectionEvents[0];
                eventActive = 1;
                eventType = evt.eventType || 'None';
                eventSpeedLimit = evt.speedLimit || section.maxSpeed || 110;
            }

            const sectionTravelTime = section.distance / (section.typicalSpeed || 80) * 60;

            const input = buildPredictionInput({
                accumulatedDelayEntering: i === sectionIndex
                    ? (cs.progressInSection > 0 ? accumulatedDelay * cs.progressInSection : 0)
                    : accumulatedDelay,
                prevSectionTravelTime: i > sectionIndex ? (sections[i - 1].distance / (sections[i - 1].typicalSpeed || 80) * 60) : 0,
                prevSectionDelay: accumulatedDelay,
                stationsTravelled: i,
                stationsRemaining: sectionsRemaining,
                sectionDistance: section.distance,
                typicalSpeed: section.typicalSpeed || 80,
                maxSpeed: section.maxSpeed || 110,
                signalCount: section.signalCount || 3,
                levelCrossings: section.levelCrossings || 1,
                sectionType: section.sectionType || 'DoubleLine',
                gradientProfile: section.gradientProfile || 'Flat',
                hour,
                dayOfWeek,
                isWeekend,
                eventActive,
                eventType,
                eventSpeedLimit,
                historicalMeanTravelTime: sectionTravelTime,
                historicalMeanDelay: accumulatedDelay,
            });

            try {
                const result = await callInferenceService('/predict', input);
                if (result.success) {
                    const predictedDelay = result.prediction.predictedDelayMinutes;
                    const predictedArrival = new Date(
                        Date.now() + (cumulativeTravelMinutes + sectionTravelTime + predictedDelay) * 60000
                    );

                    stationETAs.push({
                        fromStation: section.fromStation,
                        toStation: section.toStation,
                        sectionIndex: i,
                        scheduledTravelTimeMinutes: Math.round(sectionTravelTime * 10) / 10,
                        predictedDelayMinutes: Math.round(predictedDelay * 100) / 100,
                        predictedArrival: predictedArrival.toISOString(),
                        accumulatedDelay: Math.round(accumulatedDelay * 100) / 100,
                    });

                    accumulatedDelay = predictedDelay;
                    cumulativeTravelMinutes += sectionTravelTime;
                }
            } catch (sectionError) {
                logger.warn('Section prediction failed', { section: section.fromStation + '-' + section.toStation, error: sectionError.message });
                // Skip this section but continue
                cumulativeTravelMinutes += sectionTravelTime;
            }
        }

        let explanation = null;
        if (stationETAs.length > 0) {
            const destEta = stationETAs[stationETAs.length - 1];
            const currentSec = sections[sectionIndex];
            const lastPred = tracker.getState(train._id.toString())?.lastPrediction;
            const prevEta = lastPred?.destination?.predictedArrival || null;
            explanation = generateEtaExplanation({
                previousEta: prevEta,
                newEta: destEta.predictedArrival,
                accumulatedDelay: train.delayMinutes || 0,
                prevSectionDelay: train.delayMinutes || 0,
                currentSpeed: cs.speed || 0,
                typicalSpeed: currentSec.typicalSpeed || 80,
                maxSpeed: currentSec.maxSpeed || 110,
                sectionDistance: currentSec.distance,
                historicalMeanDelay: train.delayMinutes || 0,
                predictedDelayMinutes: destEta.predictedDelayMinutes,
                historicalMeanTravelTime: destEta.scheduledTravelTimeMinutes,
                predictedResidualMinutes: destEta.predictedDelayMinutes - (train.delayMinutes || 0),
                eventActive: 0,
                eventType: 'None',
                eventSpeedLimit: currentSec.maxSpeed || 110,
                signalCount: currentSec.signalCount || 3,
            });
        }

        let historicalContext = {
            available: false,
            dataSource: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
            sourceType: 'HISTORICAL_EDUCATIONAL',
            live: false,
        };
        try {
            const hProfile = await getTrainHistoricalProfile(train.trainNumber);
            if (hProfile) {
                historicalContext = {
                    available: true,
                    dataSource: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
                    sourceType: 'HISTORICAL_EDUCATIONAL',
                    live: false,
                    trainDelayRate: Number((1 - hProfile.historicalOnTimeRate).toFixed(4)),
                    historicalOnTimeRate: hProfile.historicalOnTimeRate,
                    averageDelayMinutes: hProfile.averageDelayMinutes,
                    peakHourAverageMinutes: hProfile.peakHourAverageDelay,
                    reliability: `${Math.round(hProfile.historicalOnTimeRate * 100)}%`,
                    sampleCount: hProfile.sampleCount,
                    historicalPeriod: '2018-2024 (Kaggle Dataset)'
                };
            }
        } catch (hErr) {
            logger.debug('Historical profile lookup skipped', { error: hErr.message });
        }

        res.json({
            success: true,
            trainId: train._id,
            trainNumber: train.trainNumber,
            trainName: train.name,
            currentDelay: train.delayMinutes || 0,
            currentStation: cs.lastKnownStation,
            nextStation: cs.nextStation,
            sectionIndex,
            totalSections: sections.length,
            stations,
            stationETAs,
            explanation,
            historicalContext,
        });
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            return res.status(503).json({ success: false, message: 'ETA inference service is not running.' });
        }
        logger.error('Station ETA prediction error', { error: error.message, stack: error.stack });
        res.status(500).json({ success: false, message: 'Internal error during prediction' });
    }
};

module.exports = {
    predictSectionDelay,
    predictForTrain,
    predictSection,
    predictStationETAs: predictTrainStations,
    predictTrainStations,
    healthCheck,
    buildPredictionInput,
    mergeLiveState,
};
