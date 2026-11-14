const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../server');
const HistoricalTrainProfile = require('../models/HistoricalTrainProfile');
const HistoricalSummary = require('../models/HistoricalSummary');

jest.setTimeout(30000);

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await HistoricalTrainProfile.deleteMany({});
    await HistoricalSummary.deleteMany({});
});

describe('Historical Analytics API Endpoints', () => {

    it('GET /api/historical/health should return health status', async () => {
        const res = await request(app).get('/api/historical/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('healthy');
        expect(res.body.source).toBe('KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET');
        expect(res.body.live).toBe(false);
    });

    it('GET /api/historical/summary should return summary statistics', async () => {
        await HistoricalSummary.create({
            summaryKey: 'GLOBAL_SUMMARY',
            totalRecords: 1500000,
            dateRange: '2018-2024',
            overallDelayRate: 0.7189,
            trainCount: 6293,
            routeCount: 576,
            zoneCount: 16
        });

        const res = await request(app).get('/api/historical/summary');
        expect(res.status).toBe(200);
        expect(res.body.totalHistoricalRecords).toBe(1500000);
        expect(res.body.overallDelayRate).toBe(0.7189);
        expect(res.body.source).toBe('KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET');
    });

    it('GET /api/historical/train/:trainNumber should return train historical profile or 404', async () => {
        await HistoricalTrainProfile.create({
            trainNumber: '12951',
            trainType: 'Rajdhani',
            sampleCount: 200,
            historicalOnTimeRate: 0.82,
            averageDelayMinutes: 10.5,
            zone: 'Western Railway'
        });

        const resFound = await request(app).get('/api/historical/train/12951');
        expect(resFound.status).toBe(200);
        expect(resFound.body.trainNumber).toBe('12951');
        expect(resFound.body.averageDelayMinutes).toBe(10.5);
        expect(resFound.body.source).toBe('KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET');

        const resNotFound = await request(app).get('/api/historical/train/99999');
        expect(resNotFound.status).toBe(404);
        expect(resNotFound.body.source).toBe('KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET');
    });

});
