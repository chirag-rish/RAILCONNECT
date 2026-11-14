const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../server');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

jest.setTimeout(25000);

let mongoServer;

beforeAll(async () => {
    process.env.JWT_SECRET = 'testsecret';
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const userSeedData = [
        {
            name: 'John Passenger',
            email: 'passenger@example.com',
            password: 'password123',
            mobile: '9876543210',
            role: 'passenger',
            gender: 'Male'
        },
        {
            name: 'Admin User',
            email: 'admin@example.com',
            password: 'admin123',
            mobile: '9876543211',
            role: 'admin',
            gender: 'Male'
        }
    ];
    await User.create(userSeedData);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

describe('BUG-CRIT-01: Seeded and Registered User Authentication', () => {
    it('seeded passenger login succeeds', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'passenger@example.com', password: 'password123' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body.email).toBe('passenger@example.com');
        expect(res.body.role).toBe('passenger');
    });

    it('seeded admin login succeeds', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@example.com', password: 'admin123' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body.email).toBe('admin@example.com');
        expect(res.body.role).toBe('admin');
    });

    it('newly registered user login still succeeds', async () => {
        const regRes = await request(app)
            .post('/api/auth/register')
            .send({
                name: 'New User',
                email: 'newuser@example.com',
                password: 'newpassword123',
                mobile: '9988776655'
            });

        expect(regRes.status).toBe(201);

        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'newuser@example.com', password: 'newpassword123' });

        expect(loginRes.status).toBe(200);
        expect(loginRes.body).toHaveProperty('token');
    });

    it('wrong password still fails', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'passenger@example.com', password: 'wrongpassword' });

        expect(res.status).toBe(401);
    });

    it('stored password is hashed, not plaintext', async () => {
        const user = await User.findOne({ email: 'passenger@example.com' }).select('+password');
        expect(user).not.toBeNull();
        expect(user.password).not.toBe('password123');
        expect(user.password.startsWith('$2')).toBe(true);

        const isMatch = await bcrypt.compare('password123', user.password);
        expect(isMatch).toBe(true);
    });
});
