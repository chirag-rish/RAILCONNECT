const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide a name'],
        trim: true,
        minlength: [2, 'Name must be at least 2 characters']
    },
    email: {
        type: String,
        required: [true, 'Please provide an email'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    password: {
        type: String,
        required: [true, 'Please provide a password'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false
    },
    mobile: {
        type: String,
        required: [true, 'Please provide a mobile number'],
        unique: true,
        match: [/^[0-9]{10}$/, 'Please provide a valid 10-digit mobile number']
    },
    dateOfBirth: Date,
    gender: { type: String, enum: ['Male', 'Female', 'Other'] },
    role: {
        type: String,
        enum: ['passenger', 'admin', 'tte'],
        default: 'passenger',
    },
    isActive: { type: Boolean, default: true },
    walletBalance: { type: Number, default: 0 },
    savedPassengers: [{
        name: { type: String, required: true },
        age: { type: Number, required: true },
        gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
        berth_preference: { type: String, enum: ['Lower', 'Upper', 'Middle', 'Side Lower', 'Side Upper'] },
        document_type: { type: String, enum: ['Aadhar', 'PAN', 'Passport'] },
        document_number: String
    }],
    walletTransactions: [{
        amount: { type: Number, required: true },
        transaction_type: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
        description: String,
        booking_ref: mongoose.Schema.Types.ObjectId,
        date: { type: Date, default: Date.now }
    }],
    preferences: {
        preferredBerth: { type: String, enum: ['Lower', 'Upper', 'Middle', 'Side Lower', 'Side Upper'] },
        mealPreference: { type: String, enum: ['Veg', 'Non-Veg', 'Both'] },
        seatPreference: { type: String, enum: ['Window', 'Aisle', 'Any'] }
    },
    notifications: [{
        type: { type: String, enum: ['BOOKING_CONFIRMED', 'BOOKING_CANCELLED', 'TRAIN_DELAYED', 'CHART_PREPARED', 'REFUND_PROCESSED'] },
        title: String,
        message: String,
        read: { type: Boolean, default: false },
        date: { type: Date, default: Date.now }
    }],
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    lastLogin: Date
}, {
    timestamps: true,
});

userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.pre('save', async function () {
    if (!this.isModified('password')) {
        return;
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Generate and hash password token
userSchema.methods.getResetPasswordToken = function () {
    const crypto = require('crypto');
    // Generate token
    const resetToken = crypto.randomBytes(20).toString('hex');

    // Hash token and set to resetPasswordToken field
    this.resetPasswordToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

    // Set expire (10 minutes)
    this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

    return resetToken;
};

const User = mongoose.model('User', userSchema);
module.exports = User;