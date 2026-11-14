/**
 * SIH26028 — Phase 5A: Live Data Ingestion Core — Tests
 *
 * Covers:
 *  1. Telemetry normalization
 *  2. Source identification
 *  3. Invalid telemetry rejection
 *  4. Stale telemetry detection
 *  5. Simulator adapter
 *  6. Source fallback
 *  7. Live train state
 *  8. Socket.io emission
 *  9. Health/status endpoint
 */

const {
  normalizeTelemetry,
  validateTelemetry,
  isStale,
  DATA_SOURCES,
  SOURCE_LABELS,
  STALENESS_THRESHOLDS_MS,
  VALIDATION_LIMITS,
} = require('../live');

const LiveTrainTracker = require('../live/liveTrainTracker');
const DataSourceManager = require('../live/dataSourceManager');
const SimulatorAdapter = require('../live/adapters/simulatorAdapter');
const RTISAdapter = require('../live/adapters/rtisAdapter');
const NTESAdapter = require('../live/adapters/ntesAdapter');
const LiveProviderAdapter = require('../live/adapters/liveProviderAdapter');
const { createAdapters } = require('../live/adapters');

jest.setTimeout(15000);

// ============================================================
// 1. TELEMETRY NORMALIZATION
// ============================================================

describe('Telemetry Normalization', () => {
  it('should normalize raw telemetry with all fields', () => {
    const raw = {
      trainId: 'train123',
      trainNumber: '11020',
      timestamp: new Date('2026-09-05T10:00:00Z'),
      latitude: 17.385,
      longitude: 78.4867,
      speed: 80,
      heading: 45,
      currentStation: 'SC',
      nextStation: 'NED',
      sectionIndex: 2,
      progressInSection: 50,
      accumulatedDelay: 5,
      status: 'OnTime',
      source: DATA_SOURCES.SIMULATOR,
    };

    const result = normalizeTelemetry(raw);

    expect(result.trainId).toBe('train123');
    expect(result.trainNumber).toBe('11020');
    expect(result.timestamp).toBeInstanceOf(Date);
    expect(result.latitude).toBe(17.385);
    expect(result.longitude).toBe(78.4867);
    expect(result.speed).toBe(80);
    expect(result.heading).toBe(45);
    expect(result.currentStation).toBe('SC');
    expect(result.nextStation).toBe('NED');
    expect(result.sectionIndex).toBe(2);
    expect(result.progressInSection).toBe(50);
    expect(result.accumulatedDelay).toBe(5);
    expect(result.status).toBe('OnTime');
    expect(result.source).toBe(DATA_SOURCES.SIMULATOR);
    expect(result.receivedAt).toBeInstanceOf(Date);
    expect(result.isStale).toBe(false);
  });

  it('should handle null optional fields', () => {
    const raw = {
      trainId: 'train456',
      trainNumber: '12951',
      timestamp: new Date(),
    };

    const result = normalizeTelemetry(raw);

    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
    expect(result.speed).toBeNull();
    expect(result.heading).toBeNull();
    expect(result.currentStation).toBeNull();
    expect(result.nextStation).toBeNull();
    expect(result.source).toBe(DATA_SOURCES.SIMULATOR);
  });

  it('should convert string timestamp to Date', () => {
    const raw = {
      trainId: 't1',
      trainNumber: '11020',
      timestamp: '2026-09-05T12:00:00Z',
    };

    const result = normalizeTelemetry(raw);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it('should default source to SIMULATOR when not specified', () => {
    const raw = {
      trainId: 't1',
      trainNumber: '11020',
      timestamp: new Date(),
    };

    const result = normalizeTelemetry(raw);
    expect(result.source).toBe(DATA_SOURCES.SIMULATOR);
  });
});

// ============================================================
// 2. SOURCE IDENTIFICATION
// ============================================================

describe('Source Identification', () => {
  it('should have exactly three data sources', () => {
    const keys = Object.values(DATA_SOURCES);
    expect(keys).toContain('OFFICIAL_RAILWAY');
    expect(keys).toContain('LIVE_PROVIDER');
    expect(keys).toContain('SIMULATOR');
  });

  it('should have labels for all sources', () => {
    expect(SOURCE_LABELS[DATA_SOURCES.OFFICIAL_RAILWAY]).toBeDefined();
    expect(SOURCE_LABELS[DATA_SOURCES.LIVE_PROVIDER]).toBeDefined();
    expect(SOURCE_LABELS[DATA_SOURCES.SIMULATOR]).toBeDefined();
  });

  it('should preserve source through normalization', () => {
    const raw = {
      trainId: 't1',
      trainNumber: '11020',
      timestamp: new Date(),
      source: DATA_SOURCES.OFFICIAL_RAILWAY,
    };

    const result = normalizeTelemetry(raw);
    expect(result.source).toBe(DATA_SOURCES.OFFICIAL_RAILWAY);
  });
});

// ============================================================
// 3. INVALID TELEMETRY REJECTION
// ============================================================

describe('Invalid Telemetry Rejection', () => {
  it('should reject telemetry without trainId', () => {
    const t = normalizeTelemetry({
      trainNumber: '11020',
      timestamp: new Date(),
    });
    const result = validateTelemetry(t);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(['Missing trainId']));
  });

  it('should reject telemetry without trainNumber', () => {
    const t = normalizeTelemetry({
      trainId: 't1',
      timestamp: new Date(),
    });
    const result = validateTelemetry(t);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(['Missing trainNumber']));
  });

  it('should reject invalid timestamp', () => {
    const t = normalizeTelemetry({
      trainId: 't1',
      trainNumber: '11020',
      timestamp: 'not-a-date',
    });
    const result = validateTelemetry(t);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should reject timestamp too far in the future', () => {
    const t = normalizeTelemetry({
      trainId: 't1',
      trainNumber: '11020',
      timestamp: new Date(Date.now() + VALIDATION_LIMITS.MAX_FUTURE_DRIFT_MS + 1000),
    });
    const result = validateTelemetry(t);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('future')]));
  });

  it('should reject timestamp too far in the past', () => {
    const t = normalizeTelemetry({
      trainId: 't1',
      trainNumber: '11020',
      timestamp: new Date(Date.now() - VALIDATION_LIMITS.MAX_PAST_DRIFT_MS - 1000),
    });
    const result = validateTelemetry(t);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('past')]));
  });

  it('should reject invalid latitude', () => {
    const t = normalizeTelemetry({
      trainId: 't1',
      trainNumber: '11020',
      timestamp: new Date(),
      latitude: 999,
    });
    const result = validateTelemetry(t);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('latitude')]));
  });

  it('should reject invalid longitude', () => {
    const t = normalizeTelemetry({
      trainId: 't1',
      trainNumber: '11020',
      timestamp: new Date(),
      longitude: -200,
    });
    const result = validateTelemetry(t);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('longitude')]));
  });

  it('should reject negative speed', () => {
    const t = normalizeTelemetry({
      trainId: 't1',
      trainNumber: '11020',
      timestamp: new Date(),
      speed: -10,
    });
    const result = validateTelemetry(t);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('Negative speed')]));
  });

  it('should reject speed exceeding physical limit', () => {
    const t = normalizeTelemetry({
      trainId: 't1',
      trainNumber: '11020',
      timestamp: new Date(),
      speed: 600,
    });
    const result = validateTelemetry(t);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('physical limit')]));
  });

  it('should accept valid telemetry', () => {
    const t = normalizeTelemetry({
      trainId: 't1',
      trainNumber: '11020',
      timestamp: new Date(),
      latitude: 17.38,
      longitude: 78.48,
      speed: 80,
      heading: 90,
      currentStation: 'SC',
      nextStation: 'NED',
      sectionIndex: 1,
      progressInSection: 50,
      accumulatedDelay: 3,
      status: 'OnTime',
      source: DATA_SOURCES.SIMULATOR,
    });
    const result = validateTelemetry(t);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ============================================================
// 4. STALE TELEMETRY DETECTION
// ============================================================

describe('Stale Telemetry Detection', () => {
  it('should detect stale simulator telemetry (> 300s)', () => {
    const t = normalizeTelemetry({
      trainId: 't1',
      trainNumber: '11020',
      timestamp: new Date(Date.now() - 350_000),
      source: DATA_SOURCES.SIMULATOR,
    });

    expect(isStale(t, STALENESS_THRESHOLDS_MS)).toBe(true);
  });

  it('should detect fresh simulator telemetry (< 300s)', () => {
    const t = normalizeTelemetry({
      trainId: 't1',
      trainNumber: '11020',
      timestamp: new Date(Date.now() - 10_000),
      source: DATA_SOURCES.SIMULATOR,
    });

    expect(isStale(t, STALENESS_THRESHOLDS_MS)).toBe(false);
  });

  it('should detect stale official telemetry (> 300s)', () => {
    const t = normalizeTelemetry({
      trainId: 't1',
      trainNumber: '11020',
      timestamp: new Date(Date.now() - 350_000),
      source: DATA_SOURCES.OFFICIAL_RAILWAY,
    });

    expect(isStale(t, STALENESS_THRESHOLDS_MS)).toBe(true);
  });

  it('should treat unknown source as stale', () => {
    const t = normalizeTelemetry({
      trainId: 't1',
      trainNumber: '11020',
      timestamp: new Date(),
      source: 'UNKNOWN_SOURCE',
    });

    expect(isStale(t, STALENESS_THRESHOLDS_MS)).toBe(true);
  });

  it('should treat missing timestamp as stale', () => {
    const t = { source: DATA_SOURCES.SIMULATOR, timestamp: null };
    expect(isStale(t, STALENESS_THRESHOLDS_MS)).toBe(true);
  });
});

// ============================================================
// 5. SIMULATOR ADAPTER
// ============================================================

describe('Simulator Adapter', () => {
  let adapter;

  beforeAll(() => {
    adapter = new SimulatorAdapter();
  });

  it('should always be available', () => {
    expect(adapter.isAvailable()).toBe(true);
  });

  it('should have SIMULATOR source key', () => {
    expect(adapter.sourceKey).toBe(DATA_SOURCES.SIMULATOR);
  });

  it('should normalize simulator telemetry', () => {
    const simData = {
      trainId: 'abc123',
      trainNumber: '11020',
      timestamp: new Date(),
      latitude: 17.38,
      longitude: 78.48,
      speed: 80,
      heading: 90,
      currentStation: 'SC',
      nextStation: 'NED',
      sectionIndex: 2,
      progressInSection: 45,
      accumulatedDelay: 5,
      status: 'OnTime',
    };

    const result = adapter.normalize(simData);
    expect(result.trainId).toBe('abc123');
    expect(result.trainNumber).toBe('11020');
    expect(result.speed).toBe(80);
    expect(result.source).toBeUndefined(); // source added by DataSourceManager
  });
});

// ============================================================
// 6. STUB ADAPTERS
// ============================================================

describe('RTIS/NTES/LiveProvider Stubs', () => {
  it('RTIS should not be available without config', () => {
    const rtis = new RTISAdapter();
    expect(rtis.isAvailable()).toBe(false);
  });

  it('RTIS should be available with full config', () => {
    const rtis = new RTISAdapter({
      enabled: true,
      apiEndpoint: 'https://rtis.example.com',
      apiKey: 'test-key',
      organizationId: 'org-123',
    });
    expect(rtis.isAvailable()).toBe(true);
  });

  it('NTES should not be available without config', () => {
    const ntes = new NTESAdapter();
    expect(ntes.isAvailable()).toBe(false);
  });

  it('LiveProvider should not be available without config', () => {
    const lp = new LiveProviderAdapter();
    expect(lp.isAvailable()).toBe(false);
  });

  it('LiveProvider should be available with full config', () => {
    const lp = new LiveProviderAdapter({
      enabled: true,
      providerName: 'TestProvider',
      apiEndpoint: 'https://provider.example.com',
      apiKey: 'key-123',
    });
    expect(lp.isAvailable()).toBe(true);
  });

  it('normalize should throw for unimplemented stubs', () => {
    const rtis = new RTISAdapter({ enabled: true, apiEndpoint: 'x', apiKey: 'y', organizationId: 'z' });
    expect(() => rtis.normalize({})).toThrow(/Not yet implemented/);
  });
});

// ============================================================
// 7. ADAPTER REGISTRY
// ============================================================

describe('Adapter Registry (createAdapters)', () => {
  it('should create all four adapters', () => {
    const adapters = createAdapters({});
    expect(adapters.simulator).toBeDefined();
    expect(adapters.rtis).toBeDefined();
    expect(adapters.ntes).toBeDefined();
    expect(adapters.liveProvider).toBeDefined();
  });

  it('simulator should always be available', () => {
    const adapters = createAdapters({});
    expect(adapters.simulator.isAvailable()).toBe(true);
  });

  it('stubs should not be available without env config', () => {
    const adapters = createAdapters({});
    expect(adapters.rtis.isAvailable()).toBe(false);
    expect(adapters.ntes.isAvailable()).toBe(false);
    expect(adapters.liveProvider.isAvailable()).toBe(false);
  });

  it('should enable RTIS when env vars are set', () => {
    const adapters = createAdapters({
      RTIS_ENABLED: 'true',
      RTIS_API_ENDPOINT: 'https://rtis.example.com',
      RTIS_API_KEY: 'key123',
      RTIS_ORG_ID: 'org456',
    });
    expect(adapters.rtis.isAvailable()).toBe(true);
  });
});

// ============================================================
// 8. LIVE TRAIN TRACKER
// ============================================================

describe('LiveTrainTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new LiveTrainTracker();
  });

  it('should start with zero trains', () => {
    const health = tracker.getHealth();
    expect(health.activeTrains).toBe(0);
    expect(health.stats.totalIngested).toBe(0);
  });

  it('should accept valid telemetry', () => {
    const telemetry = normalizeTelemetry({
      trainId: 'train1',
      trainNumber: '11020',
      timestamp: new Date(),
      latitude: 17.38,
      longitude: 78.48,
      speed: 80,
      currentStation: 'SC',
      source: DATA_SOURCES.SIMULATOR,
    });

    const accepted = tracker.ingest(telemetry);
    expect(accepted).toBe(true);
    expect(tracker.getHealth().activeTrains).toBe(1);
  });

  it('should reject invalid telemetry', () => {
    const telemetry = normalizeTelemetry({
      trainId: null,
      trainNumber: '11020',
      timestamp: new Date(),
      source: DATA_SOURCES.SIMULATOR,
    });

    const accepted = tracker.ingest(telemetry, ['Missing trainId']);
    expect(accepted).toBe(false);
    expect(tracker.getHealth().stats.invalidTelemetry).toBe(1);
  });

  it('should store latest state per train', () => {
    const t1 = normalizeTelemetry({
      trainId: 'train1',
      trainNumber: '11020',
      timestamp: new Date(),
      speed: 80,
      source: DATA_SOURCES.SIMULATOR,
    });

    tracker.ingest(t1);

    const state = tracker.getState('train1');
    expect(state).not.toBeNull();
    expect(state.trainNumber).toBe('11020');
    expect(state.speed).toBe(80);
  });

  it('should update state on subsequent ingestions', () => {
    tracker.ingest(normalizeTelemetry({
      trainId: 'train1',
      trainNumber: '11020',
      timestamp: new Date(),
      speed: 80,
      source: DATA_SOURCES.SIMULATOR,
    }));

    tracker.ingest(normalizeTelemetry({
      trainId: 'train1',
      trainNumber: '11020',
      timestamp: new Date(),
      speed: 100,
      source: DATA_SOURCES.SIMULATOR,
    }));

    const state = tracker.getState('train1');
    expect(state.speed).toBe(100);
  });

  it('should track multiple trains independently', () => {
    tracker.ingest(normalizeTelemetry({
      trainId: 'train1', trainNumber: '11020', timestamp: new Date(), source: DATA_SOURCES.SIMULATOR,
    }));
    tracker.ingest(normalizeTelemetry({
      trainId: 'train2', trainNumber: '12951', timestamp: new Date(), source: DATA_SOURCES.SIMULATOR,
    }));

    expect(tracker.getHealth().activeTrains).toBe(2);
    expect(tracker.getState('train1')).not.toBeNull();
    expect(tracker.getState('train2')).not.toBeNull();
  });

  it('should return null for unknown trainId', () => {
    expect(tracker.getState('nonexistent')).toBeNull();
  });

  it('should detect stale trains', () => {
    tracker.ingest(normalizeTelemetry({
      trainId: 'fresh',
      trainNumber: '11020',
      timestamp: new Date(),
      source: DATA_SOURCES.SIMULATOR,
    }));

    tracker.ingest(normalizeTelemetry({
      trainId: 'stale',
      trainNumber: '12951',
      timestamp: new Date(Date.now() - 350_000),
      source: DATA_SOURCES.SIMULATOR,
    }));

    const health = tracker.getHealth();
    expect(health.staleTrains).toBe(1);
  });

  it('should track source breakdown', () => {
    tracker.ingest(normalizeTelemetry({
      trainId: 's1', trainNumber: '11020', timestamp: new Date(), source: DATA_SOURCES.SIMULATOR,
    }));
    tracker.ingest(normalizeTelemetry({
      trainId: 's2', trainNumber: '12951', timestamp: new Date(), source: DATA_SOURCES.SIMULATOR,
    }));

    const health = tracker.getHealth();
    expect(health.sources[DATA_SOURCES.SIMULATOR]).toBe(2);
  });

  it('should return all states', () => {
    tracker.ingest(normalizeTelemetry({
      trainId: 'a', trainNumber: '11020', timestamp: new Date(), source: DATA_SOURCES.SIMULATOR,
    }));
    tracker.ingest(normalizeTelemetry({
      trainId: 'b', trainNumber: '12951', timestamp: new Date(), source: DATA_SOURCES.SIMULATOR,
    }));

    const all = tracker.getAllStates();
    expect(Object.keys(all)).toHaveLength(2);
  });
});

