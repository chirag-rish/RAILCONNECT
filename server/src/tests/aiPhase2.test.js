const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../server');
const Train = require('../models/Train');
const User = require('../models/User');
const Booking = require('../models/Booking');
const { detectRequiredTools, runAgent } = require('../ai/agent');
const { runFallbackAgent, detectIntent } = require('../ai/fallbackAgent');
const { calculateBookingFare } = require('../utils/fareCalculator');
const tools = require('../ai/railwayTools');

jest.setTimeout(60000);

let mongoServer;
let userToken;
let testUserId;
let rajdhaniTrain;

beforeAll(async () => {
    process.env.JWT_SECRET = 'testsecret';
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const user = await User.create({
        name: 'AI Phase2 User',
        email: 'aiphase2@test.com',
        password: 'password123',
        mobile: '9876543210',
        walletBalance: 5000
    });
    testUserId = user._id;

    const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'aiphase2@test.com', password: 'password123' });
    userToken = res.body.token;

    rajdhaniTrain = await Train.create({
        trainNumber: '12951',
        name: 'Mumbai Rajdhani',
        type: 'Rajdhani',
        source: 'NDLS',
        destination: 'BCT',
        departureTime: '16:00',
        arrivalTime: '08:30',
        distance: 1384,
        baseFare: 1500,
        daysOfOperation: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        coachComposition: [
            { classType: '1A', totalSeats: 24, seatsPerCoach: 24 },
            { classType: '2A', totalSeats: 48, seatsPerCoach: 48 },
            { classType: '3A', totalSeats: 64, seatsPerCoach: 64 },
            { classType: 'SL', totalSeats: 72, seatsPerCoach: 72 }
        ]
    });

    await Booking.create({
        pnr: 'AIPNR12345',
        user: testUserId,
        train: rajdhaniTrain._id,
        journeyDate: new Date(Date.now() + 86400000 * 3),
        travelClass: '2A',
        passengers: [{ name: 'Test Traveler', age: 30, gender: 'Male' }],
        totalFare: 2655,
        status: 'Confirmed',
        paymentStatus: 'Completed',
        paymentMethod: 'Wallet',
        contactDetails: { email: 'aiphase2@test.com', mobile: '9876543210' }
    });
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

