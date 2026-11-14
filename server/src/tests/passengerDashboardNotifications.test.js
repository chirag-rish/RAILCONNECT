const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { app } = require('../app');
const User = require('../models/User');

jest.setTimeout(25000);

let mongoServer;
let user1Token;
let user2Token;
let user1Id;
let user2Id;

beforeAll(async () => {
    process.env.JWT_SECRET = 'testsecret';
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const user1 = await User.create({
        name: 'User One',
        email: 'user1@example.com',
        password: 'password123',
        mobile: '9111111111',
        role: 'passenger',
        notifications: [
            { title: 'User 1 Alert', message: 'Notification for User 1', read: false }
        ]
    });
    user1Id = user1._id.toString();

    const user2 = await User.create({
        name: 'User Two',
        email: 'user2@example.com',
        password: 'password123',
        mobile: '9222222222',
        role: 'passenger',
        notifications: [
            { title: 'User 2 Alert', message: 'Notification for User 2', read: false }
        ]
    });
    user2Id = user2._id.toString();

    const login1 = await request(app).post('/api/auth/login').send({ email: 'user1@example.com', password: 'password123' });
    user1Token = login1.body.token;

    const login2 = await request(app).post('/api/auth/login').send({ email: 'user2@example.com', password: 'password123' });
    user2Token = login2.body.token;
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

describe('BUG-CRIT-03: Notifications & Passenger Dashboard Routes', () => {
    it('1. authenticated GET /api/notifications returns user notifications', async () => {
        const res = await request(app)
            .get('/api/notifications')
            .set('Authorization', `Bearer ${user1Token}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.notifications)).toBe(true);
        expect(res.body.notifications.length).toBe(1);
        expect(res.body.notifications[0].title).toBe('User 1 Alert');
    });

    it('2. authenticated GET /api/users/notifications returns user notifications', async () => {
        const res = await request(app)
            .get('/api/users/notifications')
            .set('Authorization', `Bearer ${user1Token}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.notifications)).toBe(true);
        expect(res.body.notifications[0].title).toBe('User 1 Alert');
    });

    it('3. unauthenticated notification request is rejected', async () => {
        const res = await request(app).get('/api/notifications');
        expect(res.status).toBe(401);

        const res2 = await request(app).get('/api/users/notifications');
        expect(res2.status).toBe(401);
    });

    it('4. notification data belongs only to authenticated user', async () => {
        const res1 = await request(app)
            .get('/api/notifications')
            .set('Authorization', `Bearer ${user1Token}`);
        
        const res2 = await request(app)
            .get('/api/notifications')
            .set('Authorization', `Bearer ${user2Token}`);

        expect(res1.body.notifications[0].title).toBe('User 1 Alert');
        expect(res2.body.notifications[0].title).toBe('User 2 Alert');
    });

    it('5. authenticated GET /api/users/dashboard returns passenger dashboard data', async () => {
        const res = await request(app)
            .get('/api/users/dashboard')
            .set('Authorization', `Bearer ${user1Token}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('user');
        expect(res.body.data.user.email).toBe('user1@example.com');
        expect(res.body.data).toHaveProperty('statistics');
        expect(res.body.data).toHaveProperty('walletBalance');
    });

    it('6. unauthenticated dashboard request is rejected', async () => {
        const res = await request(app).get('/api/users/dashboard');
        expect(res.status).toBe(401);
    });

    it('7. dashboard data belongs only to authenticated user', async () => {
        const res1 = await request(app)
            .get('/api/users/dashboard')
            .set('Authorization', `Bearer ${user1Token}`);

        const res2 = await request(app)
            .get('/api/users/dashboard')
            .set('Authorization', `Bearer ${user2Token}`);

        expect(res1.body.data.user.name).toBe('User One');
        expect(res2.body.data.user.name).toBe('User Two');
    });

    it('8. mark notification as read works for authenticated user', async () => {
        const notifId = (await User.findById(user1Id)).notifications[0]._id.toString();

        const res = await request(app)
            .post(`/api/users/notifications/${notifId}/read`)
            .set('Authorization', `Bearer ${user1Token}`);

        expect(res.status).toBe(200);
        const updatedUser = await User.findById(user1Id);
        expect(updatedUser.notifications[0].read).toBe(true);
    });
});
