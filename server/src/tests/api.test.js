const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../server');
const User = require('../models/User');

// Increase Jest timeout for slower CI environments
jest.setTimeout(20000);

let mongoServer;
let adminToken;
let userToken;
let testTrainId;

beforeAll(async () => {
    // Required for JWT generation in tests
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret';

    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                name: 'Test User',
                email: 'testuser@example.com',
                password: 'password123',
                mobile: '9876543210',
            });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('token');
        expect(res.body.email).toBe('testuser@example.com');
        expect(res.body).not.toHaveProperty('password');
        userToken = res.body.token;
    });

    it('should not register duplicate email', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                name: 'Duplicate',
                email: 'testuser@example.com',
                password: 'password123',
                mobile: '9876543210',
            });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/already exists/i);
    });

    it('should create an admin user via direct DB access and login', async () => {
        // Self-registration should not allow admin role, so we create one directly here for tests.
        const adminUser = await User.create({
            name: 'Admin',
            email: 'admin@test.com',
            password: 'adminpass123',
            mobile: '9999999999',
            role: 'admin',
        });

        expect(adminUser.role).toBe('admin');

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@test.com', password: 'adminpass123' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        adminToken = res.body.token;
    });
});

describe('POST /api/auth/login', () => {
    it('should login with correct credentials', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'testuser@example.com', password: 'password123' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
    });

    it('should reject wrong password', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'testuser@example.com', password: 'wrongpassword' });

        expect(res.status).toBe(401);
    });

    it('should reject non-existent user', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'nobody@test.com', password: 'test' });

        expect(res.status).toBe(401);
    });
});

describe('Train Management', () => {
    it('should add a train (admin only)', async () => {
        const res = await request(app)
            .post('/api/trains')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                trainNumber: '12951',
                name: 'Test Express',
                type: 'Express',
                source: 'NDLS',
                destination: 'BCT',
                departureTime: '10:00',
                arrivalTime: '22:00',
                distance: 1400,
                baseFare: 1000,
                daysOfOperation: ['Mon', 'Tue', 'Wed'],
                classes: ['SL', '3A'],
            });

        expect(res.status).toBe(201);
        expect(res.body.trainNumber).toBe('12951');
        testTrainId = res.body._id;
    });

    it('should reject train creation by non-admin', async () => {
        const res = await request(app)
            .post('/api/trains')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ trainNumber: '99999', name: 'Hack Train' });

        expect(res.status).toBe(403);
    });

    it('should search trains by source and destination', async () => {
        const date = new Date();
        while (date.getDay() !== 1) date.setDate(date.getDate() + 1);
        const dateStr = date.toISOString().split('T')[0];

        const res = await request(app)
            .get('/api/trains/search')
            .query({ source: 'NDLS', destination: 'BCT', date: dateStr });

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('should return 400 when search params missing', async () => {
        const res = await request(app).get('/api/trains/search');
        expect(res.status).toBe(400);
    });
});

describe('Booking Flow', () => {
    beforeAll(async () => {
        await request(app)
            .post('/api/wallet/add')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ amount: 5000 });
    });

    it('should create a booking', async () => {
        const res = await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                trainId: testTrainId,
                journeyDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                travelClass: 'SL',
                passengers: [
                    { name: 'John Doe', age: 30, gender: 'Male', idType: 'Aadhar', idNumber: '1234' }
                ],
                contactDetails: { email: 'john@test.com', mobile: '9876543210' },
            });

        if (res.status !== 201) {
            console.error('Booking create failed:', res.body);
        }

        expect(res.status).toBe(201);
        expect(res.body.booking).toHaveProperty('pnr');
        expect(res.body.booking.status).toBe('Confirmed');
        expect(res.body.booking.pnr).toHaveLength(10);
    });

    it('should get user bookings', async () => {
        const res = await request(app)
            .get('/api/bookings/mybookings')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
    });

    it('should reject booking without auth', async () => {
        const res = await request(app).post('/api/bookings').send({});
        expect(res.status).toBe(401);
    });
});

describe('Wallet', () => {
    it('should get wallet info', async () => {
        const res = await request(app)
            .get('/api/wallet')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('balance');
    });

    it('should add money to wallet', async () => {
        // Ensure balance is tracked correctly even after a booking deduction
        const before = await request(app)
            .get('/api/wallet')
            .set('Authorization', `Bearer ${userToken}`);

        expect(before.status).toBe(200);
        const previousBalance = before.body.balance;

        const res = await request(app)
            .post('/api/wallet/add')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ amount: 500 });

        expect(res.status).toBe(200);
        expect(res.body.balance).toBe(previousBalance + 500);
    });

    it('should reject negative amount', async () => {
        const res = await request(app)
            .post('/api/wallet/add')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ amount: -100 });

        expect(res.status).toBe(400);
    });
});

describe('Admin Analytics', () => {
    it('should get dashboard stats for admin', async () => {
        const res = await request(app)
            .get('/api/analytics/dashboard')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('totalBookings');
        expect(res.body).toHaveProperty('totalUsers');
        expect(res.body).toHaveProperty('totalRevenue');
        expect(res.body).toHaveProperty('recentBookings');
    });

    it('should deny analytics to non-admin', async () => {
        const res = await request(app)
            .get('/api/analytics/dashboard')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(403);
    });
});
