/**
 * SIH26028 — Phase 3B ETA API Tests
 *
 * Tests the Node.js Express ETA API endpoints.
 * Uses the real app (with MongoDB Memory Server from existing test setup).
 * Tests that require the Python inference service will handle
 * connection errors gracefully.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../server');
const Train = require('../models/Train');
const Route = require('../models/Route');

jest.setTimeout(20000);

let mongoServer;
let userToken;
let trainId;

beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret';
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Create test user and get token
    const User = require('../models/User');
    const user = await User.create({
        name: 'ETA Test User',
        email: 'eta-test@example.com',
        password: 'password123',
        mobile: '9876543210',
    });

    const jwt = require('jsonwebtoken');
    userToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Create test route with sections
    const route = await Route.create({
        routeCode: 'ETA-TEST-ROUTE',
        name: 'ETA Test Route',
        stations: [
            { station: 'STN_A', stationName: 'Station A', sequenceNumber: 1, distanceFromOrigin: 0, scheduledDeparture: '10:00' },
            { station: 'STN_B', stationName: 'Station B', sequenceNumber: 2, distanceFromOrigin: 100, scheduledArrival: '11:00', scheduledDeparture: '11:05' },
            { station: 'STN_C', stationName: 'Station C', sequenceNumber: 3, distanceFromOrigin: 200, scheduledArrival: '12:30' },
        ],
        sections: [
            {
                fromStation: 'STN_A', toStation: 'STN_B',
                distance: 100, typicalSpeed: 80, maxSpeed: 110,
                sectionType: 'DoubleLine', signalCount: 4, levelCrossings: 1,
                gradientProfile: 'Flat',
            },
            {
                fromStation: 'STN_B', toStation: 'STN_C',
                distance: 100, typicalSpeed: 70, maxSpeed: 100,
                sectionType: 'SingleLine', signalCount: 3, levelCrossings: 2,
                gradientProfile: 'Mild',
            },
        ],
    });

    // Create test train
    const train = await Train.create({
        trainNumber: '99999',
        name: 'ETA Test Express',
        type: 'Express',
        source: 'STN_A',
        destination: 'STN_C',
        daysOfOperation: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        departureTime: '10:00',
        arrivalTime: '13:00',
        distance: 200,
        baseFare: 500,
        route: route._id,
        currentState: {
            lastKnownStation: 'STN_A',
            nextStation: 'STN_B',
            sectionIndex: 0,
            progressInSection: 0.3,
            speed: 60,
            isRunning: true,
            lastUpdated: new Date(),
        },
    });

    trainId = train._id.toString();
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

// ============================================================
// TESTS: Health Endpoint
// ============================================================

describe('GET /api/eta/health', () => {
    it('should return health status (may be degraded if inference service not running)', async () => {
        const res = await request(app)
            .get('/api/eta/health');

        // Health endpoint returns 200 or 503
        expect([200, 503]).toContain(res.status);
        expect(res.body).toHaveProperty('success');
    });
});

// ============================================================
// TESTS: Direct Prediction (requires auth)
// ============================================================

describe('POST /api/eta/predict', () => {
    const validInput = {
        accumulated_delay_entering: 5.2,
        prev_section_travel_time: 45.0,
        prev_section_delay: 2.1,
        stations_travelled: 2,
        stations_remaining: 3,
        section_distance: 130.0,
        typical_speed: 80.0,
        max_speed: 110.0,
        signal_count: 4,
        level_crossings: 1,
        section_type: 'DoubleLine',
        gradient_profile: 'Flat',
        hour: 14,
        day_of_week: 2,
        is_weekend: 0,
        event_active: 0,
        event_type: 'None',
        event_speed_limit: 110.0,
        historical_mean_travel_time: 97.5,
        historical_mean_delay: 2.4,
    };

    it('should reject request without auth token', async () => {
        const res = await request(app)
            .post('/api/eta/predict')
            .send(validInput);

        expect(res.status).toBe(401);
    });

    it('should return prediction or service unavailable', async () => {
        const res = await request(app)
            .post('/api/eta/predict')
            .set('Authorization', `Bearer ${userToken}`)
            .send(validInput);

        // Will be 503 if inference service not running, 200 if it is
        if (res.status === 200) {
            expect(res.body).toHaveProperty('success', true);
            expect(res.body).toHaveProperty('prediction');
            expect(res.body.prediction).toHaveProperty('predictedDelayMinutes');
            expect(res.body.prediction).toHaveProperty('model', 'XGBoost Residual');
            expect(typeof res.body.prediction.predictedDelayMinutes).toBe('number');
            expect(Number.isFinite(res.body.prediction.predictedDelayMinutes)).toBe(true);
        } else {
            expect(res.status).toBe(503);
            expect(res.body).toHaveProperty('success', false);
        }
    });
});

// ============================================================
// TESTS: Section Prediction
// ============================================================

describe('POST /api/eta/predict/section', () => {
    it('should reject request without auth token', async () => {
        const res = await request(app)
            .post('/api/eta/predict/section')
            .send({ fromStation: 'STN_A', toStation: 'STN_B' });

        expect(res.status).toBe(401);
    });

    it('should return 400 for missing station codes', async () => {
        const res = await request(app)
            .post('/api/eta/predict/section')
            .set('Authorization', `Bearer ${userToken}`)
            .send({});

        expect(res.status).toBe(400);
    });

    it('should return 404 or prediction for known section', async () => {
        const res = await request(app)
            .post('/api/eta/predict/section')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                fromStation: 'STN_A',
                toStation: 'STN_B',
                historicalMeanDelay: 2.0,
            });

        // 200 (success), 404 (no route found), or 503 (service down)
        expect([200, 404, 503]).toContain(res.status);
        expect(res.body).toHaveProperty('success');
    });
});

// ============================================================
// TESTS: Train-Based Prediction
// ============================================================

describe('GET /api/eta/train/:trainId', () => {
    it('should reject request without auth token', async () => {
        const res = await request(app)
            .get(`/api/eta/train/${trainId}`);

        expect(res.status).toBe(401);
    });

    it('should return 404 for unknown train', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const res = await request(app)
            .get(`/api/eta/train/${fakeId}`)
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('success', false);
        expect(res.body.message).toMatch(/not found/i);
    });

    it('should return prediction or service unavailable for valid train', async () => {
        const res = await request(app)
            .get(`/api/eta/train/${trainId}`)
            .set('Authorization', `Bearer ${userToken}`);

        // 200 (success), 503 (service down), or 400 (missing state)
        expect([200, 400, 503]).toContain(res.status);
        expect(res.body).toHaveProperty('success');

        if (res.status === 200) {
            expect(res.body).toHaveProperty('prediction');
            expect(res.body).toHaveProperty('trainNumber', '99999');
            expect(res.body.prediction).toHaveProperty('predictedDelayMinutes');
            expect(Number.isFinite(res.body.prediction.predictedDelayMinutes)).toBe(true);
        }
    });

    it('should accept a train number instead of ObjectId', async () => {
        const res = await request(app)
            .get('/api/eta/train/99999')
            .set('Authorization', `Bearer ${userToken}`);

        // 200 (success), 503 (service down), or 400 (missing state)
        expect([200, 400, 503]).toContain(res.status);
        expect(res.body).toHaveProperty('success');
    });
});

// ============================================================
// TESTS: Station-by-Station ETA Endpoint
// ============================================================

describe('GET /api/eta/train/:trainId/stations', () => {
    it('should reject request without auth token', async () => {
        const res = await request(app)
            .get(`/api/eta/train/${trainId}/stations`);

        expect(res.status).toBe(401);
    });

    it('should return 404 for unknown train', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const res = await request(app)
            .get(`/api/eta/train/${fakeId}/stations`)
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('success', false);
        expect(res.body.message).toMatch(/not found/i);
    });

    it('should return station ETAs or service unavailable for valid train', async () => {
        const res = await request(app)
            .get(`/api/eta/train/${trainId}/stations`)
            .set('Authorization', `Bearer ${userToken}`);

        // 200 (success), 503 (service down), or 400 (missing state)
        expect([200, 400, 503]).toContain(res.status);
        expect(res.body).toHaveProperty('success');

        if (res.status === 200) {
            expect(res.body).toHaveProperty('trainNumber', '99999');
            expect(res.body).toHaveProperty('stationETAs');
            expect(Array.isArray(res.body.stationETAs)).toBe(true);
            if (res.body.stationETAs.length > 0) {
                const eta = res.body.stationETAs[0];
                expect(eta).toHaveProperty('toStation');
                expect(eta).toHaveProperty('predictedDelayMinutes');
                expect(eta).toHaveProperty('predictedArrival');
                expect(Number.isFinite(eta.predictedDelayMinutes)).toBe(true);
            }
        }
    });
});

// ============================================================
// TESTS: API Response Structure
// ============================================================

describe('ETA API Response Structure', () => {
    it('health endpoint returns structured response', async () => {
        const res = await request(app)
            .get('/api/eta/health');

        expect(res.body).toHaveProperty('success');
        if (res.body.success) {
            expect(res.body).toHaveProperty('inferenceService');
            expect(res.body.inferenceService).toHaveProperty('modelLoaded');
        }
    });

    it('predict endpoint returns structured response for empty body', async () => {
        const res = await request(app)
            .post('/api/eta/predict')
            .set('Authorization', `Bearer ${userToken}`)
            .send({});

        // buildPredictionInput fills defaults for all fields,
        // so with inference service running we get 200 with a prediction.
        // Without inference service: 503.
        expect([200, 400, 422, 503]).toContain(res.status);
        expect(res.body).toHaveProperty('success');
    });
});
