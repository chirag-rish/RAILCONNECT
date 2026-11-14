const rateLimit = require('express-rate-limit');

// Strict limiter for auth endpoints (prevent brute force)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Only 10 attempts per IP
    message: {
        message: 'Too many login attempts. Please try again after 15 minutes.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful logins
});

// General API limiter
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: { message: 'Too many requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Strict limiter for payment endpoints
const paymentLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { message: 'Too many payment attempts. Please wait.' },
});

module.exports = { authLimiter, apiLimiter, paymentLimiter };