// ============================================================
// 9. SOCKET.IO EMISSION
// ============================================================

describe('Socket.io Emission', () => {
  let tracker;
  let mockIo;

  beforeEach(() => {
    tracker = new LiveTrainTracker();

    mockIo = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
    tracker.setIo(mockIo);
  });

  it('should emit train:update on ingestion', () => {
    const telemetry = normalizeTelemetry({
      trainId: 'train1',
      trainNumber: '11020',
      timestamp: new Date(),
      latitude: 17.38,
      longitude: 78.48,
      speed: 80,
      heading: 45,
      currentStation: 'SC',
      nextStation: 'NED',
      sectionIndex: 2,
      progressInSection: 45,
      accumulatedDelay: 3,
      status: 'OnTime',
      source: DATA_SOURCES.SIMULATOR,
    });

    tracker.ingest(telemetry);

    // Should have called io.to() twice (train room + telemetry:all)
    expect(mockIo.to).toHaveBeenCalledTimes(2);
    expect(mockIo.emit).toHaveBeenCalledTimes(2);

    // Check train room emission
    const trainCall = mockIo.to.mock.calls[0];
    expect(trainCall[0]).toBe('train:train1');

    // Check the emitted payload has source metadata
    const emitCall = mockIo.emit.mock.calls[0];
    expect(emitCall[0]).toBe('train:update');
    expect(emitCall[1].source).toBe(DATA_SOURCES.SIMULATOR);
    expect(emitCall[1].freshness).toBe('FRESH');
  });

  it('should emit telemetry:all to global room', () => {
    const telemetry = normalizeTelemetry({
      trainId: 'train1',
      trainNumber: '11020',
      timestamp: new Date(),
      source: DATA_SOURCES.SIMULATOR,
    });

    tracker.ingest(telemetry);

    const allCall = mockIo.to.mock.calls[1];
    expect(allCall[0]).toBe('telemetry:all');

    const emitAll = mockIo.emit.mock.calls[1];
    expect(emitAll[0]).toBe('train:telemetry');
  });

  it('should include freshness metadata in payload', () => {
    const fresh = normalizeTelemetry({
      trainId: 'f1',
      trainNumber: '11020',
      timestamp: new Date(),
      source: DATA_SOURCES.SIMULATOR,
    });
    tracker.ingest(fresh);
    const payload = mockIo.emit.mock.calls[0][1];
    expect(payload.freshness).toBe('FRESH');

    mockIo.emit.mockClear();
    mockIo.to.mockClear();

    const stale = normalizeTelemetry({
      trainId: 's1',
      trainNumber: '12951',
      timestamp: new Date(Date.now() - 350_000),
      source: DATA_SOURCES.SIMULATOR,
    });
    tracker.ingest(stale);
    const stalePayload = mockIo.emit.mock.calls[0][1];
    expect(stalePayload.freshness).toBe('STALE');
  });

  it('should not emit if io is not set', () => {
    const noIoTracker = new LiveTrainTracker();
    const telemetry = normalizeTelemetry({
      trainId: 'train1',
      trainNumber: '11020',
      timestamp: new Date(),
      source: DATA_SOURCES.SIMULATOR,
    });

    // Should not throw
    expect(() => noIoTracker.ingest(telemetry)).not.toThrow();
  });
});

