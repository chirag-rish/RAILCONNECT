const mongoose = require('mongoose');

const historicalSummarySchema = mongoose.Schema({
    summaryKey: {
        type: String,
        required: true,
        unique: true,
        default: 'GLOBAL_SUMMARY'
    },
    totalRecords: {
        type: Number,
        default: 0
    },
    dateRange: {
        type: String,
        default: '2018-2024'
    },
    overallDelayRate: {
        type: Number,
        default: 0
    },
    trainCount: {
        type: Number,
        default: 0
    },
    routeCount: {
        type: Number,
        default: 0
    },
    zoneCount: {
        type: Number,
        default: 0
    },
    lastImportedAt: {
        type: Date,
        default: Date.now
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

const HistoricalSummary = mongoose.model('HistoricalSummary', historicalSummarySchema);
module.exports = HistoricalSummary;
