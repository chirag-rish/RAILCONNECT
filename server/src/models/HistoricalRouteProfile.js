const mongoose = require('mongoose');

const historicalRouteProfileSchema = mongoose.Schema({
    routeKey: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    zone: {
        type: String,
        trim: true
    },
    sourceCategory: {
        type: String,
        trim: true
    },
    destinationCategory: {
        type: String,
        trim: true
    },
    distance: {
        type: Number,
        default: 0
    },
    scheduledTravelHours: {
        type: Number,
        default: 0
    },
    scheduledStops: {
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
    congestionIndex: {
        type: Number,
        default: 0
    },
    sampleCount: {
        type: Number,
        default: 0
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

historicalRouteProfileSchema.index({ routeKey: 1 });
historicalRouteProfileSchema.index({ zone: 1, sourceCategory: 1, destinationCategory: 1 });

const HistoricalRouteProfile = mongoose.model('HistoricalRouteProfile', historicalRouteProfileSchema);
module.exports = HistoricalRouteProfile;