// ============================================================
// 10. DATA SOURCE MANAGER
// ============================================================

describe('DataSourceManager', () => {
  let tracker;
  let manager;

  beforeEach(() => {
    tracker = new LiveTrainTracker();
    manager = new DataSourceManager(tracker, {});
  });

  it('should default to SIMULATOR as active source when no external configured', () => {
    expect(manager.getActiveSource()).toBe(DATA_SOURCES.SIMULATOR);
  });

  it('should report source status', () => {
    const status = manager.getSourceStatus();
    expect(status[DATA_SOURCES.SIMULATOR].available).toBe(true);
    expect(status[DATA_SOURCES.SIMULATOR].active).toBe(true);
    expect(status[DATA_SOURCES.OFFICIAL_RAILWAY].available).toBe(false);
    expect(status[DATA_SOURCES.LIVE_PROVIDER].available).toBe(false);
  });

  it('should have human-readable source label', () => {
    expect(manager.getActiveSourceLabel()).toContain('Simulator');
  });

  it('should process simulator telemetry', () => {
    const rawSimData = {
      trainId: 'train1',
      trainNumber: '11020',
      timestamp: new Date(),
      latitude: 17.38,
      longitude: 78.48,
      speed: 80,
      heading: 45,
      currentStation: 'SC',
      nextStation: 'NED',
      sectionIndex: 2,
      progressInSection: 45,
      accumulatedDelay: 3,
      status: 'OnTime',
    };

    const result = manager.processTelemetry(rawSimData);
    expect(result.accepted).toBe(true);
    expect(result.source).toBe(DATA_SOURCES.SIMULATOR);
    expect(tracker.getState('train1')).not.toBeNull();
  });

  it('should correctly preserve trainId when processing simulator telemetry even if live provider is active source', () => {
    const lpManager = new DataSourceManager(tracker, {
      LIVE_PROVIDER_ENABLED: 'true',
      LIVE_PROVIDER_NAME: 'TestProvider',
      LIVE_PROVIDER_API_ENDPOINT: 'https://test.example.com',
      LIVE_PROVIDER_API_KEY: 'key',
    });

    expect(lpManager.getActiveSource()).toBe(DATA_SOURCES.LIVE_PROVIDER);

    const rawSimData = {
      trainId: 'train_mongo_id_123',
      trainNumber: '11020',
      timestamp: new Date(),
      latitude: 17.38,
      longitude: 78.48,
      speed: 80,
      heading: 45,
      currentStation: 'SC',
      nextStation: 'NED',
      sectionIndex: 2,
      progressInSection: 45,
      accumulatedDelay: 3,
      status: 'OnTime',
    };

    const result = lpManager.processTelemetry(rawSimData, DATA_SOURCES.SIMULATOR);
    expect(result.accepted).toBe(true);
    expect(result.source).toBe(DATA_SOURCES.SIMULATOR);
    expect(tracker.getState('train_mongo_id_123')).not.toBeNull();
    expect(tracker.getState('train_mongo_id_123').trainId).toBe('train_mongo_id_123');
  });

  it('should reject invalid telemetry through manager', () => {
    const badData = {
      trainId: null,
      trainNumber: '11020',
      timestamp: new Date(),
    };

    const result = manager.processTelemetry(badData);
    expect(result.accepted).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should activate RTIS when configured', () => {
    const rtisManager = new DataSourceManager(tracker, {
      RTIS_ENABLED: 'true',
      RTIS_API_ENDPOINT: 'https://rtis.example.com',
      RTIS_API_KEY: 'key123',
      RTIS_ORG_ID: 'org456',
    });

    expect(rtisManager.getActiveSource()).toBe(DATA_SOURCES.OFFICIAL_RAILWAY);
  });

  it('should activate live provider when configured', () => {
    const lpManager = new DataSourceManager(tracker, {
      LIVE_PROVIDER_ENABLED: 'true',
      LIVE_PROVIDER_NAME: 'TestProvider',
      LIVE_PROVIDER_API_ENDPOINT: 'https://test.example.com',
      LIVE_PROVIDER_API_KEY: 'key',
    });

    expect(lpManager.getActiveSource()).toBe(DATA_SOURCES.LIVE_PROVIDER);
  });

  it('should prioritize RTIS over live provider', () => {
    const bothManager = new DataSourceManager(tracker, {
      RTIS_ENABLED: 'true',
      RTIS_API_ENDPOINT: 'https://rtis.example.com',
      RTIS_API_KEY: 'key1',
      RTIS_ORG_ID: 'org1',
      LIVE_PROVIDER_ENABLED: 'true',
      LIVE_PROVIDER_NAME: 'TestProvider',
      LIVE_PROVIDER_API_ENDPOINT: 'https://test.example.com',
      LIVE_PROVIDER_API_KEY: 'key2',
    });

    expect(bothManager.getActiveSource()).toBe(DATA_SOURCES.OFFICIAL_RAILWAY);
  });

  it('should not expose secrets in source status', () => {
    const statusWithKeys = new DataSourceManager(tracker, {
      RTIS_API_KEY: 'super-secret-key',
      LIVE_PROVIDER_API_KEY: 'also-secret',
    });

    const status = statusWithKeys.getSourceStatus();
    const statusStr = JSON.stringify(status);
    expect(statusStr).not.toContain('super-secret-key');
    expect(statusStr).not.toContain('also-secret');
  });
});

