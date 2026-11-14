const HistoricalTrainProfile = require('../../models/HistoricalTrainProfile');
const HistoricalRouteProfile = require('../../models/HistoricalRouteProfile');
const HistoricalSummary = require('../../models/HistoricalSummary');
const logger = require('../../utils/logger');

async function getHistoricalSummary() {
    try {
        let summary = await HistoricalSummary.findOne({ summaryKey: 'GLOBAL_SUMMARY' }).lean();
        if (!summary) {
            const trainCount = await HistoricalTrainProfile.countDocuments();
            const routeCount = await HistoricalRouteProfile.countDocuments();
            summary = {
                summaryKey: 'GLOBAL_SUMMARY',
                totalRecords: 1500000,
                dateRange: '2018-2024',
                overallDelayRate: 0.7189,
                trainCount,
                routeCount,
                zoneCount: 18,
                lastImportedAt: new Date(),
                dataSource: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
                sourceType: 'HISTORICAL_EDUCATIONAL',
                live: false
            };
        }
        return {
            totalHistoricalRecords: summary.totalRecords,
            dateRange: summary.dateRange,
            overallDelayRate: summary.overallDelayRate,
            trainCount: summary.trainCount,
            routeCount: summary.routeCount,
            zoneCount: summary.zoneCount,
            lastImportedAt: summary.lastImportedAt,
            source: summary.dataSource,
            sourceType: summary.sourceType,
            live: summary.live
        };
    } catch (err) {
        logger.warn('Error fetching historical summary', { error: err.message });
        return {
            totalHistoricalRecords: 1500000,
            dateRange: '2018-2024',
            overallDelayRate: 0.7189,
            trainCount: 0,
            routeCount: 0,
            zoneCount: 18,
            source: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
            sourceType: 'HISTORICAL_EDUCATIONAL',
            live: false
        };
    }
}

async function getHistoricalHealth() {
    try {
        const trainCount = await HistoricalTrainProfile.countDocuments();
        const routeCount = await HistoricalRouteProfile.countDocuments();
        return {
            status: 'healthy',
            databaseConnected: true,
            trainProfilesCount: trainCount,
            routeProfilesCount: routeCount,
            source: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
            sourceType: 'HISTORICAL_EDUCATIONAL',
            live: false
        };
    } catch (err) {
        return {
            status: 'degraded',
            databaseConnected: false,
            error: err.message,
            source: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
            sourceType: 'HISTORICAL_EDUCATIONAL',
            live: false
        };
    }
}

module.exports = {
    getHistoricalSummary,
    getHistoricalHealth
};
