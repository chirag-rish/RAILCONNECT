/**
 * SIH26028 — RailRadar Primary & Simulator Fallback Tests
 *
 * Test Cycle 1: LIVE RAILRADAR (Primary source, normalized telemetry, tracking)
 * Test Cycle 2: RAILRADAR FAILURE → SIMULATOR (Automatic fallback on error/timeout/stale)
 * Test Cycle 3: SIMULATOR → RAILRADAR RECOVERY (Automatic recovery back to RailRadar)
 * Test Cycle 4: STATION REFERENCE POSITION PIPELINE (RailRadar without GPS coords)
 */

const {
  DATA_SOURCES,
  SOURCE_LABELS,
  STALENESS_THRESHOLDS_MS,
} = require('../live/constants');

const LiveTrainTracker = require('../live/liveTrainTracker');
const DataSourceManager = require('../live/dataSourceManager');
const LiveProviderAdapter = require('../live/adapters/liveProviderAdapter');
const liveProviderPolling = require('../live/liveProviderPollingService');
const { normalizeTelemetry } = require('../live/telemetrySchema');

describe('RailRadar Primary & Simulator Failover / Recovery', () => {
  let tracker;
  let sourceManager;

  beforeEach(() => {
    tracker = new LiveTrainTracker();
    sourceManager = new DataSourceManager(tracker, {
      LIVE_PROVIDER_ENABLED: 'true',
      LIVE_PROVIDER_NAME: 'RailRadar',
      LIVE_PROVIDER_API_ENDPOINT: 'https://api.railradar.in/v1',
      LIVE_PROVIDER_API_KEY: 'test-api-key',
    });
  });

  describe('Test Cycle 1: Normal Live Flow with RailRadar Primary', () => {
    it('should set RailRadar (LIVE_PROVIDER) as the active source when configured', () => {
      const activeSource = sourceManager.getActiveSource();
      expect(activeSource).toBe(DATA_SOURCES.LIVE_PROVIDER);
      expect(sourceManager.getActiveSourceLabel()).toBe('Live Provider — RailRadar');
    });

    it('should process and normalize live RailRadar telemetry with correct source metadata', () => {
      const rawRailRadarData = {
        success: true,
        data: {
          trainNumber: '12952',
          trainName: 'Mumbai Rajdhani',
          lastUpdatedAt: new Date().toISOString(),
          status: 'RUNNING',
          currentLocation: {
            stationCode: 'BVI',
            stationName: 'Borivali',
            delayMinutes: 5,
          },
          nextHalt: {
            stationCode: 'ST',
            stationName: 'Surat',
          },
          current_latitude: 19.2288,
          current_longitude: 72.8541,
          speed: 110,
          heading: 10,
          section_index: 1,
          progress_in_section: 25.5,
        },
      };

      const result = sourceManager.processTelemetry(
        rawRailRadarData,
        DATA_SOURCES.LIVE_PROVIDER,
        '507f1f77bcf86cd799439011'
      );

      expect(result.accepted).toBe(true);
      expect(result.source).toBe(DATA_SOURCES.LIVE_PROVIDER);

      const state = tracker.getState('507f1f77bcf86cd799439011');
      expect(state).toBeDefined();
      expect(state.trainNumber).toBe('12952');
      expect(state.source).toBe(DATA_SOURCES.LIVE_PROVIDER);
      expect(state.speed).toBe(110);
      expect(state.currentStation).toBe('BVI');
      expect(state.nextStation).toBe('ST');
      expect(state.accumulatedDelay).toBe(5);
      expect(state.isStale).toBe(false);
      expect(state.positionSource).toBe('GPS');
    });

    it('should support multiple arbitrary train numbers without hardcoding 11020', () => {
      const testTrains = ['12952', '12919', '12002', '11020'];

      testTrains.forEach((trainNum, idx) => {
        const payload = {
          trainNumber: trainNum,
          lastUpdatedAt: new Date().toISOString(),
          currentLocation: { stationCode: 'STN' + idx, delayMinutes: idx * 2 },
          nextHalt: { stationCode: 'NXT' + idx },
          speed: 80 + idx,
        };

        const res = sourceManager.processTelemetry(
          payload,
          DATA_SOURCES.LIVE_PROVIDER,
          'mock-id-' + trainNum
        );
        expect(res.accepted).toBe(true);

        const state = tracker.getState('mock-id-' + trainNum);
        expect(state.trainNumber).toBe(trainNum);
      });
    });
  });

  describe('Test Cycle 2: RailRadar Failure → Simulator Fallback', () => {
    it('should detect RailRadar inactivity/failure and report isTrainActive false', () => {
      expect(liveProviderPolling.isTrainActive('non-existent-train')).toBe(false);
    });

    it('should ingest simulator telemetry when RailRadar is unavailable', () => {
      const simTelemetry = {
        trainId: '507f1f77bcf86cd799439011',
        trainNumber: '12952',
        timestamp: new Date(),
        latitude: 19.23,
        longitude: 72.85,
        speed: 95,
        heading: 15,
        currentStation: 'BVI',
        nextStation: 'ST',
        sectionIndex: 1,
        progressInSection: 28,
        accumulatedDelay: 6,
        status: 'Delayed',
      };

      const result = sourceManager.processTelemetry(
        simTelemetry,
        DATA_SOURCES.SIMULATOR
      );

      expect(result.accepted).toBe(true);
      expect(result.source).toBe(DATA_SOURCES.SIMULATOR);

      const state = tracker.getState('507f1f77bcf86cd799439011');
      expect(state).toBeDefined();
      expect(state.source).toBe(DATA_SOURCES.SIMULATOR);
      expect(state.speed).toBe(95);
      expect(state.accumulatedDelay).toBe(6);
      expect(state.isStale).toBe(false);
    });
  });

  describe('Test Cycle 3: Simulator → RailRadar Recovery', () => {
    it('should switch back to RailRadar when fresh live provider data is received', () => {
      const simTelemetry = {
        trainId: '507f1f77bcf86cd799439011',
        trainNumber: '12952',
        timestamp: new Date(Date.now() - 10000),
        latitude: 19.23,
        longitude: 72.85,
        speed: 90,
        heading: 15,
        currentStation: 'BVI',
        nextStation: 'ST',
        sectionIndex: 1,
        progressInSection: 28,
        accumulatedDelay: 5,
        status: 'OnTime',
      };
      sourceManager.processTelemetry(simTelemetry, DATA_SOURCES.SIMULATOR);

      let currentState = tracker.getState('507f1f77bcf86cd799439011');
      expect(currentState.source).toBe(DATA_SOURCES.SIMULATOR);

      const recoveredRailRadar = {
        trainNumber: '12952',
        lastUpdatedAt: new Date().toISOString(),
        currentLocation: { stationCode: 'BVI', delayMinutes: 4 },
        nextHalt: { stationCode: 'ST' },
        current_latitude: 19.30,
        current_longitude: 72.88,
        speed: 105,
      };

      sourceManager.processTelemetry(
        recoveredRailRadar,
        DATA_SOURCES.LIVE_PROVIDER,
        '507f1f77bcf86cd799439011'
      );

      currentState = tracker.getState('507f1f77bcf86cd799439011');
      expect(currentState.source).toBe(DATA_SOURCES.LIVE_PROVIDER);
      expect(currentState.speed).toBe(105);
      expect(currentState.latitude).toBe(19.30);
    });
  });

  // ============================================================
  // TEST CYCLE 4 — STATION REFERENCE POSITION PIPELINE
  // ============================================================
  describe('Test Cycle 4: RailRadar without GPS → Station Reference Resolution', () => {
    const adapter = new LiveProviderAdapter({
      enabled: true,
      providerName: 'RailRadar',
      apiEndpoint: 'https://api.railradar.in/v1',
      apiKey: 'test-key',
    });

    it('should normalize RailRadar response with GPS as positionSource GPS', () => {
      const withGps = {
        trainNumber: '11020',
        lastUpdatedAt: new Date().toISOString(),
        status: 'RUNNING',
        currentLocation: { stationCode: 'JNTR', stationName: 'Jinti Road', delayMinutes: 35 },
        nextHalt: { stationCode: 'DD', stationName: 'Daund Jn' },
        current_latitude: 17.8,
        current_longitude: 75.2,
        speed: 60,
      };

      const norm = adapter.normalize(withGps);
      expect(norm.currentStation).toBe('JNTR');
      expect(norm.nextStation).toBe('DD');
      expect(norm.accumulatedDelay).toBe(35);
      expect(norm.latitude).toBe(17.8);
      expect(norm.longitude).toBe(75.2);
      expect(norm.positionSource).toBe('GPS');
    });

    it('should normalize RailRadar response without GPS as positionSource STATION_REFERENCE', () => {
      const withoutGps = {
        trainNumber: '11020',
        lastUpdatedAt: new Date().toISOString(),
        status: 'RUNNING',
        currentLocation: { stationCode: 'JNTR', stationName: 'Jinti Road', delayMinutes: 35 },
        nextHalt: { stationCode: 'DD', stationName: 'Daund Jn' },
        delayMinutes: 35,
      };

      const norm = adapter.normalize(withoutGps);
      expect(norm.currentStation).toBe('JNTR');
      expect(norm.nextStation).toBe('DD');
      expect(norm.accumulatedDelay).toBe(35);
      expect(norm.latitude).toBeNull();
      expect(norm.longitude).toBeNull();
      expect(norm.positionSource).toBe('STATION_REFERENCE');
    });

    it('should return positionSource UNKNOWN when no station or GPS', () => {
      const empty = {
        trainNumber: '11020',
        lastUpdatedAt: new Date().toISOString(),
        delayMinutes: 0,
      };

      const norm = adapter.normalize(empty);
      expect(norm.currentStation).toBeNull();
      expect(norm.nextStation).toBeNull();
      expect(norm.latitude).toBeNull();
      expect(norm.longitude).toBeNull();
      expect(norm.positionSource).toBe('UNKNOWN');
    });

    it('should preserve provider timestamp and delay from RailRadar', () => {
      const ts = '2026-09-08T20:48:13+05:30';
      const raw = {
        trainNumber: '12919',
        lastUpdatedAt: ts,
        status: 'running',
        currentLocation: { stationCode: 'WADI', delayMinutes: 12 },
        nextHalt: { stationCode: 'SEM' },
      };

      const norm = adapter.normalize(raw);
      expect(norm.trainNumber).toBe('12919');
      expect(norm.timestamp).toBeInstanceOf(Date);
      expect(norm.accumulatedDelay).toBe(12);
      expect(norm.currentStation).toBe('WADI');
      expect(norm.nextStation).toBe('SEM');
      expect(norm.positionSource).toBe('STATION_REFERENCE');
    });

    it('should accept live telemetry with station reference through DataSourceManager', () => {
      const railRadarNoGps = {
        success: true,
        data: {
          trainNumber: '12952',
          trainName: 'Mumbai Rajdhani',
          lastUpdatedAt: new Date().toISOString(),
          status: 'RUNNING',
          currentLocation: { stationCode: 'BCT', stationName: 'Mumbai Central', delayMinutes: 0 },
          nextHalt: { stationCode: 'ST', stationName: 'Surat' },
          delayMinutes: 0,
        },
      };

      const result = sourceManager.processTelemetry(
        railRadarNoGps,
        DATA_SOURCES.LIVE_PROVIDER,
        'test-train-id-bct'
      );

      expect(result.accepted).toBe(true);
      const state = tracker.getState('test-train-id-bct');
      expect(state).toBeDefined();
      expect(state.source).toBe(DATA_SOURCES.LIVE_PROVIDER);
      expect(state.trainNumber).toBe('12952');
      expect(state.currentStation).toBe('BCT');
      expect(state.nextStation).toBe('ST');
      expect(state.latitude).toBeNull();
      expect(state.longitude).toBeNull();
      expect(state.positionSource).toBe('STATION_REFERENCE');
    });

    it('should not default to train 11020 when any other train number is provided', () => {
      const raw = {
        trainNumber: '12919',
        lastUpdatedAt: new Date().toISOString(),
        currentLocation: { stationCode: 'NZM', delayMinutes: 10 },
        nextHalt: { stationCode: 'AGC' },
      };

      const norm = adapter.normalize(raw);
      expect(norm.trainNumber).toBe('12919');
      expect(norm.trainNumber).not.toBe('11020');
    });

    it('should emit positionSource through Socket.io broadcast', () => {
      let broadcastPayload = null;
      const mockIo = {
        to: () => ({
          emit: (event, payload) => {
            broadcastPayload = payload;
          },
        }),
      };

      tracker.setIo(mockIo);

      const railRadarNoGps = {
        success: true,
        data: {
          trainNumber: '12952',
          lastUpdatedAt: new Date().toISOString(),
          status: 'RUNNING',
          currentLocation: { stationCode: 'BCT', delayMinutes: 0 },
          nextHalt: { stationCode: 'ST' },
          delayMinutes: 0,
        },
      };

      sourceManager.processTelemetry(
        railRadarNoGps,
        DATA_SOURCES.LIVE_PROVIDER,
        'test-socket-train'
      );

      expect(broadcastPayload).toBeDefined();
      expect(broadcastPayload.positionSource).toBe('STATION_REFERENCE');
      expect(broadcastPayload.source).toBe(DATA_SOURCES.LIVE_PROVIDER);
    });
  });
});
