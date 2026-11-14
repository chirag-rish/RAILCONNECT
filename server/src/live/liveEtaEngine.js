/**
 * SIH26028 — Phase 5B: Live ETA Engine
 *
 * Dynamically triggers ML-based ETA predictions when new live
 * telemetry is ingested by the LiveTrainTracker.
 *
 * Data flow:
 *   New Telemetry → LiveTrainTracker → LiveETAEngine
 *       → Feature Construction → Python XGBoost Inference
 *       → Station-by-Station ETA → ETAPrediction Storage
 *       → Socket.io ETA Update
 *
 * Throttling:
 *   - Per-train minimum interval: 30 seconds
 *   - Section change: bypasses throttle (immediate re-predict)
 *   - Delay change > 2 minutes: bypasses throttle
 *   - Max predictions per train per minute: 4
 */

const axios = require('axios');
const mongoose = require('mongoose');
const Train = require('../models/Train');
const Station = require('../models/Station');
const OperationalEvent = require('../models/OperationalEvent');
const ETAPrediction = require('../models/ETAPrediction');
const logger = require('../utils/logger');
const { getMLTemporalFeatures, nowIST } = require('../utils/istTime');
const { generateEtaExplanation } = require('./etaExplanationEngine');
const { getTrainHistoricalProfile } = require('../services/historical');
const { getWeather } = require('../services/weather/service');

function getInferenceUrl() {
  return process.env.ETA_INFERENCE_URL || 'http://127.0.0.1:8001';
}

const INFERENCE_TIMEOUT = parseInt(process.env.ETA_INFERENCE_TIMEOUT || '10000', 10);

// Weather cache: coords → { data, timestamp } with 30-min TTL to avoid
// hammering Open-Meteo on every telemetry tick.
const weatherCache = new Map();
const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000;
const WEATHER_FETCH_TIMEOUT = 4500;

