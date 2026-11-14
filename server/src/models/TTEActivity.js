const mongoose = require('mongoose');

const tteActivitySchema = mongoose.Schema({
    staff: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Staff',
        required: true
    },
    train: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Train',
        required: true
    },
    coach: {
        type: String,
        required: true
    },
    passengers: [{
        booking: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Booking',
            required: true
        },
        passengerName: String,
        pnr: String,
        seatNumber: String,
        status: { type: String, enum: ['CheckedIn', 'NoShow', 'Incomplete'], default: 'CheckedIn' },
        remarks: String
    }],
    incidents: [{
        type: { type: String, enum: ['Ticketless', 'Damaged_Seat', 'Cleanliness_Issue', 'Passenger_Complaint', 'Other'] },
        description: String,
        severity: { type: String, enum: ['Low', 'Medium', 'High'] },
        reportedAt: { type: Date, default: Date.now },
        resolved: { type: Boolean, default: false },
        resolution: String
    }],
    coachStatus: {
        type: String,
        enum: ['Good', 'Minor_Issue', 'Major_Issue'],
        default: 'Good'
    },
    overallNotes: String,
    startTime: { type: Date, default: Date.now },
    endTime: Date
}, {
    timestamps: true
});

const TTEActivity = mongoose.model('TTEActivity', tteActivitySchema);
module.exports = TTEActivity;
