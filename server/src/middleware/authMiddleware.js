const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Staff = require('../models/Staff');

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization?.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        console.warn('Protect middleware: missing Authorization header', {
            path: req.path,
            method: req.method,
            ip: req.ip,
            authorizationHeader: req.headers.authorization,
        });
        return res.status(401).json({ message: 'Not authorized, no token' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        let user = await User.findById(decoded.id).select('-password');
        if (!user) {
            const staffMember = await Staff.findById(decoded.id).select('-password');
            if (staffMember) {
                const role = staffMember.staffRole === 'TTE' ? 'tte' : staffMember.staffRole.toLowerCase();
                user = staffMember.toObject();
                user.role = role;
            }
        }

        if (!user) {
            return res.status(401).json({ message: 'Not authorized, user not found' });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired, please login again' });
        }
        return res.status(401).json({ message: 'Not authorized, token failed' });
    }
};

const admin = (req, res, next) => {
    if (req.user?.role === 'admin') {
        return next();
    }
    res.status(403).json({ message: 'Access denied. Admin only.' });
};

const staff = (req, res, next) => {
    if (req.user?.role === 'tte' || req.user?.role === 'admin') {
        return next();
    }
    res.status(403).json({ message: 'Access denied. Staff only.' });
};

// Ownership check middleware (user can only access their own resource)
const ownResource = (paramField = 'userId') => async (req, res, next) => {
    if (req.user?.role === 'admin') return next();
    if (req.params[paramField] && req.params[paramField] !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
    }
    next();
};

module.exports = { protect, admin, staff, ownResource };