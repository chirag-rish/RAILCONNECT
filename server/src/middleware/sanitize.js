const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');

const sanitizeMiddleware = [
    // Strip $ and . from req.body, req.query, req.params (prevents NoSQL injection)
    mongoSanitize(),

    // Sanitize HTML in user inputs (prevents XSS)
    xss(),

    // Prevent HTTP Parameter Pollution (e.g., ?sort=price&sort=name)
    hpp({
        whitelist: ['source', 'destination', 'date', 'class'], // Allow these to be arrays
    }),
];

module.exports = sanitizeMiddleware;
