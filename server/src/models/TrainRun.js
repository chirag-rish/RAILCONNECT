const mongoose = require('mongoose');

const DELAY_CAUSES = [
    'SignalHalt',
    'Congestion',
    'PrecedingTrainDelay',
    'SpeedRestriction',
    'MaintenanceBlock',
    'LevelCrossing',
    'WeatherSlow',
    'CrewChange',
    'LocoFailure',
    'PassengerEmergency',
    'UnscheduledStop',
    'Other'
];

const trainRunSchema = mongoose.Schema({
    train: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Train',
        required: true
    },
    route: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Route',
        required: true
    },
    trainNumber: {
        type: String,
        required: true
    },
    runDate: {
        type: Date,
        required: true
    },
    dayOfWeek: {
        type: Number        // 0=Sun, 6=Sat
    },
    stationLogs: [{
        station: {
            type: String    // station code
        },
        sequenceNumber: {
            type: Number
        },
        scheduledArrival: {
            type: Date
        },
        actualArrival: {
            type: Date
        },
        scheduledDeparture: {
            type: Date
        },
        actualDeparture: {
            type: Date
        },
        arrivalDelay: {
            type: Number    // minutes (positive = late)
        },
        departureDelay: {
            type: Number
        },
        platform: {
            type: String
        },
        skipped: {
            type: Boolean,
            default: false
        }
    }],
    sectionLogs: [{
        fromStation: {
            type: String
        },
        toStation: {
            type: String
        },
        sectionIndex: {
            type: Number
        },
        scheduledTravelTime: {
            type: Number    // minutes
        },
        actualTravelTime: {
            type: Number    // minutes
        },
        avgSpeed: {
            type: Number    // km/h
        },
        maxSpeed: {
            type: Number    // km/h
        },
        delays: [{
            cause: {
                type: String,
                enum: DELAY_CAUSES
            },
            duration: {
                type: Number    // minutes
            },
            description: {
                type: String
            }
        }]
    }],
    overallDelay: {
        type: Number        // total delay at terminus (minutes)
    },
    status: {
        type: String,
        enum: ['Completed', 'Running', 'Cancelled', 'Partial'],
        default: 'Running'
    },
    weatherCode: {
        type: String
    },
    isSimulated: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

trainRunSchema.index({ trainNumber: 1, runDate: -1 });
trainRunSchema.index({ 'sectionLogs.fromStation': 1, 'sectionLogs.toStation': 1 });
trainRunSchema.index({ runDate: -1 });

const TrainRun = mongoose.model('TrainRun', trainRunSchema);
module.exports = TrainRun;
