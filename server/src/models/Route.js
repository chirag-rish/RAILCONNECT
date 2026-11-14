const mongoose = require('mongoose');

const routeSchema = mongoose.Schema({
    routeCode: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    name: {
        type: String,
        trim: true
    },
    stations: [{
        station: {
            type: String,
            required: true,
            uppercase: true,
            trim: true
        },
        stationName: {
            type: String
        },
        sequenceNumber: {
            type: Number,
            required: true
        },
        distanceFromOrigin: {
            type: Number,
            required: true
        },
        scheduledArrival: {
            type: String    // "HH:MM" — null for origin
        },
        scheduledDeparture: {
            type: String    // "HH:MM" — null for terminus
        },
        haltDuration: {
            type: Number,
            default: 2      // minutes
        },
        platform: {
            type: String
        },
        isJunction: {
            type: Boolean,
            default: false
        },
        isMajorStation: {
            type: Boolean,
            default: false
        }
    }],
    totalDistance: {
        type: Number
    },
    totalStations: {
        type: Number
    },
    sections: [{
        fromStation: {
            type: String,
            required: true,
            uppercase: true
        },
        toStation: {
            type: String,
            required: true,
            uppercase: true
        },
        distance: {
            type: Number,
            required: true
        },
        typicalSpeed: {
            type: Number,
            default: 60     // km/h average
        },
        maxSpeed: {
            type: Number,
            default: 110
        },
        sectionType: {
            type: String,
            enum: ['SingleLine', 'DoubleLine', 'TripleLine', 'Quadruple'],
            default: 'DoubleLine'
        },
        signalCount: {
            type: Number,
            default: 3
        },
        levelCrossings: {
            type: Number,
            default: 1
        },
        hasAutoSignaling: {
            type: Boolean,
            default: true
        },
        gradientProfile: {
            type: String,
            enum: ['Flat', 'Mild', 'Steep'],
            default: 'Flat'
        },
        electrified: {
            type: Boolean,
            default: true
        }
    }]
}, {
    timestamps: true
});

routeSchema.index({ routeCode: 1 });

const Route = mongoose.model('Route', routeSchema);
module.exports = Route;