async function _fetchWeatherForTrain(telemetry, section) {
  let lat = telemetry.latitude;
  let lng = telemetry.longitude;

  if (lat == null || lng == null) {
    if (section && section.fromStation) {
      try {
        const st = await Station.findOne({ code: section.fromStation }).lean();
        if (st && st.latitude != null && st.longitude != null) {
          lat = st.latitude;
          lng = st.longitude;
        }
      } catch (_) {}
    }
    if (lat == null || lng == null) return null;
  }

  const cacheKey = `${Number(lat).toFixed(2)}:${Number(lng).toFixed(2)}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < WEATHER_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const weather = await getWeather({ latitude: lat, longitude: lng });
    if (!weather || weather.severity == null) return null;
    weatherCache.set(cacheKey, { data: weather, timestamp: Date.now() });
    return weather;
  } catch (err) {
    logger.debug('Weather lookup failed for ETA prediction', { error: err.message });
    return null;
  }
}

function _toWeatherModelInput(weather) {
  if (!weather) return null;
  return {
    weatherTemperature: weather.temperature ?? 25,
    weatherPrecipitation: weather.precipitation ?? 0,
    weatherWindSpeed: weather.windSpeed ?? 10,
    weatherVisibility: weather.visibility ?? 10000,
    weatherSeverity: weather.severity ? (
      weather.severity === 'SEVERE' ? 3
      : weather.severity === 'CAUTION' ? 2
      : weather.precipitation > 0.5 && weather.precipitation <= 10 ? 1
      : 0
    ) : 0,
    weatherAvailable: weather.isStale === false,
  };
}

// Reset weather cache for tests
function _clearWeatherCache() {
  weatherCache.clear();
}

// ============================================================
// THROTTLING CONSTANTS
// ============================================================

const THROTTLE = Object.freeze({
  MIN_INTERVAL_MS: 30_000,       // 30 seconds between predictions per train
  MAX_PER_MINUTE: 4,             // max 4 predictions per train per minute
  DELAY_CHANGE_THRESHOLD: 2.0,   // minutes — bypass throttle if delay changes by this much
  SECTION_CHANGE_BYPASS: true,   // always re-predict on section change
});

// ============================================================
// ENGINE STATE
// ============================================================

/** @type {Map<string, Object>} trainId → throttle + last prediction state */
const trainState = new Map();

/** @type {Object|null} Socket.io instance (set via setIo) */
let io = null;

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Attach Socket.io for ETA event emission.
 * @param {Object} ioInstance
 */
function setIo(ioInstance) {
  io = ioInstance;
}

/**
 * Called by LiveTrainTracker after successful telemetry ingestion.
 * Decides whether to trigger an ML ETA prediction for this train.
 *
 * @param {Object} telemetry - Normalized telemetry from tracker
 */
async function onTelemetryIngested(telemetry) {
  if (!telemetry || !telemetry.trainId) return;
  if (telemetry.isStale) return;

  const trainId = telemetry.trainId;

  // Check throttle
  if (!shouldPredictNow(trainId, telemetry)) return;

  // Run prediction and return promise so callers can await it
  return _predictForTrain(telemetry).catch(err => {
    logger.error('Live ETA prediction failed', {
      trainNumber: telemetry.trainNumber,
      error: err.message,
    });
  });
}

/**
 * Get the latest ETA prediction for a train (from in-memory cache).
 * @param {string} trainId
 * @returns {Object|null}
 */
function getLatestPrediction(trainId) {
  const state = trainState.get(trainId);
  return state ? state.lastPrediction : null;
}

/**
 * Get engine health/status.
 * @returns {Object}
 */
function getEngineHealth() {
  let totalPredicted = 0;
  let totalThrottled = 0;
  let trainsTracked = 0;

  for (const [, s] of trainState) {
    trainsTracked++;
    totalPredicted += s.predictionCount;
    totalThrottled += s.throttledCount;
  }

  return {
    trainsTracked,
    totalPredicted,
    totalThrottled,
    throttle: { ...THROTTLE },
  };
}

// ============================================================
// THROTTLING LOGIC
// ============================================================

/**
 * Decide whether a prediction should run now for this train.
 * @param {string} trainId
 * @param {Object} telemetry
 * @returns {boolean}
 */
function shouldPredictNow(trainId, telemetry) {
  const now = Date.now();
  const state = trainState.get(trainId);

  if (!state) {
    // First telemetry for this train — always predict
    _initTrainState(trainId);
    return true;
  }

  // Section change → always predict
  if (THROTTLE.SECTION_CHANGE_BYPASS && telemetry.sectionIndex !== state.lastSectionIndex) {
    return true;
  }

  // Meaningful delay change → predict
  const delayDelta = Math.abs((telemetry.accumulatedDelay || 0) - (state.lastDelay || 0));
  if (delayDelta >= THROTTLE.DELAY_CHANGE_THRESHOLD) {
    return true;
  }

  // Stopped -> moving transition → predict
  const prevSpeed = state.lastSpeed || 0;
  const currentSpeed = telemetry.speed || 0;
  if (prevSpeed === 0 && currentSpeed > 0) {
    return true;
  }

  // Minimum interval check
  const elapsed = now - state.lastPredictionTime;
  if (elapsed < THROTTLE.MIN_INTERVAL_MS) {
    state.throttledCount++;
    return false;
  }

  // Max per minute check
  const oneMinuteAgo = now - 60_000;
  const recentPredictions = state.recentPredictionTimes.filter(t => t > oneMinuteAgo);
  if (recentPredictions.length >= THROTTLE.MAX_PER_MINUTE) {
    state.throttledCount++;
    return false;
  }

  return true;
}

function _initTrainState(trainId) {
  trainState.set(trainId, {
    lastSectionIndex: -1,
    lastDelay: 0,
    lastSpeed: 0,
    lastPredictionTime: 0,
    predictionCount: 0,
    throttledCount: 0,
    recentPredictionTimes: [],
    lastPrediction: null,
  });
}

function _updateTrainState(trainId, telemetry, prediction) {
  let state = trainState.get(trainId);
  if (!state) {
    state = {
    lastSectionIndex: -1,
    lastDelay: 0,
    lastSpeed: 0,
    lastPredictionTime: 0,
      predictionCount: 0,
      throttledCount: 0,
      recentPredictionTimes: [],
      lastPrediction: null,
    };
    trainState.set(trainId, state);
  }

  const now = Date.now();
  state.lastSectionIndex = telemetry.sectionIndex;
  state.lastDelay = telemetry.accumulatedDelay || 0;
  state.lastSpeed = telemetry.speed || 0;
  state.lastPredictionTime = now;
  state.predictionCount++;
  state.recentPredictionTimes.push(now);

  // Prune old timestamps (keep last 60 seconds)
  const oneMinuteAgo = now - 60_000;
  state.recentPredictionTimes = state.recentPredictionTimes.filter(t => t > oneMinuteAgo);

  state.lastPrediction = prediction;
}

// ============================================================
// CORE PREDICTION PIPELINE
// ============================================================

/**
 * Full prediction pipeline for a single train.
 * 1. Load train + route from DB
 * 2. Construct features
 * 3. Call Python inference for each remaining section
 * 4. Compute station-by-station ETA
 * 5. Store predictions
 * 6. Emit Socket.io event
 */
async function _predictForTrain(telemetry) {
  const trainId = telemetry.trainId;

  // 1. Load train with route from DB
  const train = await Train.findOne({ _id: trainId }).populate('route');
  if (!train || !train.route) return;

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
  } catch (err) {
    logger.debug('Historical context lookup skipped in live engine', { error: err.message });
  }

  const route = train.route;
  const sections = route.sections || [];
  const stations = route.stations || [];
  if (sections.length === 0) return;

  const sectionIndex = telemetry.sectionIndex || 0;
  if (sectionIndex >= sections.length) return;

  const currentSection = sections[sectionIndex];

  // 2. Find active operational events for this section
  const eventInfo = await _getOperationalEvent(currentSection);

  // Phase 3A: Fetch current weather for the train's location (cached)
  const weather = await _fetchWeatherForTrain(telemetry, currentSection);
  const weatherInput = _toWeatherModelInput(weather);

  // 3. Build prediction input for the current section (IST)
  const now = nowIST();
  const { hour, dayOfWeek, isWeekend } = getMLTemporalFeatures();

  // Historical features from DB
  const historical = await _getHistoricalFeatures(train, currentSection);

  const predictionInput = _buildPredictionInput({
    accumulatedDelayEntering: _computeAccumulatedDelayEntering(telemetry, currentSection),
    prevSectionTravelTime: _computePrevSectionTime(sections, sectionIndex),
    prevSectionDelay: telemetry.accumulatedDelay || 0,
    stationsTravelled: sectionIndex,
    stationsRemaining: sections.length - sectionIndex - 1,
    sectionDistance: currentSection.distance,
    typicalSpeed: currentSection.typicalSpeed || 80,
    maxSpeed: currentSection.maxSpeed || 110,
    signalCount: currentSection.signalCount || 3,
    levelCrossings: currentSection.levelCrossings || 1,
    sectionType: currentSection.sectionType || 'DoubleLine',
    gradientProfile: currentSection.gradientProfile || 'Flat',
    hour,
    dayOfWeek,
    isWeekend,
    eventActive: eventInfo.active ? 1 : 0,
    eventType: eventInfo.type,
    eventSpeedLimit: eventInfo.speedLimit,
    historicalMeanTravelTime: historical.meanTravelTime,
    historicalMeanDelay: historical.meanDelay,
    weather: weatherInput,
  });

  // 4. Call Python inference service
  let currentPrediction;
  try {
    const result = await callInferenceService('/predict', predictionInput);
    if (!result.success) {
      logger.warn('Inference service returned failure', { trainNumber: telemetry.trainNumber });
      return;
    }
    currentPrediction = result.prediction;
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      logger.debug('Inference service unavailable — skipping ETA prediction');
    } else {
      logger.error('Inference call failed', { trainNumber: telemetry.trainNumber, error: err.message });
    }
    return;
  }

  // 5. Chain predictions through remaining sections for station-by-station ETA
  const stationETAs = await _chainStationPredictions(
    train, sections, sectionIndex, telemetry, eventInfo, hour, dayOfWeek, isWeekend, weatherInput
  );

  // 6. Determine destination prediction
  const destinationETA = stationETAs.length > 0
    ? stationETAs[stationETAs.length - 1]
    : null;

  // 7. Compute scheduled arrival for destination
  const scheduledArrival = _getScheduledArrival(stations);

  // 8. Build the explanation object
  const lastState = trainState.get(trainId);
  const previousPrediction = lastState ? lastState.lastPrediction : null;
  const previousEta = previousPrediction && previousPrediction.destination ? previousPrediction.destination.predictedArrival : null;
  const newEta = destinationETA ? destinationETA.predictedArrival : null;

  const explanation = generateEtaExplanation({
    previousEta,
    newEta,
    accumulatedDelay: telemetry.accumulatedDelay || 0,
    prevSectionDelay: telemetry.accumulatedDelay || 0,
    currentSpeed: telemetry.speed || 0,
    typicalSpeed: currentSection.typicalSpeed || 80,
    maxSpeed: currentSection.maxSpeed || 110,
    sectionDistance: currentSection.distance,
    historicalMeanDelay: historical.meanDelay,
    predictedDelayMinutes: currentPrediction.predictedDelayMinutes,
    historicalMeanTravelTime: historical.meanTravelTime,
    predictedResidualMinutes: currentPrediction.predictedResidualMinutes,
    eventActive: eventInfo.active ? 1 : 0,
    eventType: eventInfo.type,
    eventSpeedLimit: eventInfo.speedLimit,
    signalCount: currentSection.signalCount || 3,
    weather: weather,
    weatherUsed: Boolean(currentPrediction.weatherUsed),
  });

  // 9. Build the prediction object
  const prediction = {
    trainId: train._id,
    trainNumber: train.trainNumber,
    trainName: train.name,
    predictionTime: now,
    source: telemetry.source,
    telemetryTimestamp: telemetry.timestamp,
    currentStation: telemetry.currentStation,
    nextStation: telemetry.nextStation,
    sectionIndex,
    totalSections: sections.length,

    explanation,
    historicalContext,

    // Current section ML prediction
    currentSectionPrediction: {
      fromStation: currentSection.fromStation,
      toStation: currentSection.toStation,
      predictedDelayMinutes: Math.round(currentPrediction.predictedDelayMinutes * 100) / 100,
      historicalMeanDelayMinutes: currentPrediction.historicalMeanDelayMinutes,
      predictedResidualMinutes: currentPrediction.predictedResidualMinutes,
      model: currentPrediction.model,
      modelVersion: currentPrediction.modelVersion,
    },

    // Phase 3A: Weather context used in this prediction
    weatherContext: weather ? {
      temperature: weather.temperature,
      precipitation: weather.precipitation,
      windSpeed: weather.windSpeed,
      visibility: weather.visibility,
      severity: weather.severity,
      source: weather.source,
      stale: weather.isStale || false,
    } : null,

    // Destination ETA
    destination: destinationETA ? {
      station: destinationETA.toStation,
      scheduledArrival,
      predictedArrival: destinationETA.predictedArrival,
      predictedDelayMinutes: destinationETA.predictedDelayMinutes,
      stationsAway: sections.length - sectionIndex - 1,
    } : null,

    // Station-by-station ETAs
    stationETAs,

    // Quality indicators (NOT fake confidence)
    quality: {
      telemetrySource: telemetry.source,
      freshness: telemetry.isStale ? 'STALE' : 'FRESH',
      inferenceServiceAvailable: true,
      sectionCount: sections.length - sectionIndex,
    },
  };

  // 9. Persist to ETAPrediction (debounced — only destination)
  await _persistPrediction(prediction, train);

  // 10. Emit Socket.io ETA update
  _emitETAUpdate(prediction);

  // 11. Update engine state
  _updateTrainState(trainId, telemetry, prediction);
}

// ============================================================
// FEATURE CONSTRUCTION
// ============================================================

/**
 * Build the 20 raw features expected by the Python inference service.
 * These map directly to the PredictionInput schema in inference_service.py.
 */
function _buildPredictionInput(params) {
  const weather = params.weather || null;
  const input = {
    accumulated_delay_entering: Number(params.accumulatedDelayEntering ?? 0),
    prev_section_travel_time: Number(params.prevSectionTravelTime ?? 0),
    prev_section_delay: Number(params.prevSectionDelay ?? 0),
    stations_travelled: Number(params.stationsTravelled ?? 0),
    stations_remaining: Number(params.stationsRemaining ?? 1),
    section_distance: Number(params.sectionDistance ?? 100),
    typical_speed: Number(params.typicalSpeed ?? 80),
    max_speed: Number(params.maxSpeed ?? 110),
    signal_count: Number(params.signalCount ?? 3),
    level_crossings: Number(params.levelCrossings ?? 1),
    section_type: String(params.sectionType ?? 'DoubleLine'),
    gradient_profile: String(params.gradientProfile ?? 'Flat'),
    hour: Number(params.hour ?? 12),
    day_of_week: Number(params.dayOfWeek ?? 0),
    is_weekend: Number(params.isWeekend ?? 0),
    event_active: Number(params.eventActive ?? 0),
    event_type: String(params.eventType ?? 'None'),
    event_speed_limit: Number(params.eventSpeedLimit ?? 110),
    historical_mean_travel_time: Number(params.historicalMeanTravelTime ?? 0),
    historical_mean_delay: Number(params.historicalMeanDelay ?? 0),
  };

  // Phase 3A: Weather features (only included when weather is available)
  // The base 37-feature model ignores these; the weather-aware model uses them.
  if (weather && weather.weatherAvailable !== false) {
    input.weather_temperature = Number(weather.temperature ?? 25);
    input.weather_precipitation = Number(weather.precipitation ?? 0);
    input.weather_wind_speed = Number(weather.windSpeed ?? 10);
    input.weather_visibility = Number(weather.visibility ?? 10000);
    input.weather_severity = Number(weather.severityLevel ?? 0);
  }

  return input;
}

function _computeAccumulatedDelayEntering(telemetry, section) {
  const progress = telemetry.progressInSection || 0;
  const delay = telemetry.accumulatedDelay || 0;
  // Scale delay by progress through section
  return progress > 0 ? delay * (progress / (section.distance || 1)) : 0;
}

function _computePrevSectionTime(sections, currentIndex) {
  if (currentIndex <= 0) return 0;
  const prev = sections[currentIndex - 1];
  return (prev.distance || 100) / (prev.typicalSpeed || 80) * 60;
}

// ============================================================
// OPERATIONAL EVENTS
// ============================================================

async function _getOperationalEvent(section) {
  try {
    const events = await OperationalEvent.find({
      isActive: true,
      $or: [
        { 'affectedSection.fromStation': section.fromStation, 'affectedSection.toStation': section.toStation },
        { affectedStations: { $in: [section.fromStation, section.toStation] } },
      ],
    });

    if (events.length > 0) {
      const evt = events[0];
      return {
        active: true,
        type: evt.eventType || 'None',
        speedLimit: evt.speedLimit || section.maxSpeed || 110,
      };
    }
  } catch (err) {
    logger.warn('Failed to query operational events', { error: err.message });
  }

  return { active: false, type: 'None', speedLimit: section.maxSpeed || 110 };
}

// ============================================================
// HISTORICAL FEATURES
// ============================================================

async function _getHistoricalFeatures(train, section) {
  const meanTravelTime = section.distance / (section.typicalSpeed || 80) * 60;
  let meanDelay = 0;

  try {
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
        meanDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
      }
    }
  } catch (err) {
    logger.debug('No historical data available', { trainNumber: train.trainNumber });
  }

  return { meanTravelTime, meanDelay };
}

// ============================================================
// STATION-BY-STATION ETA CHAINING
// ============================================================

async function _chainStationPredictions(train, sections, startSectionIndex, telemetry, firstEventInfo, hour, dayOfWeek, isWeekend, weatherInput = null) {
  const stationETAs = [];
  let accumulatedDelay = telemetry.accumulatedDelay || 0;
  let cumulativeTravelMinutes = 0;
  const now = Date.now();

  // Batch-fetch all active events once
  let allActiveEvents = [];
  try {
    allActiveEvents = await OperationalEvent.find({ isActive: true });
  } catch (err) {
    // Non-critical — continue without events
  }

  for (let i = startSectionIndex; i < sections.length; i++) {
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

    // Historical features for this section
    let historicalMeanDelay = accumulatedDelay;
    try {
      const TrainRun = require('../models/TrainRun');
      const runs = await TrainRun.find({
        train: train._id,
        'sectionLogs.fromStation': section.fromStation,
        'sectionLogs.toStation': section.toStation,
      }).sort({ runDate: -1 }).limit(10);

      if (runs.length > 0) {
        const delays = runs.map(r => {
          const sl = r.sectionLogs.find(
            s => s.fromStation === section.fromStation && s.toStation === section.toStation
          );
          return sl ? (sl.actualTravelTime - sl.scheduledTravelTime) : null;
        }).filter(d => d !== null);

        if (delays.length > 0) {
          historicalMeanDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
        }
      }
    } catch (_) { /* continue with default */ }

    const input = _buildPredictionInput({
      accumulatedDelayEntering: i === startSectionIndex
        ? _computeAccumulatedDelayEntering(telemetry, section)
        : accumulatedDelay,
      prevSectionTravelTime: i > startSectionIndex
        ? (sections[i - 1].distance / (sections[i - 1].typicalSpeed || 80) * 60)
        : 0,
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
      historicalMeanDelay,
      weather: weatherInput,
    });

    try {
      const result = await callInferenceService('/predict', input);
      if (result.success) {
        const predictedDelay = result.prediction.predictedDelayMinutes;
        const predictedArrival = new Date(
          now + (cumulativeTravelMinutes + sectionTravelTime + predictedDelay) * 60000
        );

        stationETAs.push({
          fromStation: section.fromStation,
          toStation: section.toStation,
          sectionIndex: i,
          scheduledTravelTimeMinutes: Math.round(sectionTravelTime * 10) / 10,
          predictedDelayMinutes: Math.round(predictedDelay * 100) / 100,
          predictedArrival: predictedArrival.toISOString(),
          accumulatedDelay: Math.round(accumulatedDelay * 100) / 100,
          source: 'XGBoost Residual v2.0.0',
        });

        accumulatedDelay = predictedDelay;
        cumulativeTravelMinutes += sectionTravelTime;
      }
    } catch (sectionError) {
      // Skip failed section, continue chain
      cumulativeTravelMinutes += sectionTravelTime;
    }
  }

  return stationETAs;
}

// ============================================================
// PERSISTENCE
// ============================================================

async function _persistPrediction(prediction, train) {
  if (!prediction.destination) return;

  try {
    await ETAPrediction.create({
      train: prediction.trainId,
      trainNumber: prediction.trainNumber,
      predictionTime: prediction.predictionTime,
      targetStation: prediction.destination.station,
      predictedArrival: new Date(prediction.destination.predictedArrival),
      predictedDelay: prediction.destination.predictedDelayMinutes,
      stationsAway: prediction.destination.stationsAway,
      confidence: null, // No calibrated confidence available
      features: {
        currentDelay: prediction.currentSectionPrediction.historicalMeanDelayMinutes,
        timeOfDay: getMLTemporalFeatures(prediction.predictionTime).hour,
        dayOfWeek: getMLTemporalFeatures(prediction.predictionTime).dayOfWeek,
        accumulatedDelay: prediction.currentSectionPrediction.historicalMeanDelayMinutes,
        sectionDistance: 0, // Filled from section context
        sectionTypicalSpeed: 0,
      },
    });
  } catch (err) {
    logger.warn('Failed to persist live ETA prediction', { error: err.message });
  }
}

// ============================================================
// SCHEDULED ARRIVAL HELPER
// ============================================================

function _getScheduledArrival(stations) {
  if (!stations || stations.length === 0) return null;
  const last = stations[stations.length - 1];
  if (!last.scheduledArrival) return null;
  return last.scheduledArrival; // "HH:MM" string
}

// ============================================================
// SOCKET.IO ETA EMIT
// ============================================================

function _emitETAUpdate(prediction) {
  if (!io) return;

  const payload = {
    trainNumber: prediction.trainNumber,
    trainName: prediction.trainName,
    predictionTime: prediction.predictionTime,
    source: prediction.source,
    currentStation: prediction.currentStation,
    nextStation: prediction.nextStation,
    sectionIndex: prediction.sectionIndex,
    totalSections: prediction.totalSections,

    currentSection: prediction.currentSectionPrediction,
    destination: prediction.destination,
    stationETAs: prediction.stationETAs,
    quality: prediction.quality,
    explanation: prediction.explanation,
    historicalContext: prediction.historicalContext,
  };

  // Per-train ETA room
  io.to(`train:${prediction.trainId}`).emit('train:eta:update', payload);
  // Global ETA broadcast for dashboard consumers
  io.to('eta:all').emit('train:eta:telemetry', payload);
}

// ============================================================
// INFERENCE SERVICE CALL
// ============================================================

async function callInferenceService(endpoint, payload) {
  const url = `${getInferenceUrl()}${endpoint}`;
  const response = await axios.post(url, payload, {
    timeout: INFERENCE_TIMEOUT,
    headers: { 'Content-Type': 'application/json' },
  });
  return response.data;
}

module.exports = {
  onTelemetryIngested,
  getLatestPrediction,
  getEngineHealth,
  shouldPredictNow,
  setIo,
  callInferenceService,
  _buildPredictionInput,
  _initTrainState,
  _updateTrainState,
  _predictForTrain,
  _fetchWeatherForTrain,
  _toWeatherModelInput,
  _clearWeatherCache,
  trainState,
  THROTTLE,
};
