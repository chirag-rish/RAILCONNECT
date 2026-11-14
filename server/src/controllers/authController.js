const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Staff = require('../models/Staff');
const fs = require('fs');
const sendEmail = require('../utils/emailService');
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};
// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({ message: 'Please provide email and password' });
        }

        let user = await User.findOne({ email: email.toLowerCase() }).select('+password');
        let isStaffMember = false;
        if (!user) {
            user = await Staff.findOne({ email: email.toLowerCase() }).select('+password');
            if (user) {
                isStaffMember = true;
            }
        }
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const isPasswordMatch = await user.matchPassword(password);
        if (!isPasswordMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        let role = user.role;
        if (isStaffMember) {
            role = user.staffRole === 'TTE' ? 'tte' : user.staffRole.toLowerCase();
        }

        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: role,
            token: generateToken(user._id),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
    try {
        const { name, email, password, mobile } = req.body;

        // Validation
        if (!name || !email || !password || !mobile) {
            return res.status(400).json({ message: 'Please provide all required fields' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        if (!/^[0-9]{10}$/.test(mobile)) {
            return res.status(400).json({ message: 'Mobile number must be 10 digits' });
        }

        const userExists = await User.findOne({ $or: [{ email }, { mobile }] });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists with this email or mobile' });
        }

        // Always default to passenger on self-registered accounts.
        // Admin/staff users must be created by an existing admin via a protected route.
        const userRole = 'passenger';

        const user = await User.create({
            name,
            email,
            password,
            mobile,
            role: userRole,
        });

        // Send Welcome Email
        try {
            await sendEmail({
                email: user.email,
                subject: 'Welcome to RailConnect!',
                message: `Hi ${user.name},\n\nThank you for registering with RailConnect. Your account has been successfully created.\n\nEnjoy your seamless journey!`
            });
        } catch (emailError) {
            console.error('Email sending failed:', emailError);
            // Don't fail registration if email fails
        }

        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user._id),
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};
// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
const getUserProfile = async (req, res) => {
    let user = await User.findById(req.user._id);
    if (!user) {
        user = await Staff.findById(req.user._id);
    }
    if (user) {
        const role = user.role || (user.staffRole === 'TTE' ? 'tte' : user.staffRole?.toLowerCase());
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: role,
            mobile: user.mobile,
            walletBalance: user.walletBalance || 0
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};

// @desc    Forgot password
// @route   POST /api/auth/forgotpassword
// @access  Public
const forgotPassword = async (req, res) => {
    const requestedEmail = req.body.email?.toLowerCase().trim();
    console.log('Forgot Password Request Received:', requestedEmail);
    try {
        const user = await User.findOne({ email: requestedEmail });

        if (!user) {
            // Prevent email enumeration by returning a success response even if the user is not found.
            // For debugging and development, return a preview URL and log a fake reset link.
            const fakeToken = crypto.randomBytes(20).toString('hex');
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            const previewUrl = `${frontendUrl}/reset-password/${fakeToken}`;
            const logEntry = `\n[${new Date().toISOString()}] ForgotPassword requested for missing user ${requestedEmail}: ${previewUrl}\n`;
            fs.appendFileSync('password_reset_links.txt', logEntry);
            return res.status(200).json({ success: true, data: 'Email sent', previewUrl, loggedToFile: true });
        }

        // Get reset token
        const resetToken = user.getResetPasswordToken();

        await user.save({ validateBeforeSave: false });

        // Create reset url
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

        const message = `You are receiving this email because you (or someone else) has requested the reset of a password. Please click on the link below to reset your password: \n\n ${resetUrl} \n\n This link will expire in 10 minutes.`;

        try {
            const emailResult = await sendEmail({
                email: user.email,
                subject: 'Password reset token',
                message
            });

            const responsePayload = { success: true, data: 'Email sent' };
            if (emailResult?.previewUrl) {
                responsePayload.previewUrl = emailResult.previewUrl;
            }
            if (emailResult?.loggedToFile) {
                responsePayload.loggedToFile = true;
            }

            res.status(200).json(responsePayload);
        } catch (err) {
            console.log(err);
            user.resetPasswordToken = undefined;
            user.resetPasswordExpire = undefined;

            await user.save({ validateBeforeSave: false });

            return res.status(500).json({ message: 'Email could not be sent' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Reset password
// @route   PUT /api/auth/resetpassword/:resettoken
// @access  Public
const resetPassword = async (req, res) => {
    try {
        const crypto = require('crypto');
        // Get hashed token
        const resetPasswordToken = crypto
            .createHash('sha256')
            .update(req.params.resettoken)
            .digest('hex');

        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid token' });
        }

        // Set new password
        user.password = req.body.password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();

        res.status(200).json({
            success: true,
            token: generateToken(user._id)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { loginUser, registerUser, getUserProfile, forgotPassword, resetPassword };