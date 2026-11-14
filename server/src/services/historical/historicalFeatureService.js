const HistoricalTrainProfile = require('../../models/HistoricalTrainProfile');
const HistoricalRouteProfile = require('../../models/HistoricalRouteProfile');
const logger = require('../../utils/logger');

async function getTrainHistoricalProfile(trainNumber) {
    if (!trainNumber) return null;
    try {
        const profile = await HistoricalTrainProfile.findOne({ trainNumber: String(trainNumber).trim() }).lean();
        if (!profile) return null;
        return {
            trainNumber: profile.trainNumber,
            trainType: profile.trainType,
            sampleCount: profile.sampleCount,
            historicalOnTimeRate: profile.historicalOnTimeRate,
            averageDelayMinutes: profile.averageDelayMinutes,
            peakHourAverageDelay: profile.peakHourAverageDelay,
            weekendAverageDelay: profile.weekendAverageDelay,
            monsoonAverageDelay: profile.monsoonAverageDelay,
            fogRiskAverageDelay: profile.fogRiskAverageDelay,
            congestionRisk: profile.congestionRisk || 0.5,
            lateIncomingRakeDelay: profile.lateIncomingRakeDelay,
            zone: profile.zone,
            dataSource: profile.dataSource || 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
            source: profile.dataSource || 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
            sourceType: profile.sourceType || 'HISTORICAL_EDUCATIONAL',
            live: false
        };
    } catch (err) {
        logger.warn('Error fetching train historical profile', { trainNumber, error: err.message });
        return null;
    }
}

async function getRouteHistoricalProfile(criteria = {}) {
    try {
        const query = {};
        if (criteria.routeKey) query.routeKey = criteria.routeKey;
        if (criteria.zone) query.zone = criteria.zone;
        if (criteria.sourceCategory) query.sourceCategory = criteria.sourceCategory;
        if (criteria.destinationCategory) query.destinationCategory = criteria.destinationCategory;

        const profile = await HistoricalRouteProfile.findOne(query).lean();
        if (!profile) return null;
        return {
            routeKey: profile.routeKey,
            zone: profile.zone,
            sourceCategory: profile.sourceCategory,
            destinationCategory: profile.destinationCategory,
            distance: profile.distance,
            scheduledTravelHours: profile.scheduledTravelHours,
            scheduledStops: profile.scheduledStops,
            historicalOnTimeRate: profile.historicalOnTimeRate,
            averageDelayMinutes: profile.averageDelayMinutes,
            congestionIndex: profile.congestionIndex,
            sampleCount: profile.sampleCount,
            dataSource: profile.dataSource || 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
            source: profile.dataSource || 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
            sourceType: profile.sourceType || 'HISTORICAL_EDUCATIONAL',
            live: false
        };
    } catch (err) {
        logger.warn('Error fetching route historical profile', { criteria, error: err.message });
        return null;
    }
}

async function getHistoricalDelayContext(params = {}) {
    const { trainNumber, departureHour, dayOfWeek, season, zone } = params;
    
    let trainProfile = null;
    if (trainNumber) {
        trainProfile = await getTrainHistoricalProfile(trainNumber);
    }

    const defaultContext = {
        trainNumber: trainNumber || 'UNKNOWN',
        sampleCount: trainProfile ? trainProfile.sampleCount : 0,
        historicalOnTimeRate: trainProfile ? trainProfile.historicalOnTimeRate : 0.70,
        averageDelayMinutes: trainProfile ? trainProfile.averageDelayMinutes : 15.0,
        peakHourAverageDelay: trainProfile ? trainProfile.peakHourAverageDelay : 20.0,
        weekendAverageDelay: trainProfile ? trainProfile.weekendAverageDelay : 12.0,
        monsoonAverageDelay: trainProfile ? trainProfile.monsoonAverageDelay : 25.0,
        fogRiskAverageDelay: trainProfile ? trainProfile.fogRiskAverageDelay : 22.0,
        congestionRisk: trainProfile ? trainProfile.congestionRisk : 0.60,
        lateIncomingRakeDelay: trainProfile ? trainProfile.lateIncomingRakeDelay : 30.0,
        routeHistoricalOnTimeRate: trainProfile ? trainProfile.historicalOnTimeRate : 0.70,
        dataSource: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
        source: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
        sourceType: 'HISTORICAL_EDUCATIONAL',
        live: false
    };

    if (!trainProfile) {
        return defaultContext;
    }

    let adjustedDelay = trainProfile.averageDelayMinutes;
    if (departureHour !== undefined && (departureHour >= 8 && departureHour <= 11 || departureHour >= 17 && departureHour <= 20)) {
        adjustedDelay = trainProfile.peakHourAverageDelay;
    }
    if (dayOfWeek !== undefined && (dayOfWeek === 0 || dayOfWeek === 6)) {
        adjustedDelay = trainProfile.weekendAverageDelay;
    }

    return {
        ...defaultContext,
        averageDelayMinutes: adjustedDelay
    };
}

async function getHistoricalEtaContext(trainNumber) {
    try {
        const profile = await getTrainHistoricalProfile(trainNumber);
        if (!profile) {
            return {
                available: false,
                dataSource: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
                source: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
                sourceType: 'HISTORICAL_EDUCATIONAL',
                live: false
            };
        }
        return {
            available: true,
            historicalOnTimeRate: profile.historicalOnTimeRate,
            averageDelayMinutes: profile.averageDelayMinutes,
            congestionRisk: profile.congestionRisk,
            dataSource: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
            source: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
            sourceType: 'HISTORICAL_EDUCATIONAL',
            live: false
        };
    } catch (err) {
        logger.warn('Historical ETA context lookup failed safely', { trainNumber, error: err.message });
        return {
            available: false,
            error: err.message,
            dataSource: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
            source: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
            sourceType: 'HISTORICAL_EDUCATIONAL',
            live: false
        };
    }
}

module.exports = {
    getTrainHistoricalProfile,
    getRouteHistoricalProfile,
    getHistoricalDelayContext,
    getHistoricalEtaContext
};
