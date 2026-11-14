const mongoose = require('mongoose');

const operationalEventSchema = mongoose.Schema({
    eventType: {
        type: String,
        required: true,
        enum: [
            'SpeedRestriction',
            'MaintenanceBlock',
            'SignalFailure',
            'TrackWork',
            'WeatherAlert',
            'Fog',
            'Flood',
            'CongestionZone',
            'LevelCrossingDelay',
            'CrewShortage',
            'LocoFailure',
            'Derailment',
            'SecurityAlert'
        ]
    },
    affectedSection: {
        fromStation: { type: String },
        toStation:   { type: String }
    },
    affectedStations: [{
        type: String    // station codes
    }],
    speedLimit: {
        type: Number    // km/h — relevant for SpeedRestriction
    },
    estimatedDuration: {
        type: Number    // minutes
    },
    startTime: {
        type: Date,
        required: true
    },
    endTime: {
        type: Date
    },
    severity: {
        type: String,
        enum: ['Low', 'Medium', 'High', 'Critical'],
        default: 'Medium'
    },
    description: {
        type: String
    },
    source: {
        type: String,
        default: 'Simulator'
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

operationalEventSchema.index({ isActive: 1, 'affectedSection.fromStation': 1 });
operationalEventSchema.index({ startTime: -1 });
operationalEventSchema.index({ eventType: 1, isActive: 1 });

const OperationalEvent = mongoose.model('OperationalEvent', operationalEventSchema);
module.exports = OperationalEvent;
