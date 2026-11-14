const mongoose = require('mongoose');

const bookingSchema = mongoose.Schema({
    pnr: {
        type: String,
        required: [true, 'PNR is required'],
        unique: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    train: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Train',
        required: true
    },
    journeyDate: {
        type: Date,
        required: [true, 'Journey date is required'],
        validate: {
            validator: function (v) {
                return v > new Date();
            },
            message: 'Journey date must be in the future'
        }
    },
    travelClass: {
        type: String,
        enum: ['1A', '2A', '3A', 'AC2', 'CC', 'SL', '2S', 'EC'],
        required: true
    },
    passengers: [{
        name: { type: String, required: true },
        age: { type: Number, required: true },
        gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
        berth_preference: { type: String, enum: ['Lower', 'Upper', 'Middle', 'Side Lower', 'Side Upper'] },
        assigned_seat: String,
        seat_type: { type: String, enum: ['Berth', 'Seat'] },
        status: { type: String, enum: ['CNF', 'RAC', 'WL', 'Confirmed', 'Cancelled'], default: 'CNF' },
        boarded: { type: Boolean, default: false },
        verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        verifiedAt: Date
    }],
    totalFare: {
        type: Number,
        required: true,
        min: 0
    },
    fareBreakdown: {
        baseFare: Number,
        gst: Number,
        discount: { type: Number, default: 0 },
        finalFare: Number
    },
    status: {
        type: String,
        enum: ['Pending', 'Confirmed', 'Cancelled', 'Completed'],
        default: 'Pending'
    },
    ticketUrl: {
        type: String,
        default: ''
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Completed', 'Failed', 'Refunded'],
        default: 'Pending'
    },
    paymentMethod: { type: String, enum: ['UPI', 'Card', 'NetBanking', 'Wallet'] },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    contactDetails: {
        mobile: { type: String, required: true },
        email: { type: String, required: true }
    },
    refundDetails: {
        refundAmount: Number,
        refundReason: String,
        refundDate: Date,
        refundStatus: { type: String, enum: ['Pending', 'Processed'] }
    },
    cancellationDetails: {
        cancelledBy: String,
        cancelledAt: Date,
        reason: String
    }
}, {
    timestamps: true
});

const Booking = mongoose.model('Booking', bookingSchema);
module.exports = Booking;