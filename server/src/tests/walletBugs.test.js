const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../server');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Train = require('../models/Train');

jest.setTimeout(25000);

let mongoServer;
let userToken;
let testUserId;
let testTrain;

beforeAll(async () => {
    process.env.JWT_SECRET = 'testsecret';
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const user = await User.create({
        name: 'Wallet User',
        email: 'wallet_user@test.com',
        password: 'password123',
        mobile: '9876543210',
        walletBalance: 2000
    });
    testUserId = user._id;

    const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'wallet_user@test.com', password: 'password123' });
    userToken = res.body.token;

    testTrain = await Train.create({
        trainNumber: '12951',
        name: 'Rajdhani Express',
        type: 'Rajdhani',
        source: 'NDLS',
        destination: 'BCT',
        departureTime: '16:00',
        arrivalTime: '08:30',
        distance: 1384,
        baseFare: 500,
        daysOfOperation: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        coachComposition: [
            { classType: 'SL', totalSeats: 72, seatsPerCoach: 72 },
            { classType: '3A', totalSeats: 64, seatsPerCoach: 64 }
        ],
        seatAvailability: [
            { classType: 'SL', available: 50, reserved: 0, waitlist: 0 }
        ]
    });
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

describe('Controlled Bug Fix: Wallet and Cancellation Flow', () => {
    let booking1Id;
    let expectedFare1;

    it('1. sufficient wallet balance → booking succeeds', async () => {
        await User.findByIdAndUpdate(testUserId, { walletBalance: 2000, walletTransactions: [] });

        const res = await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                trainId: testTrain._id,
                journeyDate: new Date(Date.now() + 86400000 * 2).toISOString(),
                travelClass: 'SL',
                passengers: [{ name: 'Passenger One', age: 25, gender: 'Male' }],
                contactDetails: { email: 'pass1@test.com', mobile: '9876543210' }
            });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.booking).toHaveProperty('pnr');
        expect(res.body.booking.status).toBe('Confirmed');

        booking1Id = res.body.booking._id;
        expectedFare1 = res.body.booking.totalFare;
        expect(expectedFare1).toBeGreaterThan(0);

        const updatedUser = await User.findById(testUserId);
        expect(updatedUser.walletBalance).toBe(2000 - expectedFare1);
        expect(updatedUser.walletTransactions.length).toBe(1);
        expect(updatedUser.walletTransactions[0].transaction_type).toBe('DEBIT');
        expect(updatedUser.walletTransactions[0].amount).toBe(expectedFare1);
    });

    it('2. exact wallet balance == fare → booking succeeds and balance becomes 0', async () => {
        const fare = expectedFare1;
        await User.findByIdAndUpdate(testUserId, { walletBalance: fare, walletTransactions: [] });

        const res = await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                trainId: testTrain._id,
                journeyDate: new Date(Date.now() + 86400000 * 3).toISOString(),
                travelClass: 'SL',
                passengers: [{ name: 'Passenger Exact', age: 30, gender: 'Female' }],
                contactDetails: { email: 'exact@test.com', mobile: '9876543210' }
            });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        const updatedUser = await User.findById(testUserId);
        expect(updatedUser.walletBalance).toBe(0);
    });

    it('3. insufficient wallet balance → booking rejected', async () => {
        await User.findByIdAndUpdate(testUserId, { walletBalance: 221 });

        const res = await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                trainId: testTrain._id,
                journeyDate: new Date(Date.now() + 86400000 * 4).toISOString(),
                travelClass: 'SL',
                passengers: [{ name: 'Passenger Underfunded', age: 30, gender: 'Female' }],
                contactDetails: { email: 'under@test.com', mobile: '9876543210' }
            });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/insufficient/i);
    });

    it('4. rejected booking → wallet remains unchanged', async () => {
        const user = await User.findById(testUserId);
        expect(user.walletBalance).toBe(221);
    });

    it('5. successful cancellation → refund credited', async () => {
        const booking = await Booking.findById(booking1Id);
        const userBefore = await User.findById(testUserId);
        const balanceBefore = userBefore.walletBalance;

        const res = await request(app)
            .put(`/api/bookings/${booking1Id}/cancel`)
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(200);
        const expectedRefund = booking.totalFare * 0.8;
        expect(res.body.refundAmount).toBe(expectedRefund);

        const userAfter = await User.findById(testUserId);
        expect(userAfter.walletBalance).toBe(balanceBefore + expectedRefund);
    });

    it('6. successful cancellation → refund transaction exists', async () => {
        const user = await User.findById(testUserId);
        const refundTx = user.walletTransactions.find(t =>
            t.transaction_type === 'CREDIT' &&
            t.booking_ref &&
            t.booking_ref.toString() === booking1Id.toString()
        );
        expect(refundTx).toBeDefined();
        expect(refundTx.amount).toBe(expectedFare1 * 0.8);
    });

    it('7. cancellation → final wallet balance is correct', async () => {
        const user = await User.findById(testUserId);
        expect(user.walletBalance).toBe(221 + (expectedFare1 * 0.8));
    });

    it('8. repeated cancellation/refund attempt → no duplicate refund', async () => {
        const userBefore = await User.findById(testUserId);
        const balanceBefore = userBefore.walletBalance;
        const txCountBefore = userBefore.walletTransactions.length;

        const res = await request(app)
            .put(`/api/bookings/${booking1Id}/cancel`)
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(400);

        const userAfter = await User.findById(testUserId);
        expect(userAfter.walletBalance).toBe(balanceBefore);
        expect(userAfter.walletTransactions.length).toBe(txCountBefore);
    });

    it('9. unpaid/non-wallet booking → no incorrect wallet refund', async () => {
        const nonWalletBooking = await Booking.create({
            pnr: 'NONWAL9999',
            user: testUserId,
            train: testTrain._id,
            journeyDate: new Date(Date.now() + 86400000 * 5),
            travelClass: 'SL',
            passengers: [{
                name: 'External Card User',
                age: 28,
                gender: 'Male',
                assigned_seat: 'SL-1',
                seat_type: 'Berth',
                berth_preference: 'Lower',
                status: 'CNF',
                checkedIn: false
            }],
            totalFare: 590,
            status: 'Confirmed',
            paymentStatus: 'Completed',
            paymentMethod: 'Card',
            contactDetails: { email: 'carduser@test.com', mobile: '9876543210' }
        });

        const userBefore = await User.findById(testUserId);
        const balanceBefore = userBefore.walletBalance;

        const res = await request(app)
            .put(`/api/bookings/${nonWalletBooking._id}/cancel`)
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(200);
        expect(res.body.refundAmount).toBe(0);

        const userAfter = await User.findById(testUserId);
        expect(userAfter.walletBalance).toBe(balanceBefore);
    });

    it('10. existing booking flow regression', async () => {
        await User.findByIdAndUpdate(testUserId, { walletBalance: 5000 });

        const res = await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                trainId: testTrain._id,
                journeyDate: new Date(Date.now() + 86400000 * 6).toISOString(),
                travelClass: 'SL',
                passengers: [
                    { name: 'Alice', age: 30, gender: 'Female' },
                    { name: 'Bob', age: 32, gender: 'Male' }
                ],
                contactDetails: { email: 'family@test.com', mobile: '9876543210' }
            });

        expect(res.status).toBe(201);
        expect(res.body.booking.passengers.length).toBe(2);
        expect(res.body.booking.status).toBe('Confirmed');

        const myBookingsRes = await request(app)
            .get('/api/bookings/mybookings')
            .set('Authorization', `Bearer ${userToken}`);

        expect(myBookingsRes.status).toBe(200);
        expect(Array.isArray(myBookingsRes.body)).toBe(true);
        expect(myBookingsRes.body.length).toBeGreaterThanOrEqual(1);

        const bookingByIdRes = await request(app)
            .get(`/api/bookings/${res.body.booking._id}`)
            .set('Authorization', `Bearer ${userToken}`);

        expect(bookingByIdRes.status).toBe(200);
        expect(bookingByIdRes.body.pnr).toBe(res.body.booking.pnr);
    });
});
