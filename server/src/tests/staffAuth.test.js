const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../server');
const User = require('../models/User');
const Staff = require('../models/Staff');

jest.setTimeout(25000);

let mongoServer;
let tteToken;
let passengerToken;
let adminToken;

beforeAll(async () => {
    process.env.JWT_SECRET = 'testsecret';
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    await User.create([
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
    ]);

    await Staff.create([
        {
            name: 'Rajesh Kumar',
            email: 'tte1@example.com',
            password: 'tte12345',
            mobile: '9800000001',
            staffRole: 'TTE',
            designation: 'Senior TTE',
            department: 'Operations',
            gender: 'Male',
            employeeId: 'TTE001'
        }
    ]);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

describe('BUG-CRIT-02: TTE Authentication & RBAC', () => {
    it('1. TTE login succeeds', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'tte1@example.com', password: 'tte12345' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body.email).toBe('tte1@example.com');
        expect(res.body.role).toBe('tte');
        tteToken = res.body.token;
    });

    it('2. passenger login still works', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'passenger@example.com', password: 'password123' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body.role).toBe('passenger');
        passengerToken = res.body.token;
    });

    it('3. admin login still works', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@example.com', password: 'admin123' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body.role).toBe('admin');
        adminToken = res.body.token;
    });

    it('4. invalid staff password fails', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'tte1@example.com', password: 'wrongpassword' });

        expect(res.status).toBe(401);
    });

    it('5. authenticated TTE retains TTE authorization', async () => {
        const res = await request(app)
            .get('/api/tte/verify/PNR9999999')
            .set('Authorization', `Bearer ${tteToken}`);

        expect(res.status).toBe(404);

        const resPassenger = await request(app)
            .get('/api/tte/verify/PNR9999999')
            .set('Authorization', `Bearer ${passengerToken}`);

        expect(resPassenger.status).toBe(403);
    });
});