describe('Phase 2 — AI Tool Routing + Fare Consistency', () => {

    describe('AI ROUTING', () => {
        it('1. railway train search query → correct train tool executes', () => {
            const detected = detectRequiredTools('list trains at NDLS station');
            expect(detected.some(t => t.name === 'searchTrains')).toBe(true);
        });

        it('2. authenticated user bookings query → correct user tool executes', () => {
            const detected = detectRequiredTools('show my bookings');
            expect(detected.some(t => t.name === 'getMyBookings')).toBe(true);
        });

        it('3. PNR query → correct PNR tool executes', () => {
            const detected = detectRequiredTools('check my pnr status AIPNR12345');
            expect(detected.some(t => t.name === 'getMyPNR')).toBe(true);
        });

        it('4. train status query → correct status tool executes', () => {
            const detected = detectRequiredTools('where is my train live status');
            expect(detected.some(t => t.name === 'getMyTrainStatus')).toBe(true);
        });

        it('5. ETA query → correct ETA tool executes', () => {
            const detected = detectRequiredTools('when will my train arrive at destination');
            expect(detected.some(t => t.name === 'getMyTrainETA')).toBe(true);
        });

        it('6. invalid/no-result tool response → useful response, not generic failure', async () => {
            const res = await runFallbackAgent({
                message: 'search trains from INVALID1 to INVALID2',
                context: { userId: testUserId, role: 'passenger' }
            });
            expect(res.reply).not.toMatch(/encountered an issue generating the complete answer/i);
            expect(res.reply).toBeDefined();
            expect(res.reply.length).toBeGreaterThan(5);
        });

        it('7. user-specific tools use req.user._id', async () => {
            const bookingsResult = await tools.getMyBookings({ userId: testUserId, role: 'passenger' });
            expect(bookingsResult.available).toBe(true);
            expect(bookingsResult.bookings.length).toBe(1);
            expect(bookingsResult.bookings[0].pnr).toBe('AIPNR12345');
        });

        it('8. existing AI streaming response still works', async () => {
            const { callAIStream } = require('../ai/provider');
            const stream = callAIStream({
                messages: [{ role: 'user', content: 'hello' }],
            });
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            expect(chunks.length).toBeGreaterThan(0);
        });
    });

    describe('FARE CONSISTENCY', () => {
        it('9. AI/current-fare request uses authoritative fare calculation', async () => {
            const fareResult = calculateBookingFare(rajdhaniTrain, '2A', 1);
            const toolResult = await tools.getTrainFare(
                { userId: testUserId, role: 'passenger' },
                { trainNumber: '12951', travelClass: '2A', passengerCount: 1 }
            );

            expect(toolResult.available).toBe(true);
            expect(toolResult.totalFare).toBe(fareResult.totalFare);
            expect(toolResult.fareBreakdown.baseFare).toBe(fareResult.baseFare);
            expect(toolResult.fareBreakdown.gst).toBe(fareResult.gst);
        });

        it('10. Mumbai Rajdhani 12951 2A produces the same fare as the booking calculation for the same inputs', async () => {
            // Base fare = 1500. 2A multiplier = 1.5 -> Subtotal = 2250. GST 18% = 405. Total = 2655.
            const bookingFare = calculateBookingFare(rajdhaniTrain, '2A', 1);
            expect(bookingFare.totalFare).toBe(2655);

            const res = await request(app)
                .post('/api/ai/predict-price')
                .send({ source: 'NDLS', destination: 'BCT', travelClass: '2A' });

            expect(res.status).toBe(200);
            expect(res.body.predictedFare).toBe(2655);
        });

        it('11. passenger count is handled correctly', () => {
            const fare1 = calculateBookingFare(rajdhaniTrain, '2A', 1);
            const fare2 = calculateBookingFare(rajdhaniTrain, '2A', 2);
            expect(fare2.totalFare).toBe(fare1.totalFare * 2);
        });

        it('12. GST/tax is handled consistently', () => {
            const fare = calculateBookingFare(rajdhaniTrain, '2A', 1);
            // 2250 subtotal * 18% GST = 405
            expect(fare.gst).toBe(405);
            expect(fare.totalFare).toBe(fare.subtotal + fare.gst);
        });

        it('13. AI does not return an invented fare range when exact app data is available', async () => {
            const res = await runFallbackAgent({
                message: 'what is the fare for train 12951 in 2A?',
                context: { userId: testUserId, role: 'passenger' }
            });

            expect(res.intent).toBe('train_fare');
            expect(res.reply).toContain('2655');
            expect(res.reply).not.toMatch(/\d{4}\s*–\s*\d{4}/);
        });
    });

    describe('FAILS & ROUTING FIXES (Phase 2B QA Verification)', () => {
        it('17. "Show my bookings" intent detection and tool execution', async () => {
            expect(detectIntent('Show my bookings')).toBe('bookings');
            const res = await runFallbackAgent({
                message: 'Show my bookings',
                context: { userId: testUserId, role: 'passenger' }
            });
            expect(res.intent).toBe('bookings');
            expect(res.reply).toContain('AIPNR12345');
        });

        it('18. "Show my booking history" intent detection', () => {
            expect(detectIntent('Show my booking history')).toBe('bookings');
        });

        it('19. "Check my PNR AIPNR12345" intent and tool execution', async () => {
            expect(detectIntent('Check my PNR AIPNR12345')).toBe('pnr_status');
            const res = await runFallbackAgent({
                message: 'Check my PNR AIPNR12345',
                context: { userId: testUserId, role: 'passenger' }
            });
            expect(res.intent).toBe('pnr_status');
            expect(res.reply).toContain('AIPNR12345');
        });

        it('20. "What is the current status of train 12951?" and "Where is train 12951?"', async () => {
            expect(detectIntent('What is the current status of train 12951?')).toBe('train_status');
            expect(detectIntent('Where is train 12951?')).toBe('train_status');
            const res = await runFallbackAgent({
                message: 'What is the current status of train 12951?',
                context: { userId: testUserId, role: 'passenger' }
            });
            expect(res.intent).toBe('train_status');
            expect(res.reply).toContain('12951');
        });

        it('21. "What is the ETA for my train?" intent detection', () => {
            expect(detectIntent('What is the ETA for my train?')).toBe('eta');
        });

        it('22. status of nonexistent train 99999 produces clean no-result response', async () => {
            const res = await runFallbackAgent({
                message: 'What is the status of train 99999?',
                context: { userId: testUserId, role: 'passenger' }
            });
            expect(res.reply).not.toContain('general_chat');
            expect(res.reply).toBeDefined();
            expect(res.reply.length).toBeGreaterThan(5);
        });

        it('23. Fare calculations for 1, 2, and 3 passengers', async () => {
            const f1 = await tools.getTrainFare({ userId: testUserId, role: 'passenger' }, { trainNumber: '12951', travelClass: '2A', passengerCount: 1 });
            const f2 = await tools.getTrainFare({ userId: testUserId, role: 'passenger' }, { trainNumber: '12951', travelClass: '2A', passengerCount: 2 });
            const f3 = await tools.getTrainFare({ userId: testUserId, role: 'passenger' }, { trainNumber: '12951', travelClass: '2A', passengerCount: 3 });

            expect(f1.totalFare).toBe(2655);
            expect(f2.totalFare).toBe(5310);
            expect(f3.totalFare).toBe(7965);
        });
    });

    describe('REGRESSION', () => {
        it('14. existing booking fare tests still pass', async () => {
            const res = await request(app)
                .get('/api/bookings/calculate-fare')
                .set('Authorization', `Bearer ${userToken}`)
                .query({ trainId: rajdhaniTrain._id.toString(), travelClass: '2A', passengerCount: 1 });

            expect(res.status).toBe(200);
            expect(res.body.fare.totalFare).toBe(2655);
        });

        it('15. existing ETA/tracking tests still pass', async () => {
            const statusResult = await tools.getMyTrainStatus({ userId: testUserId, role: 'passenger' }, { trainNumber: '12951' });
            expect(statusResult.available).toBe(true);
            expect(statusResult.train.trainNumber).toBe('12951');
        });

        it('16. wallet Phase 1 tests still pass', async () => {
            const user = await User.findById(testUserId);
            expect(user.walletBalance).toBe(5000);
        });
    });
});
