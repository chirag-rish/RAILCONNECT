const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const staffSchema = mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Staff name is required'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false
    },
    mobile: {
        type: String,
        required: [true, 'Mobile number is required'],
        unique: true,
        match: [/^[0-9]{10}$/, 'Please provide a valid 10-digit mobile number']
    },
    staffRole: {
        type: String,
        enum: ['TTE', 'Security', 'Cleaning_Crew', 'Booking_Agent'],
        required: [true, 'Staff role is required']
    },
    designation: String,
    department: String,
    dateOfBirth: Date,
    gender: { type: String, enum: ['Male', 'Female', 'Other'] },
    address: {
        street: String,
        city: String,
        state: String,
        zipCode: String
    },
    assignedStation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Station'
    },
    assignedTrains: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Train'
    }],
    shifts: [{
        startTime: String,
        endTime: String,
        dayOfWeek: { type: String, enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }
    }],
    isActive: { type: Boolean, default: true },
    employeeId: {
        type: String,
        unique: true,
        sparse: true
    },
    joinDate: {
        type: Date,
        default: Date.now
    },
    lastLogin: Date,
    activities: [{
        action: String,
        trainId: mongoose.Schema.Types.ObjectId,
        description: String,
        timestamp: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true
});

staffSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

staffSchema.pre('save', async function () {
    if (!this.isModified('password')) {
        return;
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

const Staff = mongoose.model('Staff', staffSchema);
module.exports = Staff;
