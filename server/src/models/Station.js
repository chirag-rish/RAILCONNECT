const mongoose = require('mongoose');
const stationSchema = mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    city: {
        type: String,
        required: true
    },
    state: {
        type: String,
        required: true
    },
    latitude: {
        type: Number
    },
    longitude: {
        type: Number
    },
    zone: {
        type: String
    },
    division: {
        type: String
    },
    platformCount: {
        type: Number,
        default: 4
    },
    altitude: {
        type: Number,
        default: 0
    },
    stationType: {
        type: String,
        enum: ['Junction', 'Terminal', 'Halt', 'Crossing', 'Flag'],
        default: 'Halt'
    }
}, {
    timestamps: true
});
const Station = mongoose.model('Station', stationSchema);
module.exports = Station