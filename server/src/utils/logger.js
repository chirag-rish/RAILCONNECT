const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const { combine, timestamp, printf, colorize, errors, json } = format;

// Custom log format for console (human-readable)
const consoleFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `${timestamp} [${level}]: ${stack || message}${metaStr}`;
});

// Production: JSON logs for log aggregators (Datadog, CloudWatch, etc.)
const fileTransport = new DailyRotateFile({
    filename: path.join(__dirname, '../../logs/app-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    format: combine(timestamp(), errors({ stack: true }), json()),
});

const errorFileTransport = new DailyRotateFile({
    filename: path.join(__dirname, '../../logs/error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
    format: combine(timestamp(), errors({ stack: true }), json()),
});

const logger = createLogger({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true })),
    transports: [
        // Console (always on in dev, warnings+ in production)
        new transports.Console({
            level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
            format: combine(colorize(), consoleFormat),
        }),
        // File logs (always on)
        fileTransport,
        errorFileTransport,
    ],
    exceptionHandlers: [
        new transports.File({ filename: path.join(__dirname, '../../logs/exceptions.log') }),
    ],
    rejectionHandlers: [
        new transports.File({ filename: path.join(__dirname, '../../logs/rejections.log') }),
    ],
});

module.exports = logger;