// ============================================================
// 11. INGEST HEALTH ENDPOINT (via supertest)
// ============================================================

describe('Ingest Health Endpoint', () => {
  const request = require('supertest');
  const express = require('express');

  let app;
  let tracker;
  let manager;

  beforeAll(() => {
    tracker = new LiveTrainTracker();
    manager = new DataSourceManager(tracker, {});
    const createRoutes = require('../routes/ingestHealthRoutes');

    app = express();
    app.use('/api/ingest', createRoutes(tracker, manager));

    // Seed some data
    tracker.ingest(normalizeTelemetry({
      trainId: 't1', trainNumber: '11020', timestamp: new Date(), speed: 80,
      source: DATA_SOURCES.SIMULATOR, currentStation: 'SC',
    }));
    tracker.ingest(normalizeTelemetry({
      trainId: 't2', trainNumber: '12951', timestamp: new Date(Date.now() - 350_000), speed: 60,
      source: DATA_SOURCES.SIMULATOR, currentStation: 'NDLS',
    }));
  });

  it('GET /api/ingest/health should return health info', async () => {
    const res = await request(app).get('/api/ingest/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.activeSource).toBe(DATA_SOURCES.SIMULATOR);
    expect(res.body.trains.active).toBe(2);
    expect(res.body.trains.stale).toBeGreaterThanOrEqual(1);
    expect(res.body.ingestion.totalIngested).toBeGreaterThanOrEqual(2);
  });

  it('GET /api/ingest/sources should return source status', async () => {
    const res = await request(app).get('/api/ingest/sources');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.sources[DATA_SOURCES.SIMULATOR].available).toBe(true);
  });

  it('GET /api/ingest/trains should return tracked trains', async () => {
    const res = await request(app).get('/api/ingest/trains');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(2);
    expect(Array.isArray(res.body.trains)).toBe(true);
    expect(res.body.trains[0]).toHaveProperty('trainNumber');
    expect(res.body.trains[0]).toHaveProperty('source');
    expect(res.body.trains[0]).toHaveProperty('isStale');
  });
});

// ============================================================
// 12. CONSTANTS VERIFICATION
// ============================================================

describe('Phase 5A Constants', () => {
  it('should have correct staleness thresholds', () => {
    expect(STALENESS_THRESHOLDS_MS[DATA_SOURCES.OFFICIAL_RAILWAY]).toBe(300_000);
    expect(STALENESS_THRESHOLDS_MS[DATA_SOURCES.LIVE_PROVIDER]).toBe(300_000);
    expect(STALENESS_THRESHOLDS_MS[DATA_SOURCES.SIMULATOR]).toBe(300_000);
  });

  it('should have correct validation limits', () => {
    expect(VALIDATION_LIMITS.MIN_LATITUDE).toBe(-90);
    expect(VALIDATION_LIMITS.MAX_LATITUDE).toBe(90);
    expect(VALIDATION_LIMITS.MAX_SPEED_KMH).toBe(500);
  });

  it('DATA_SOURCES should be frozen', () => {
    expect(Object.isFrozen(DATA_SOURCES)).toBe(true);
  });
});
