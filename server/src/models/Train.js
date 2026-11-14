const mongoose = require('mongoose');

const trainSchema = mongoose.Schema({
    trainNumber: {
        type: String,
        required: [true, 'Train number is required'],
        unique: true,
        trim: true
    },
    name: {
        type: String,
        required: [true, 'Train name is required'],
        trim: true
    },
    type: {
        type: String,
        enum: ['Express', 'Superfast', 'Shatabdi', 'Rajdhani', 'Duronto', 'Local', 'Mail/Express'],
        required: true
    },
    source: {
        type: String,
        required: [true, 'Source station code is required'],
        uppercase: true,
        trim: true
    },
    destination: {
        type: String,
        required: [true, 'Destination station code is required'],
        uppercase: true,
        trim: true
    },
    daysOfOperation: [{
        type: String,
        enum: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    }],
    departureTime: {
        type: String,
        required: [true, 'Departure time is required'],
        match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please provide valid time in HH:MM format']
    },
    arrivalTime: {
        type: String,
        required: [true, 'Arrival time is required'],
        match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please provide valid time in HH:MM format']
    },
    distance: {
        type: Number,
        required: [true, 'Distance is required'],
        min: [1, 'Distance must be greater than 0']
    },
    coachComposition: [{
        classType: { type: String, enum: ['1A', '2A', '3A', 'AC2', 'CC', 'SL', '2S', 'EC'], required: true },
        totalSeats: { type: Number, required: true, min: 1 },
        seatsPerCoach: { type: Number, default: 72 }
    }],
    baseFare: {
        type: Number,
        required: [true, 'Base fare is required'],
        min: [1, 'Base fare must be greater than 0']
    },
    seatAvailability: [{
        classType: String,
        available: Number,
        reserved: Number,
        waitlist: Number,
        lastUpdated: { type: Date, default: Date.now }
    }],
    platform: String,
    status: {
        type: String,
        enum: ['Active', 'Inactive', 'Cancelled', 'Delayed', 'OnTime', 'On Time'],
        default: 'Active'
    },
    delayMinutes: { type: Number, default: 0 },
    remarks: String,
    route: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Route'
    },
    currentState: {
        lastKnownStation:  { type: String },
        nextStation:       { type: String },
        latitude:          { type: Number },
        longitude:         { type: Number },
        speed:             { type: Number, default: 0 },
        heading:           { type: Number },
        lastUpdated:       { type: Date },
        sectionIndex:      { type: Number, default: 0 },
        progressInSection: { type: Number, default: 0 },
        isRunning:         { type: Boolean, default: false }
    }
}, {
    timestamps: true
});

const Train = mongoose.model('Train', trainSchema);
module.exports = Train;