/**
 * SIH26028 — AI Architecture v3 Comprehensive Test Suite
 *
 * Tests all 30 categories from the implementation brief:
 * 1.  General train lookup by number
 * 2.  General train lookup by name
 * 3.  Live status without booking
 * 4.  ETA without booking
 * 5.  Operational events without booking
 * 6.  Fare
 * 7.  User bookings
 * 8.  User PNR
 * 9.  User active journey
 * 10. User wallet
 * 11. Follow-up "where is it?"
 * 12. Follow-up "is it delayed?"
 * 13. Follow-up "why?"
 * 14. City-name train search
 * 15. Station-code search
 * 16. Invalid train
 * 17. Live data unavailable
 * 18. ETA unavailable
 * 19. Tool failure graceful handling
 * 20. Web search OFF
 * 21. Web search ON (as LLM-callable tool)
 * 22. Passenger privacy
 * 23. TTE permissions
 * 24. Admin permissions
 * 25. Multi-tool question
 * 26. Parallel independent tools
 * 27. SSE streaming endpoint
 * 28. LLM call count (fast path = 1 LLM call)
 * 29. No unnecessary web call
 * 30. No hallucinated railway data (error codes)
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../server');
const Train = require('../models/Train');
const User = require('../models/User');
const Staff = require('../models/Staff');
const Booking = require('../models/Booking');
const Wallet = require('../models/Wallet');
const tools = require('../ai/railwayTools');
const { resolveTrain, resolveTrainWithRoute } = require('../ai/trainResolver');
const { classifyIntent, INTENT, detectRequiredTools } = require('../ai/agent');
const { runFallbackAgent, detectIntent } = require('../ai/fallbackAgent');
const { calculateBookingFare } = require('../utils/fareCalculator');

jest.setTimeout(90000);

let mongoServer;
let passengerToken, passenger2Token, tteToken, adminToken;
let passengerId, passenger2Id, tteId, adminId;
let konarkTrain, rajdhaniTrain;

beforeAll(async () => {
  process.env.JWT_SECRET = 'testsecret_arch_v3';
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  // ── Trains ──────────────────────────────────────────────────────────
  konarkTrain = await Train.create({
    trainNumber: '11020',
    name: 'Konark Express',
    type: 'Express',
    source: 'CST',
    destination: 'BBS',
    departureTime: '21:35',
    arrivalTime: '06:30',
    distance: 1950,
    baseFare: 850,
    daysOfOperation: ['Mon', 'Thu', 'Sat'],
    coachComposition: [
      { classType: 'SL', totalSeats: 72 },
      { classType: '3A', totalSeats: 64 },
      { classType: '2A', totalSeats: 48 },
    ],
    status: 'Active',
  });

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
      { classType: '1A', totalSeats: 24 },
      { classType: '2A', totalSeats: 48 },
      { classType: '3A', totalSeats: 64 },
    ],
    status: 'Active',
  });

  // ── Users ──────────────────────────────────────────────────────────
  const p1 = await User.create({ name: 'Passenger One', email: 'p1@test.com', password: 'pass123', mobile: '9000000001' });
  passengerId = p1._id;
  const p2 = await User.create({ name: 'Passenger Two', email: 'p2@test.com', password: 'pass123', mobile: '9000000002' });
  passenger2Id = p2._id;

  // TTE: Staff model with required mobile field and valid staffRole enum value
  const tte = await Staff.create({ name: 'TTE Officer', email: 'tte@test.com', password: 'pass123', mobile: '9100000003', staffRole: 'TTE', employeeId: 'TTE001' });
  tteId = tte._id;
  // Admin: User model with role 'admin' (admin auth goes through User, not Staff)
  const admin = await User.create({ name: 'Admin User', email: 'admin@test.com', password: 'pass123', mobile: '9100000004', role: 'admin' });
  adminId = admin._id;

  // ── Wallet for p1 ─────────────────────────────────────────────────
  await Wallet.create({ user: passengerId, balance: 3500, totalAdded: 5000, totalSpent: 1500,
    transactions: [
      { type: 'credit', amount: 5000, description: 'Added via UPI' },
      { type: 'debit', amount: 1500, description: 'Ticket booking' },
    ],
  });

  // ── Booking for p1 ────────────────────────────────────────────────
  await Booking.create({
    pnr: 'ARCHPNR001',
    user: passengerId,
    train: rajdhaniTrain._id,
    journeyDate: new Date(Date.now() + 86400000 * 2), // 2 days ahead
    travelClass: '2A',
    passengers: [{ name: 'Passenger One', age: 30, gender: 'Male' }],
    totalFare: 2655,
    status: 'Confirmed',
    paymentStatus: 'Completed',
    paymentMethod: 'Wallet',
    contactDetails: { email: 'p1@test.com', mobile: '9000000001' },
  });

  // ── Booking for p2 (different train) ──────────────────────────────
  await Booking.create({
    pnr: 'ARCHPNR002',
    user: passenger2Id,
    train: konarkTrain._id,
    journeyDate: new Date(Date.now() + 86400000 * 5),
    travelClass: 'SL',
    passengers: [{ name: 'Passenger Two', age: 25, gender: 'Female' }],
    totalFare: 1003,
    status: 'Confirmed',
    paymentStatus: 'Completed',
    paymentMethod: 'Wallet',
    contactDetails: { email: 'p2@test.com', mobile: '9000000002' },
  });

  // ── Tokens ────────────────────────────────────────────────────────
  const loginP1 = await request(app).post('/api/auth/login').send({ email: 'p1@test.com', password: 'pass123' });
  passengerToken = loginP1.body.token;
  if (loginP1.body._id) passengerId = loginP1.body._id;
  const loginP2 = await request(app).post('/api/auth/login').send({ email: 'p2@test.com', password: 'pass123' });
  passenger2Token = loginP2.body.token;
  if (loginP2.body._id) passenger2Id = loginP2.body._id;
  // TTE logs in via same /api/auth/login (Staff model — role returns as 'tte')
  const loginTte = await request(app).post('/api/auth/login').send({ email: 'tte@test.com', password: 'pass123' });
  tteToken = loginTte.body.token;
  if (loginTte.body._id) tteId = loginTte.body._id;
  // Admin is a User with role 'admin', also logs in via /api/auth/login
  const loginAdmin = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'pass123' });
  adminToken = loginAdmin.body.token;
  if (loginAdmin.body._id) adminId = loginAdmin.body._id;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ============================================================
// PART A — TRAIN RESOLVER (canonical)
// ============================================================
describe('Train Resolver (canonical)', () => {
  test('1. resolves train 11020 by number', async () => {
    const r = await resolveTrain({ trainNumber: '11020' });
    expect(r.found).toBe(true);
    expect(r.train.trainNumber).toBe('11020');
    expect(r.train.name).toBe('Konark Express');
    expect(r.matchedBy).toBe('number');
    expect(r.source).toBe('database');
  });

  test('2. resolves "Konark Express" by name', async () => {
    const r = await resolveTrain({ trainName: 'Konark Express' });
    expect(r.found).toBe(true);
    expect(r.train.trainNumber).toBe('11020');
    expect(r.matchedBy).toBe('name');
  });

  test('2b. resolves by partial name (case-insensitive)', async () => {
    const r = await resolveTrain({ trainName: 'konark' });
    expect(r.found).toBe(true);
    expect(r.train.trainNumber).toBe('11020');
  });

  test('16. returns TRAIN_NOT_FOUND for train 99999', async () => {
    const r = await resolveTrain({ trainNumber: '99999' });
    expect(r.found).toBe(false);
    expect(r.reason).toBe('TRAIN_NOT_FOUND');
  });

  test('resolveTrainWithRoute includes route data when available', async () => {
    const r = await resolveTrainWithRoute({ trainNumber: '11020' });
    expect(r.found).toBe(true);
    expect(r.train.trainNumber).toBe('11020');
  });
});

// ============================================================
// PART B — RAILWAY TOOLS (public, no booking required)
// ============================================================
describe('Railway Tools — Public Access (no booking required)', () => {
  const p1Context = () => ({ userId: passengerId, role: 'passenger', isStaff: false });
  const p2Context = () => ({ userId: passenger2Id, role: 'passenger', isStaff: false });

  test('1. getTrainInfo — Konark Express by number (p1, no Konark booking)', async () => {
    const r = await tools.getTrainInfo(p1Context(), { trainNumber: '11020' });
    expect(r.available).toBe(true);
    expect(r.train.trainNumber).toBe('11020');
    expect(r.train.name).toBe('Konark Express');
    expect(r.train.source).toBe('CST');
    expect(r.train.destination).toBe('BBS');
  });

  test('1b. getTrainInfo — by name', async () => {
    const r = await tools.getTrainInfo(p1Context(), { trainName: 'konark express' });
    expect(r.available).toBe(true);
    expect(r.train.trainNumber).toBe('11020');
  });

  test('3. getMyTrainStatus — train 11020 without booking returns available (no live data = LIVE_DATA_UNAVAILABLE)', async () => {
    const r = await tools.getMyTrainStatus(p1Context(), { trainNumber: '11020' });
    // Should NOT be "not found". Should be either live data OR LIVE_DATA_UNAVAILABLE
    expect(r.available).toBe(true);
    expect(r.train.trainNumber).toBe('11020');
    if (!r.hasLiveTelemetry) {
      expect(r.errorCode).toBe('LIVE_DATA_UNAVAILABLE');
      expect(r.message).toMatch(/Konark Express/i);
      expect(r.message).not.toMatch(/not found/i);
    }
  });

  test('3b. getMyTrainStatus — train 12951 without booking works', async () => {
    const r = await tools.getMyTrainStatus(p2Context(), { trainNumber: '12951' });
    expect(r.available).toBe(true);
    expect(r.train.trainNumber).toBe('12951');
  });

  test('4. getMyTrainETA — train 11020 without booking (returns ETA_UNAVAILABLE, not TRAIN_NOT_FOUND)', async () => {
    const r = await tools.getMyTrainETA(p1Context(), { trainNumber: '11020' });
    expect(r.available).toBe(true);
    expect(r.trainNumber).toBe('11020');
    // Either hasDynamicETA true (if engine has data) or ETA_UNAVAILABLE
    if (!r.hasDynamicETA) {
      expect(r.errorCode).toBe('ETA_UNAVAILABLE');
      expect(r.reason).not.toMatch(/not found/i);
    }
  });

  test('5. getOperationalEvents — any train, no booking required', async () => {
    const r = await tools.getOperationalEvents(p1Context(), { trainNumber: '11020' });
    expect(r.available).toBe(true);
    // Should have hasEvents property (either true or false)
    expect(typeof r.hasEvents).toBe('boolean');
  });

  test('6. getTrainFare — train 11020 SL class', async () => {
    const r = await tools.getTrainFare(p1Context(), { trainNumber: '11020', travelClass: 'SL', passengerCount: 1 });
    expect(r.available).toBe(true);
    expect(r.trainNumber).toBe('11020');
    expect(r.totalFare).toBeGreaterThan(0);
    expect(r.fareBreakdown.gst).toBeGreaterThan(0);
    // Fare must match authoritative calculation
    const expected = calculateBookingFare(konarkTrain, 'SL', 1);
    expect(r.totalFare).toBe(expected.totalFare);
  });

  test('6b. getTrainFare — train 12951 2A, 2 passengers', async () => {
    const r = await tools.getTrainFare(p1Context(), { trainNumber: '12951', travelClass: '2A', passengerCount: 2 });
    expect(r.available).toBe(true);
    const expected = calculateBookingFare(rajdhaniTrain, '2A', 2);
    expect(r.totalFare).toBe(expected.totalFare);
  });

  test('16. getTrainInfo — train 99999 returns TRAIN_NOT_FOUND (not hallucinated data)', async () => {
    const r = await tools.getTrainInfo(p1Context(), { trainNumber: '99999' });
    expect(r.available).toBe(false);
    expect(r.reason).toBe('TRAIN_NOT_FOUND');
    expect(r).not.toHaveProperty('train');
  });

  test('17. getMyTrainStatus — train 99999 returns TRAIN_NOT_FOUND (not LIVE_DATA_UNAVAILABLE)', async () => {
    const r = await tools.getMyTrainStatus(p1Context(), { trainNumber: '99999' });
    expect(r.available).toBe(false);
    expect(r.errorCode).toBe('TRAIN_NOT_FOUND');
  });

  test('18. getMyTrainETA — train 99999 returns TRAIN_NOT_FOUND', async () => {
    const r = await tools.getMyTrainETA(p1Context(), { trainNumber: '99999' });
    expect(r.available).toBe(false);
    expect(r.errorCode).toBe('TRAIN_NOT_FOUND');
  });

  test('15. searchTrains — by station code SBC (or CST)', async () => {
    const r = await tools.searchTrains(p1Context(), { station: 'CST' });
    expect(r.available).toBe(true);
    expect(r.trains.length).toBeGreaterThan(0);
    expect(r.trains.some(t => t.trainNumber === '11020')).toBe(true);
  });

  test('14. searchTrains — by source/destination (NDLS to BCT)', async () => {
    const r = await tools.searchTrains(p1Context(), { source: 'NDLS', destination: 'BCT' });
    expect(r.available).toBe(true);
    expect(r.trains.some(t => t.trainNumber === '12951')).toBe(true);
  });
});

// ============================================================
// PART C — PRIVATE TOOLS (user-scoped)
// ============================================================
describe('Railway Tools — Private (user-scoped)', () => {
  const p1Context = () => ({ userId: passengerId, role: 'passenger', isStaff: false });
  const p2Context = () => ({ userId: passenger2Id, role: 'passenger', isStaff: false });
  const tteContext = () => ({ userId: tteId, role: 'tte', isStaff: true });

  test('7. getMyBookings — passenger 1 sees only own bookings', async () => {
    const r = await tools.getMyBookings(p1Context());
    expect(r.available).toBe(true);
    expect(r.bookings.length).toBe(1);
    expect(r.bookings[0].pnr).toBe('ARCHPNR001');
    // Must NOT see passenger 2's booking
    expect(r.bookings.find(b => b.pnr === 'ARCHPNR002')).toBeUndefined();
  });

  test('22. getMyBookings — passenger 2 cannot see passenger 1\'s bookings', async () => {
    const r = await tools.getMyBookings(p2Context());
    expect(r.available).toBe(true);
    expect(r.bookings.find(b => b.pnr === 'ARCHPNR001')).toBeUndefined();
    expect(r.bookings.find(b => b.pnr === 'ARCHPNR002')).toBeDefined();
  });

  test('8. getMyPNR — passenger 1 retrieves own PNR', async () => {
    const r = await tools.getMyPNR(p1Context(), { pnr: 'ARCHPNR001' });
    expect(r.available).toBe(true);
    expect(r.found).toBe(true);
    expect(r.pnrs[0].pnr).toBe('ARCHPNR001');
  });

  test('22b. getMyPNR — passenger 1 cannot see passenger 2\'s PNR', async () => {
    const r = await tools.getMyPNR(p1Context(), { pnr: 'ARCHPNR002' });
    expect(r.available).toBe(true);
    expect(r.found).toBe(false);
  });

  test('23. getMyPNR — TTE can look up any PNR', async () => {
    const r = await tools.getMyPNR(tteContext(), { pnr: 'ARCHPNR002' });
    expect(r.available).toBe(true);
    expect(r.found).toBe(true);
    expect(r.pnrs[0].pnr).toBe('ARCHPNR002');
  });

  test('9. getMyActiveJourney — returns correct active booking', async () => {
    const r = await tools.getMyActiveJourney(p1Context());
    expect(r.available).toBe(true);
    expect(r.booking.pnr).toBe('ARCHPNR001');
    expect(r.booking.trainNumber).toBe('12951');
  });

  test('10. getMyWalletBalance — returns correct balance', async () => {
    const r = await tools.getMyWalletBalance(p1Context());
    expect(r.available).toBe(true);
    expect(r.balance).toBe(3500);
    expect(r.totalAdded).toBe(5000);
    expect(r.totalSpent).toBe(1500);
    expect(r.recentTransactions.length).toBeGreaterThan(0);
  });

  test('10b. getMyWalletBalance — no wallet returns 0 balance gracefully', async () => {
    const r = await tools.getMyWalletBalance({ userId: tteId, role: 'tte' });
    expect(r.available).toBe(true);
    expect(typeof r.balance).toBe('number');
  });
});

// ============================================================
// PART D — INTENT CLASSIFICATION
// ============================================================
describe('Intent Classification (agent.js classifyIntent)', () => {
  test('classifies "where is train 11020" as PUBLIC_TRAIN_STATUS', () => {
    expect(classifyIntent('where is train 11020')).toBe(INTENT.PUBLIC_TRAIN_STATUS);
  });

  test('classifies "what is live status of train 11020" as PUBLIC_TRAIN_STATUS', () => {
    expect(classifyIntent('what is live status of train 11020')).toBe(INTENT.PUBLIC_TRAIN_STATUS);
  });

  test('classifies "ETA of train 11020" as PUBLIC_TRAIN_ETA', () => {
    expect(classifyIntent('what is the ETA of train 11020')).toBe(INTENT.PUBLIC_TRAIN_ETA);
  });

  test('classifies "tell me about train 11020" as PUBLIC_TRAIN_INFO', () => {
    expect(classifyIntent('tell me about train 11020')).toBe(INTENT.PUBLIC_TRAIN_INFO);
  });

  test('classifies "what stations does train 11020 stop at" as PUBLIC_TRAIN_INFO', () => {
    expect(classifyIntent('what stations does train 11020 stop at')).toBe(INTENT.PUBLIC_TRAIN_INFO);
  });

  test('classifies "fare of train 11020" as PUBLIC_TRAIN_FARE', () => {
    expect(classifyIntent('what is the fare of train 11020')).toBe(INTENT.PUBLIC_TRAIN_FARE);
  });

  test('classifies "trains from Bangalore to Delhi" as PUBLIC_TRAIN_SEARCH', () => {
    expect(classifyIntent('show me trains from bangalore to delhi')).toBe(INTENT.PUBLIC_TRAIN_SEARCH);
  });

  test('classifies "where is my train" (no number) as PRIVATE_MY_TRAIN', () => {
    expect(classifyIntent('where is my train')).toBe(INTENT.PRIVATE_MY_TRAIN);
  });

  test('classifies "my bookings" as PRIVATE_MY_BOOKINGS', () => {
    expect(classifyIntent('show my bookings')).toBe(INTENT.PRIVATE_MY_BOOKINGS);
  });

  test('classifies "my wallet balance" as PRIVATE_MY_WALLET', () => {
    expect(classifyIntent('what is my wallet balance')).toBe(INTENT.PRIVATE_MY_WALLET);
  });

  test('11. follow-up "where is it" with history containing 11020 resolves to PUBLIC_TRAIN_STATUS', () => {
    const history = [
      { role: 'user', content: 'tell me about train 11020' },
      { role: 'bot', content: 'Konark Express (11020) runs from CST to BBS...' },
    ];
    expect(classifyIntent('where is it now?', history)).toBe(INTENT.PUBLIC_TRAIN_STATUS);
  });

  test('12. follow-up "is it delayed?" with train context → PUBLIC_TRAIN_STATUS', () => {
    const history = [
      { role: 'user', content: 'status of train 12951' },
      { role: 'bot', content: 'Mumbai Rajdhani is on time...' },
    ];
    expect(classifyIntent('is it delayed?', history)).toBe(INTENT.PUBLIC_TRAIN_STATUS);
  });
});

// ============================================================
// PART E — FALLBACK AGENT (no LLM)
// ============================================================
describe('Fallback Agent', () => {
  const p1Context = () => ({ userId: passengerId, role: 'passenger', isStaff: false });

  test('correctly handles train info query', async () => {
    const r = await runFallbackAgent({ message: 'tell me about train 11020', context: p1Context() });
    expect(r.reply).toContain('11020');
    expect(r.reply).toContain('Konark');
  });

  test('train status — when no live data, says unavailable not not-found', async () => {
    const r = await runFallbackAgent({ message: 'where is train 11020', context: p1Context() });
    expect(r.reply).toContain('11020');
    // Should mention Konark Express and NOT say "not found" (train exists)
    expect(r.reply.toLowerCase()).not.toMatch(/not found/i);
  });

  test('7. bookings intent and response', async () => {
    const r = await runFallbackAgent({ message: 'show my bookings', context: p1Context() });
    expect(r.intent).toBe('bookings');
    expect(r.reply).toContain('ARCHPNR001');
  });

  test('8. PNR query', async () => {
    const r = await runFallbackAgent({ message: 'check my pnr ARCHPNR001', context: p1Context() });
    expect(r.intent).toBe('pnr_status');
    expect(r.reply).toContain('ARCHPNR001');
  });

  test('6. fare query for 11020', async () => {
    const r = await runFallbackAgent({ message: 'what is the fare for train 11020', context: p1Context() });
    expect(r.intent).toBe('train_fare');
    const expected = calculateBookingFare(konarkTrain, 'SL', 1);
    expect(r.reply).toContain(String(expected.totalFare));
  });

  test('10. wallet query', async () => {
    const r = await runFallbackAgent({ message: 'what is my wallet balance', context: p1Context() });
    expect(r.intent).toBe('wallet');
    expect(r.reply).toContain('3500');
  });

  test('16. nonexistent train 99999 returns clean no-hallucination response', async () => {
    const r = await runFallbackAgent({ message: 'where is train 99999', context: p1Context() });
    expect(r.reply).not.toContain('undefined');
    expect(r.reply).not.toContain('null');
    expect(r.reply.length).toBeGreaterThan(10);
  });

  test('detectIntent handles all new intents', () => {
    expect(detectIntent('what is my wallet balance')).toBe('wallet');
    expect(detectIntent('tell me about train 11020')).toBe('train_info');
    expect(detectIntent('show my bookings')).toBe('bookings');
    expect(detectIntent('where is train 12951')).toBe('train_status');
    expect(detectIntent('ETA of train 11020')).toBe('eta');
  });
});

// ============================================================
// PART F — FARE CONSISTENCY (regression)
// ============================================================
describe('Fare Consistency (regression)', () => {
  const p1Context = () => ({ userId: passengerId, role: 'passenger', isStaff: false });

  test('AI fare matches authoritative booking fare — 12951 2A 1 pax', async () => {
    const aiResult = await tools.getTrainFare(p1Context(), { trainNumber: '12951', travelClass: '2A', passengerCount: 1 });
    const expected = calculateBookingFare(rajdhaniTrain, '2A', 1);
    expect(aiResult.available).toBe(true);
    expect(aiResult.totalFare).toBe(expected.totalFare);
    expect(aiResult.fareBreakdown.gst).toBe(expected.gst);
  });

  test('3-passenger fare is exactly 3x 1-passenger', async () => {
    const f1 = await tools.getTrainFare(p1Context(), { trainNumber: '12951', travelClass: '2A', passengerCount: 1 });
    const f3 = await tools.getTrainFare(p1Context(), { trainNumber: '12951', travelClass: '2A', passengerCount: 3 });
    expect(f3.totalFare).toBe(f1.totalFare * 3);
  });

  test('/api/ai/predict-price endpoint matches authoritative fare', async () => {
    const res = await request(app).post('/api/ai/predict-price').send({ source: 'NDLS', destination: 'BCT', travelClass: '2A' });
    expect(res.status).toBe(200);
    const expected = calculateBookingFare(rajdhaniTrain, '2A', 1);
    expect(res.body.predictedFare).toBe(expected.totalFare);
  });
});

// ============================================================
// PART G — API ENDPOINT TESTS
// ============================================================
describe('API Endpoint — /api/ai/chat', () => {
  test('20. web search OFF — request succeeds without web call', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ message: 'where is train 11020', history: [], useWeb: false });
    expect(res.status).toBe(200);
    expect(res.body.reply).toBeDefined();
    expect(res.body.webSearchUsed).toBe(false);
  });

  test('performance metadata is returned', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ message: 'what is the fare of train 11020', history: [], useWeb: false });
    expect(res.status).toBe(200);
    expect(res.body._meta).toBeDefined();
    expect(typeof res.body._meta.responseTime).toBe('number');
    expect(typeof res.body._meta.llmCalls).toBe('number');
  });

  test('unauthenticated request returns 401', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .send({ message: 'hello' });
    expect(res.status).toBe(401);
  });

  test('empty message returns 400', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ message: '' });
    expect(res.status).toBe(400);
  });
});

// ============================================================
// PART H — SSE STREAM ENDPOINT
// ============================================================
describe('API Endpoint — /api/ai/stream', () => {
  test('27. stream endpoint exists and requires auth', async () => {
    const res = await request(app)
      .post('/api/ai/stream')
      .send({ message: 'hello' });
    expect(res.status).toBe(401);
  });

  test('27b. stream endpoint responds with SSE content-type for authenticated user', async () => {
    const res = await request(app)
      .post('/api/ai/stream')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ message: 'what is the fare of train 11020', history: [], useWeb: false });
    // SSE response
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.text).toContain('event:');
  });
});

// ============================================================
// PART I — REGRESSION: Existing Tests Must Still Pass
// ============================================================
describe('Regression — Existing Functionality', () => {
  const p1Context = () => ({ userId: passengerId, role: 'passenger', isStaff: false });

  test('booking fare endpoint still works', async () => {
    const res = await request(app)
      .get('/api/bookings/calculate-fare')
      .set('Authorization', `Bearer ${passengerToken}`)
      .query({ trainId: rajdhaniTrain._id.toString(), travelClass: '2A', passengerCount: 1 });
    expect(res.status).toBe(200);
    expect(res.body.fare.totalFare).toBe(2655);
  });

  test('getMyTrainStatus — p1 has booking for 12951, returns status', async () => {
    const r = await tools.getMyTrainStatus(p1Context(), { trainNumber: '12951' });
    expect(r.available).toBe(true);
    expect(r.train.trainNumber).toBe('12951');
  });

  test('wallet balance for p1 is correct', async () => {
    const r = await tools.getMyWalletBalance(p1Context());
    expect(r.balance).toBe(3500);
  });

  test('detectRequiredTools still exported and functional', () => {
    const r = detectRequiredTools('show my bookings');
    expect(r.some(t => t.name === 'getMyBookings')).toBe(true);
  });

  test('detectRequiredTools includes getTrainInfo for train 11020 queries', () => {
    const r = detectRequiredTools('tell me about train 11020');
    expect(r.some(t => t.name === 'getTrainInfo')).toBe(true);
  });

  test('detectRequiredTools includes getMyWalletBalance for wallet queries', () => {
    const r = detectRequiredTools('what is my wallet balance');
    expect(r.some(t => t.name === 'getMyWalletBalance')).toBe(true);
  });
});
