const mongoose = require('mongoose');

const historicalTrainProfileSchema = mongoose.Schema({
    trainNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    trainType: {
        type: String,
        trim: true
    },
    sampleCount: {
        type: Number,
        default: 0
    },
    historicalOnTimeRate: {
        type: Number,
        default: 0
    },
    averageDelayMinutes: {
        type: Number,
        default: 0
    },
    medianDelayMinutes: {
        type: Number,
        default: 0
    },
    peakHourAverageDelay: {
        type: Number,
        default: 0
    },
    weekendAverageDelay: {
        type: Number,
        default: 0
    },
    monsoonAverageDelay: {
        type: Number,
        default: 0
    },
    fogRiskAverageDelay: {
        type: Number,
        default: 0
    },
    congestionRisk: {
        type: Number,
        default: 0
    },
    lateIncomingRakeDelay: {
        type: Number,
        default: 0
    },
    routeHistoricalOnTimeRate: {
        type: Number,
        default: 0
    },
    zone: {
        type: String,
        trim: true
    },
    lastHistoricalYear: {
        type: Number
    },
    dataSource: {
        type: String,
        default: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET'
    },
    sourceType: {
        type: String,
        default: 'HISTORICAL_EDUCATIONAL'
    },
    live: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

historicalTrainProfileSchema.index({ trainNumber: 1 });
historicalTrainProfileSchema.index({ zone: 1 });

const HistoricalTrainProfile = mongoose.model('HistoricalTrainProfile', historicalTrainProfileSchema);
module.exports = HistoricalTrainProfile;
