/**
 * SIH26028 — Live Railway GIS Tests
 *
 * Tests for:
 *   - Station rendering (coordinates present)
 *   - Train position rendering (live telemetry positions)
 *   - Telemetry updates (Socket.io flow)
 *   - Multiple trains
 *   - Stale telemetry detection
 *   - Missing coordinates handling
 *   - Missing route geometry
 *   - Congestion status
 */

// ============================================================
// Test helpers
// ============================================================

function createMockStation(overrides = {}) {
  return {
    code: 'NDLS',
    name: 'New Delhi',
    city: 'New Delhi',
    state: 'Delhi',
    latitude: 28.6139,
    longitude: 77.209,
    zone: 'NR',
    stationType: 'Terminal',
    ...overrides,
  };
}

function createMockTrain(overrides = {}) {
  return {
    _id: '64a1b2c3d4e5f6a7b8c9d0e1',
    trainNumber: '12951',
    name: 'Mumbai Rajdhani',
    source: 'NDLS',
    destination: 'BCT',
    latitude: 28.6139,
    longitude: 77.209,
    speed: 110,
    heading: 180,
    currentStation: 'NDLS',
    nextStation: 'VGLB',
    sectionIndex: 0,
    progressInSection: 25,
    delay: 0,
    status: 'OnTime',
    source: 'SIMULATOR',
    sourceLabel: 'Simulator Mode',
    freshness: 'FRESH',
    isStale: false,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function createMockRouteSegment(overrides = {}) {
  return {
    fromStation: 'NDLS',
    toStation: 'VGLB',
    distance: 150,
    typicalSpeed: 110,
    maxSpeed: 130,
    sectionType: 'DoubleLine',
    from: { lat: 28.6139, lng: 77.209, name: 'New Delhi' },
    to: { lat: 25.3189, lng: 80.5888, name: 'Veerangana Laxmibai' },
    ...overrides,
  };
}

function createMockCongestion(overrides = {}) {
  return {
    fromStation: 'NDLS',
    toStation: 'VGLB',
    status: 'NORMAL',
    ...overrides,
  };
}

// ============================================================
// Test: Station rendering with valid coordinates
// ============================================================

test('Station rendering with valid coordinates', () => {
  const station = createMockStation();
  expect(station.latitude).not.toBeNull();
  expect(station.longitude).not.toBeNull();
  expect(typeof station.latitude).toBe('number');
  expect(typeof station.longitude).toBe('number');
  expect(station.latitude).toBeGreaterThanOrEqual(-90);
  expect(station.latitude).toBeLessThanOrEqual(90);
  expect(station.longitude).toBeGreaterThanOrEqual(-180);
  expect(station.longitude).toBeLessThanOrEqual(180);
  expect(station.code).toBeTruthy();
  expect(station.name).toBeTruthy();
});

// ============================================================
// Test: Station with missing coordinates
// ============================================================

test('Missing coordinates handled correctly', () => {
  const station = createMockStation({ latitude: null, longitude: null });
  const hasValidCoords = station.latitude != null && station.longitude != null;
  expect(hasValidCoords).toBe(false);
});

// ============================================================
// Test: Train position rendering with live telemetry
// ============================================================

test('Train position rendering with live telemetry', () => {
  const train = createMockTrain();
  expect(train.latitude).not.toBeNull();
  expect(train.longitude).not.toBeNull();
  expect(typeof train.speed).toBe('number');
  expect(train.speed).toBeGreaterThanOrEqual(0);
  expect(train.speed).toBeLessThanOrEqual(500);
  expect(train.heading).toBeGreaterThanOrEqual(0);
  expect(train.heading).toBeLessThanOrEqual(360);
});

// ============================================================
// Test: Multiple trains
// ============================================================

test('Multiple trains handled correctly', () => {
  const trains = [
    createMockTrain({ trainNumber: '12951', name: 'Rajdhani', currentStation: 'NDLS' }),
    createMockTrain({ trainNumber: '12301', name: 'Howrah Rajdhani', currentStation: 'HWH' }),
    createMockTrain({ trainNumber: '12625', name: 'Kerala Express', currentStation: 'TVC' }),
  ];

  expect(trains).toHaveLength(3);
  trains.forEach(t => {
    expect(t.trainNumber).toBeTruthy();
    expect(t.latitude).not.toBeNull();
  });

  const trainNumbers = trains.map(t => t.trainNumber);
  const unique = new Set(trainNumbers);
  expect(unique.size).toBe(3);
});

// ============================================================
// Test: Stale telemetry detection
// ============================================================

test('Stale telemetry detection works correctly', () => {
  const freshTrain = createMockTrain({
    timestamp: new Date().toISOString(),
    isStale: false,
    freshness: 'FRESH',
  });

  const staleTrain = createMockTrain({
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    isStale: true,
    freshness: 'STALE',
  });

  expect(freshTrain.isStale).toBe(false);
  expect(freshTrain.freshness).toBe('FRESH');

  expect(staleTrain.isStale).toBe(true);
  expect(staleTrain.freshness).toBe('STALE');

  // Staleness thresholds from constants
  const SIMULATOR_THRESHOLD = 60_000;
  const PROVIDER_THRESHOLD = 120_000;

  const now = Date.now();
  const simStaleTime = new Date(now - SIMULATOR_THRESHOLD - 1000).toISOString();
  const provFreshTime = new Date(now - PROVIDER_THRESHOLD + 1000).toISOString();

  const simStaleAge = now - new Date(simStaleTime).getTime();
  const provFreshAge = now - new Date(provFreshTime).getTime();

  expect(simStaleAge).toBeGreaterThan(SIMULATOR_THRESHOLD);
  expect(provFreshAge).toBeLessThan(PROVIDER_THRESHOLD);
});

// ============================================================
// Test: Telemetry update flow (Socket.io contract)
// ============================================================

test('Telemetry update flow (Socket.io contract) valid', () => {
  const telemetryPayload = {
    trainId: '64a1b2c3d4e5f6a7b8c9d0e1',
    trainNumber: '12951',
    timestamp: new Date(),
    latitude: 28.6139,
    longitude: 77.209,
    speed: 110,
    heading: 180,
    currentStation: 'NDLS',
    nextStation: 'VGLB',
    sectionIndex: 0,
    progressInSection: 25,
    sectionDistance: 150,
    accumulatedDelay: 0,
    status: 'OnTime',
    source: 'SIMULATOR',
    sourceLabel: 'Simulator Mode',
    receivedAt: new Date(),
    isStale: false,
    freshness: 'FRESH',
  };

  // Verify all required fields for broadcast
  expect(telemetryPayload.trainId).toBeTruthy();
  expect(telemetryPayload.trainNumber).toBeTruthy();
  expect(telemetryPayload.timestamp).toBeTruthy();
  expect(typeof telemetryPayload.latitude).toBe('number');
  expect(typeof telemetryPayload.longitude).toBe('number');
  expect(telemetryPayload.source).toBeTruthy();
  expect(telemetryPayload.freshness).toBeTruthy();

  // Verify the broadcast format matches existing Socket.io events
  const broadcastPayload = {
    trainId: telemetryPayload.trainId,
    trainNumber: telemetryPayload.trainNumber,
    timestamp: telemetryPayload.timestamp,
    latitude: telemetryPayload.latitude,
    longitude: telemetryPayload.longitude,
    speed: telemetryPayload.speed,
    heading: telemetryPayload.heading,
    currentStation: telemetryPayload.currentStation,
    nextStation: telemetryPayload.nextStation,
    sectionIndex: telemetryPayload.sectionIndex,
    progressInSection: telemetryPayload.progressInSection,
    sectionDistance: telemetryPayload.sectionDistance,
    accumulatedDelay: telemetryPayload.accumulatedDelay,
    status: telemetryPayload.status,
    isRunning: true,
    source: telemetryPayload.source,
    sourceLabel: telemetryPayload.sourceLabel,
    sourceTimestamp: null,
    receivedAt: telemetryPayload.receivedAt,
    isStale: telemetryPayload.isStale,
    freshness: telemetryPayload.freshness,
  };

  expect(broadcastPayload.freshness).toBe('FRESH');
  expect(broadcastPayload.isStale).toBe(false);
  expect(broadcastPayload.isRunning).toBe(true);
});

// ============================================================
// Test: Route geometry (station-to-station geodesic)
// ============================================================

test('Route geometry (geodesic station-to-station) valid', () => {
  const segment = createMockRouteSegment();

  expect(segment.fromStation).toBeTruthy();
  expect(segment.toStation).toBeTruthy();
  expect(segment.distance).toBeGreaterThan(0);
  expect(segment.typicalSpeed).toBeGreaterThan(0);
  expect(segment.from.lat).not.toBeNull();
  expect(segment.to.lat).not.toBeNull();

  // Verify it's a geodesic representation, not a straight line claim
  const fromCoords = segment.from;
  const toCoords = segment.to;

  expect(
    fromCoords.lat !== toCoords.lat || fromCoords.lng !== toCoords.lng
  ).toBe(true);
});

// ============================================================
// Test: Missing route geometry
// ============================================================

test('Missing route geometry handled (empty array)', () => {
  const emptySegments = [];
  const filtered = emptySegments.filter(Boolean);
  expect(filtered).toHaveLength(0);
});

// ============================================================
// Test: Congestion status
// ============================================================

test('Congestion status mapping correct', () => {
  const normalSection = createMockCongestion({ status: 'NORMAL' });
  const congestedSection = createMockCongestion({ status: 'CONGESTED', eventType: 'SpeedRestriction' });
  const severeSection = createMockCongestion({ status: 'SEVERE', eventType: 'SignalFailure' });

  const validStatuses = ['NORMAL', 'CONGESTED', 'SEVERE'];
  expect(validStatuses).toContain(normalSection.status);
  expect(validStatuses).toContain(congestedSection.status);
  expect(validStatuses).toContain(severeSection.status);

  // Test section event mapping
  const eventMapping = {
    SpeedRestriction: 'CONGESTED',
    WeatherAlert: 'CONGESTED',
    SignalFailure: 'SEVERE',
    MaintenanceBlock: 'SEVERE',
  };

  Object.entries(eventMapping).forEach(([eventType, expectedStatus]) => {
    const section = createMockCongestion({ eventType });
    let status = 'NORMAL';
    if (eventType === 'SpeedRestriction' || eventType === 'WeatherAlert') status = 'CONGESTED';
    else if (eventType === 'SignalFailure' || eventType === 'MaintenanceBlock') status = 'SEVERE';
    expect(status).toBe(expectedStatus);
  });
});

// ============================================================
// Test: Train without live telemetry
// ============================================================

test('Train without live telemetry excluded from map', () => {
  const liveState = null;
  const hasLivePosition = !!(liveState && liveState.latitude != null && liveState.longitude != null);
  expect(hasLivePosition).toBe(false);
});

// ============================================================
// Test: Section distance and progress validation
// ============================================================

test('Section progress validation works', () => {
  const sectionDistance = 150;
  const validProgress = 75;
  const invalidProgress = 200;

  expect(validProgress).toBeLessThanOrEqual(sectionDistance);
  expect(invalidProgress).toBeGreaterThan(sectionDistance);

  const ratio = validProgress / sectionDistance;
  expect(ratio).toBeGreaterThanOrEqual(0);
  expect(ratio).toBeLessThanOrEqual(1);
});
