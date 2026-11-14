const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./utils/logger');
const requestLogger = require('./middleware/requestLogger');
const sanitize = require('./middleware/sanitize');
const { authLimiter, apiLimiter, paymentLimiter } = require('./middleware/rateLimiter');

// Create Express app
const app = express();

// Create HTTP server (needed for socket.io)
const server = http.createServer(app);

// Setup Socket.io
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

// Make io available via req.app.get('io')
app.set('io', io);

// Socket.io connection handling
io.on('connection', (socket) => {
    logger.info('Socket client connected', { socketId: socket.id });

    socket.on('join:user', (userId) => {
        socket.join(`user:${userId}`);
        logger.debug('Socket user room joined', { socketId: socket.id, userId });
    });

    socket.on('join:train', (trainId) => {
        socket.join(`train:${trainId}`);
        logger.debug('Socket joined train room', { socketId: socket.id, trainId });
    });

    socket.on('leave:train', (trainId) => {
        socket.leave(`train:${trainId}`);
        logger.debug('Socket left train room', { socketId: socket.id, trainId });
    });

    socket.on('join:admin', () => {
        socket.join('admin');
        logger.debug('Socket joined admin room', { socketId: socket.id });
    });

    // Phase 5B — ETA update rooms
    socket.on('join:eta', () => {
        socket.join('eta:all');
        socket.join('eta:updates');
        logger.debug('Socket joined ETA rooms', { socketId: socket.id });
    });

    socket.on('leave:eta', () => {
        socket.leave('eta:all');
        socket.leave('eta:updates');
        logger.debug('Socket left ETA rooms', { socketId: socket.id });
    });

    socket.on('join:eta:train', (trainId) => {
        socket.join(`train:${trainId}`);
        logger.debug('Socket joined train ETA room', { socketId: socket.id, trainId });
    });

    socket.on('leave:eta:train', (trainId) => {
        socket.leave(`train:${trainId}`);
        logger.debug('Socket left train ETA room', { socketId: socket.id, trainId });
    });

    socket.on('join:telemetry:all', () => {
        socket.join('telemetry:all');
        logger.debug('Socket joined telemetry:all room', { socketId: socket.id });
    });

    socket.on('leave:telemetry:all', () => {
        socket.leave('telemetry:all');
        logger.debug('Socket left telemetry:all room', { socketId: socket.id });
    });

    socket.on('join:eta:global', () => {
        socket.join('eta:all');
        logger.debug('Socket joined eta:all room', { socketId: socket.id });
    });

    socket.on('disconnect', () => {
        logger.info('Socket client disconnected', { socketId: socket.id });
    });
});

// Helpers for emitting events
const emitToUser = (ioInstance, userId, event, data) => {
    ioInstance.to(`user:${userId}`).emit(event, data);
};

const emitTrainUpdate = (ioInstance, trainId, data) => {
    ioInstance.to(`train:${trainId}`).emit('train:update', data);
};

const emitToAdmins = (ioInstance, event, data) => {
    ioInstance.to('admin').emit(event, data);
};

// Middleware
app.use(express.json());
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
}));
app.use(...sanitize);

// Rate limiting
app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/payment/', paymentLimiter);

// Security headers (CSP + others)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
            connectSrc: ["'self'", 'https://api.razorpay.com'],
        },
    },
}));

app.use(requestLogger);

// Routes
app.use('/tickets', express.static(path.join(__dirname, '../public/tickets')));
app.get('/', (req, res) => res.json({ status: 'RailConnect API running', version: '2.0' }));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/trains', require('./routes/trainRoutes'));
app.use('/api/stations', require('./routes/stationRoutes'));
app.use('/api/bookings', require('./routes/bookingRoutes'));
app.use('/api/tte', require('./routes/tteRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));
app.use('/api/wallet', require('./routes/walletRoutes'));
app.use('/api/payment', require('./routes/paymentRoutes'));
app.use('/api/simulation', require('./routes/simulationRoutes'));
app.use('/api/support', require('./routes/supportRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/eta', require('./routes/etaRoutes'));
app.use('/api/gis', require('./routes/gisRoutes'));
app.use('/api/historical', require('./routes/historicalRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));

// Phase 5A — Live Data Ingestion health endpoints
const { tracker, sourceManager, createIngestHealthRoutes } = require('./live');
app.use('/api/ingest', createIngestHealthRoutes(tracker, sourceManager));

// Safety direct route for forgot password
app.post('/api/auth/forgotpassword', require('./controllers/authController').forgotPassword);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
    logger.error('Unhandled error', { error: err });
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    res.status(statusCode).json({ message, error: process.env.NODE_ENV === 'development' ? err : {} });
});

module.exports = { app, server, io, emitToUser, emitTrainUpdate, emitToAdmins };
