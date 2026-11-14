const mongoose = require('mongoose');

const etaPredictionSchema = mongoose.Schema({
    train: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Train'
    },
    trainNumber: {
        type: String,
        required: true
    },
    trainRun: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TrainRun'
    },
    predictionTime: {
        type: Date,
        required: true
    },
    targetStation: {
        type: String,
        required: true
    },
    predictedArrival: {
        type: Date,
        required: true
    },
    actualArrival: {
        type: Date
    },
    predictedDelay: {
        type: Number        // predicted minutes of delay
    },
    actualDelay: {
        type: Number        // actual minutes of delay (filled when train arrives)
    },
    error: {
        type: Number        // actualDelay - predictedDelay
    },
    absoluteError: {
        type: Number        // |error|
    },
    stationsAway: {
        type: Number        // how many stops until target when prediction was made
    },
    confidence: {
        type: Number        // model confidence 0.0 - 1.0
    },
    features: {
        currentDelay:        { type: Number },
        sectionCongestion:   { type: Number },
        timeOfDay:           { type: Number },
        dayOfWeek:           { type: Number },
        weatherCode:         { type: String },
        precedingTrainDelay: { type: Number },
        accumulatedDelay:    { type: Number },
        sectionDistance:     { type: Number },
        sectionTypicalSpeed: { type: Number }
    },
    explanation: [{
        feature: {
            type: String
        },
        impact: {
            type: Number    // minutes contributed
        },
        direction: {
            type: String,
            enum: ['increase', 'decrease']
        }
    }]
}, {
    timestamps: true
});

etaPredictionSchema.index({ trainNumber: 1, predictionTime: -1 });
etaPredictionSchema.index({ targetStation: 1 });
etaPredictionSchema.index({ trainRun: 1 });

const ETAPrediction = mongoose.model('ETAPrediction', etaPredictionSchema);
module.exports = ETAPrediction;
