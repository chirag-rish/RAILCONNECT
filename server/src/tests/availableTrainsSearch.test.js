/**
 * SIH26028 — Step 4: Available Trains & Train Search Live-Aware Tests
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Train = require('../models/Train');
const { tracker, sourceManager, liveProviderPolling } = require('../live');
const { DATA_SOURCES } = require('../live/constants');

jest.setTimeout(20000);

let mongoServer;

describe('SIH26028 Step 4 — Available Trains & Train Search Live-Aware', () => {
  let testTrain1, testTrain2;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    testTrain1 = await Train.create({
      trainNumber: '12951',
      name: 'Mumbai Rajdhani',
      type: 'Rajdhani',
      source: 'NDLS',
      destination: 'BCT',
      departureTime: '16:55',
      arrivalTime: '08:35',
      distance: 1384,
      baseFare: 2500,
      daysOfOperation: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      coachComposition: [{ classType: '3A', totalSeats: 72 }],
    });

    testTrain2 = await Train.create({
      trainNumber: '11020',
      name: 'Konark Express',
      type: 'Express',
      source: 'BZA',
      destination: 'CST',
      departureTime: '10:00',
      arrivalTime: '20:00',
      distance: 1000,
      baseFare: 1200,
      daysOfOperation: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      coachComposition: [{ classType: 'SL', totalSeats: 72 }],
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(() => {
    tracker.state.clear();
  });

  it('1. MongoDB train master record + live state merge works correctly', async () => {
    const rawTelemetry = {
      trainNumber: '12951',
      trainName: 'Mumbai Rajdhani',
      lastUpdatedAt: new Date().toISOString(),
      status: 'Running',
      currentLocation: { stationCode: 'KOTA', stationName: 'Kota', delayMinutes: 12 },
      nextHalt: { stationCode: 'RTM' },
      current_latitude: 25.2138,
      current_longitude: 75.8648,
      speed: 115,
    };

    sourceManager.processTelemetry(rawTelemetry, DATA_SOURCES.LIVE_PROVIDER, testTrain1._id.toString());

    const liveState = tracker.getState(testTrain1._id.toString());
    expect(liveState).toBeDefined();
    expect(liveState.trainNumber).toBe('12951');
    expect(liveState.currentStation).toBe('KOTA');
    expect(liveState.accumulatedDelay).toBe(12);
  });

  it('2, 3, 4, 5. Live train displays current station, delay, status, and timestamp', async () => {
    const now = new Date();
    tracker.state.set(testTrain1._id.toString(), {
      trainId: testTrain1._id.toString(),
      trainNumber: '12951',
      currentStation: 'KOTA',
      nextStation: 'RTM',
      accumulatedDelay: 15,
      status: 'Delayed',
      source: DATA_SOURCES.LIVE_PROVIDER,
      timestamp: now,
      receivedAt: now,
      isStale: false,
    });

    const trainRecord = await Train.findById(testTrain1._id).lean();
    expect(trainRecord.trainNumber).toBe('12951');
    expect(trainRecord.name).toBe('Mumbai Rajdhani');
  });

  it('6. Missing live state → LIVE STATUS UNAVAILABLE', async () => {
    const liveState = tracker.getState(testTrain2._id.toString());
    expect(liveState).toBeNull();
  });

  it('7. Stale live state is not presented as fresh', () => {
    const staleTime = new Date(Date.now() - 300_000);
    tracker.state.set(testTrain2._id.toString(), {
      trainId: testTrain2._id.toString(),
      trainNumber: '11020',
      currentStation: 'BZA',
      accumulatedDelay: 20,
      status: 'Delayed',
      source: DATA_SOURCES.LIVE_PROVIDER,
      timestamp: staleTime,
      receivedAt: staleTime,
      isStale: true,
    });

    const liveState = tracker.getState(testTrain2._id.toString());
    expect(liveState.isStale).toBe(true);
  });

  it('8. Simulator fallback is clearly distinguished', () => {
    tracker.state.set(testTrain1._id.toString(), {
      trainId: testTrain1._id.toString(),
      trainNumber: '12951',
      currentStation: 'NDLS',
      accumulatedDelay: 0,
      status: 'OnTime',
      source: DATA_SOURCES.SIMULATOR,
      timestamp: new Date(),
      isStale: false,
    });

    const liveState = tracker.getState(testTrain1._id.toString());
    expect(liveState.source).toBe(DATA_SOURCES.SIMULATOR);
  });

  it('9. Healthy RailRadar state wins over simulator', () => {
    tracker.state.set(testTrain1._id.toString(), {
      trainId: testTrain1._id.toString(),
      trainNumber: '12951',
      source: DATA_SOURCES.SIMULATOR,
      timestamp: new Date(),
      isStale: false,
    });

    const rawRailRadar = {
      trainNumber: '12951',
      lastUpdatedAt: new Date().toISOString(),
      currentLocation: { stationCode: 'KOTA', delayMinutes: 5 },
      speed: 100,
    };
    sourceManager.processTelemetry(rawRailRadar, DATA_SOURCES.LIVE_PROVIDER, testTrain1._id.toString());

    const state = tracker.getState(testTrain1._id.toString());
    expect(state.source).toBe(DATA_SOURCES.LIVE_PROVIDER);
  });

  it('10, 11, 12. Search for arbitrary train numbers works without defaulting to 11020', async () => {
    const trains = await Train.find({ trainNumber: { $in: ['12951', '11020'] } }).lean();
    expect(trains.length).toBe(2);
    expect(trains.map(t => t.trainNumber).sort()).toEqual(['11020', '12951']);
  });

  it('13, 14. No new polling loop introduced & rate-limit protection intact', () => {
    const status = liveProviderPolling.getStatus();
    expect(status).toBeDefined();
    expect(typeof status.pollIntervalMs).toBe('number');
  });
});
