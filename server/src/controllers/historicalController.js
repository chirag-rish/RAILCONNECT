const { getTrainHistoricalProfile, getHistoricalSummary, getHistoricalHealth } = require('../services/historical');

async function getHealth(req, res, next) {
    try {
        const health = await getHistoricalHealth();
        res.json(health);
    } catch (err) {
        next(err);
    }
}

async function getSummary(req, res, next) {
    try {
        const summary = await getHistoricalSummary();
        res.json(summary);
    } catch (err) {
        next(err);
    }
}

async function getTrainProfile(req, res, next) {
    try {
        const { trainNumber } = req.params;
        const profile = await getTrainHistoricalProfile(trainNumber);
        if (!profile) {
            return res.status(404).json({
                message: `Historical profile not found for train number ${trainNumber}`,
                source: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
                sourceType: 'HISTORICAL_EDUCATIONAL',
                live: false
            });
        }
        res.json(profile);
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getHealth,
    getSummary,
    getTrainProfile
};
