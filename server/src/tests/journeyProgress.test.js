/**
 * Journey progress calculation tests
 * Ensures distance-based progress is clamped, monotonic with section travel,
 * and never reports 0% after intermediate stations are departed.
 */

const {
  calculateJourneyProgress,
  JOURNEY_STATUS,
} = require('../utils/journeyProgress');

const konarkRoute = {
  totalDistance: 1230,
  stations: [
    { station: 'BZA', distanceFromOrigin: 0 },
    { station: 'WL', distanceFromOrigin: 207 },
    { station: 'SC', distanceFromOrigin: 349 },
    { station: 'NED', distanceFromOrigin: 620 },
    { station: 'PVR', distanceFromOrigin: 679 },
    { station: 'MMR', distanceFromOrigin: 970 },
    { station: 'KYN', distanceFromOrigin: 1176 },
    { station: 'CST', distanceFromOrigin: 1230 },
  ],
  sections: [
    { fromStation: 'BZA', toStation: 'WL', distance: 207 },
    { fromStation: 'WL', toStation: 'SC', distance: 142 },
    { fromStation: 'SC', toStation: 'NED', distance: 271 },
    { fromStation: 'NED', toStation: 'PVR', distance: 59 },
    { fromStation: 'PVR', toStation: 'MMR', distance: 291 },
    { fromStation: 'MMR', toStation: 'KYN', distance: 206 },
    { fromStation: 'KYN', toStation: 'CST', distance: 54 },
  ],
};

describe('calculateJourneyProgress', () => {
  it('returns ~0% at origin before departure', () => {
    const result = calculateJourneyProgress({
      route: konarkRoute,
      sectionIndex: 0,
      progressInSection: 0,
      currentStation: 'BZA',
      nextStation: 'WL',
      source: 'BZA',
      destination: 'CST',
      speed: 0,
      delayMinutes: 0,
    });
    expect(result.percentage).toBe(0);
    expect(result.status).toBe(JOURNEY_STATUS.NOT_STARTED);
    expect(result.totalDistance).toBe(1230);
  });

  it('returns >0% after departing origin into first section', () => {
    const result = calculateJourneyProgress({
      route: konarkRoute,
      sectionIndex: 0,
      progressInSection: 50,
      currentStation: 'BZA',
      nextStation: 'WL',
      source: 'BZA',
      destination: 'CST',
      speed: 70,
    });
    expect(result.percentage).toBeGreaterThan(0);
    expect(result.distanceTravelled).toBe(50);
    expect(result.distanceToNext).toBe(157);
    expect(result.status).toBe(JOURNEY_STATUS.IN_TRANSIT);
  });

  it('shows clear non-zero progress when Vijayawada and Warangal are departed', () => {
    // Train in section WL → SC (index 1), 40 km past Warangal
    const result = calculateJourneyProgress({
      route: konarkRoute,
      sectionIndex: 1,
      progressInSection: 40,
      currentStation: 'WL',
      nextStation: 'SC',
      source: 'BZA',
      destination: 'CST',
      speed: 65,
      delayMinutes: 12,
    });
    expect(result.percentage).toBeGreaterThanOrEqual(15);
    expect(result.currentStation).toBe('WL');
    expect(result.nextStation).toBe('SC');
    expect(result.delayMinutes).toBe(12);
    expect(result.status).not.toBe(JOURNEY_STATUS.NOT_STARTED);
    expect(result.status).not.toBe(JOURNEY_STATUS.COMPLETED);
  });

  it('is monotonic as sectionIndex increases', () => {
    const a = calculateJourneyProgress({
      route: konarkRoute,
      sectionIndex: 1,
      progressInSection: 10,
      currentStation: 'WL',
      source: 'BZA',
      destination: 'CST',
      speed: 60,
    });
    const b = calculateJourneyProgress({
      route: konarkRoute,
      sectionIndex: 3,
      progressInSection: 10,
      currentStation: 'NED',
      source: 'BZA',
      destination: 'CST',
      speed: 60,
    });
    const c = calculateJourneyProgress({
      route: konarkRoute,
      sectionIndex: 5,
      progressInSection: 10,
      currentStation: 'MMR',
      source: 'BZA',
      destination: 'CST',
      speed: 60,
    });
    expect(b.percentage).toBeGreaterThan(a.percentage);
    expect(c.percentage).toBeGreaterThan(b.percentage);
  });

  it('returns 100% at destination', () => {
    const result = calculateJourneyProgress({
      route: konarkRoute,
      sectionIndex: 7,
      progressInSection: 0,
      currentStation: 'CST',
      nextStation: 'CST',
      source: 'BZA',
      destination: 'CST',
      speed: 0,
    });
    expect(result.percentage).toBe(100);
    expect(result.status).toBe(JOURNEY_STATUS.COMPLETED);
    expect(result.remainingDistance).toBe(0);
  });

  it('clamps progress between 0 and 100 for wild inputs', () => {
    const high = calculateJourneyProgress({
      route: konarkRoute,
      sectionIndex: 99,
      progressInSection: 99999,
      currentStation: 'CST',
      source: 'BZA',
      destination: 'CST',
      speed: 100,
    });
    expect(high.percentage).toBeGreaterThanOrEqual(0);
    expect(high.percentage).toBeLessThanOrEqual(100);

    const negative = calculateJourneyProgress({
      route: konarkRoute,
      sectionIndex: -5,
      progressInSection: -10,
      currentStation: 'BZA',
      source: 'BZA',
      destination: 'CST',
      speed: 0,
    });
    expect(negative.percentage).toBeGreaterThanOrEqual(0);
    expect(negative.percentage).toBeLessThanOrEqual(100);
  });

  it('handles missing route sections using station distanceFromOrigin', () => {
    const result = calculateJourneyProgress({
      route: {
        totalDistance: 1230,
        stations: konarkRoute.stations,
        sections: [],
      },
      sectionIndex: 0,
      progressInSection: 0,
      currentStation: 'SC',
      nextStation: 'NED',
      source: 'BZA',
      destination: 'CST',
      speed: 50,
    });
    expect(result.percentage).toBeGreaterThan(0);
    expect(result.currentStation).toBe('SC');
  });

  it('does not report NOT_STARTED when current station is past origin', () => {
    const result = calculateJourneyProgress({
      route: konarkRoute,
      sectionIndex: 2,
      progressInSection: 0,
      currentStation: 'SC',
      nextStation: 'NED',
      source: 'BZA',
      destination: 'CST',
      speed: 0,
      delayMinutes: 0,
    });
    expect(result.percentage).toBeGreaterThan(0);
    expect(result.status).not.toBe(JOURNEY_STATUS.NOT_STARTED);
  });
});
