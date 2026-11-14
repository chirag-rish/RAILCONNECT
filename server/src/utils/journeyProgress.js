/**
 * Shared journey-progress calculation for tracking APIs and live telemetry.
 * Single source of truth on the server: distance-based, clamped, never invents data.
 */

const JOURNEY_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  DEPARTED: 'DEPARTED',
  IN_TRANSIT: 'IN_TRANSIT',
  ARRIVING: 'ARRIVING',
  AT_STATION: 'AT_STATION',
  DEPARTED_STATION: 'DEPARTED_STATION',
  DELAYED: 'DELAYED',
  COMPLETED: 'COMPLETED',
};

function clamp(value, min, max) {
  if (value == null || Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function sumSectionDistances(sections, upToIndex) {
  let total = 0;
  const limit = Math.min(upToIndex, sections.length);
  for (let i = 0; i < limit; i++) {
    total += Number(sections[i]?.distance) || 0;
  }
  return total;
}

function getTotalDistance(route, sections) {
  if (route?.totalDistance && route.totalDistance > 0) return Number(route.totalDistance);
  const fromSections = (sections || []).reduce((acc, s) => acc + (Number(s?.distance) || 0), 0);
  if (fromSections > 0) return fromSections;
  const stations = route?.stations || [];
  if (stations.length > 1) {
    const last = Number(stations[stations.length - 1].distanceFromOrigin) || 0;
    if (last > 0) return last;
  }
  return 0;
}

/**
 * Calculate journey progress from actual route + tracking state.
 *
 * @param {Object} input
 * @param {Object|null} input.route - Populated route (stations + sections + totalDistance)
 * @param {number} [input.sectionIndex]
 * @param {number} [input.progressInSection] - km travelled inside current section
 * @param {string|null} [input.currentStation]
 * @param {string|null} [input.nextStation]
 * @param {string} [input.source]
 * @param {string} [input.destination]
 * @param {number} [input.speed]
 * @param {number} [input.delayMinutes]
 * @param {string} [input.departureTime] - HH:MM origin departure
 * @param {string} [input.arrivalTime] - HH:MM destination arrival
 * @returns {Object} journey state
 */
function calculateJourneyProgress(input = {}) {
  const route = input.route || null;
  const stations = route?.stations || [];
  const sections = route?.sections || [];
  const source = input.source || stations[0]?.station || null;
  const destination =
    input.destination ||
    stations[stations.length - 1]?.station ||
    null;

  const rawSectionIndex = Number(input.sectionIndex);
  let sectionIndex = Number.isFinite(rawSectionIndex) ? Math.max(0, Math.floor(rawSectionIndex)) : 0;
  if (sections.length > 0 && sectionIndex > sections.length) {
    sectionIndex = sections.length;
  }

  const progressInSection = Math.max(0, Number(input.progressInSection) || 0);
  const speed = Number(input.speed) || 0;
  const delayMinutes = Math.round(Number(input.delayMinutes) || 0);
  const totalDistance = getTotalDistance(route, sections);

  let distanceTravelled = 0;
  let distanceToNext = 0;
  const currentSection = sections[sectionIndex];

  if (sections.length > 0 && totalDistance > 0) {
    distanceTravelled = sumSectionDistances(sections, Math.min(sectionIndex, sections.length));
    if (currentSection) {
      const sectionDistance = Number(currentSection.distance) || 0;
      const inSection = Math.min(progressInSection, sectionDistance);
      distanceTravelled += inSection;
      distanceToNext = Math.max(0, sectionDistance - inSection);
    }
  } else if (stations.length > 0 && totalDistance > 0) {
    // Fallback: ordered station chain by distanceFromOrigin
    const currentIdx = stations.findIndex((s) => s.station === input.currentStation);
    const safeIdx = currentIdx >= 0 ? currentIdx : 0;
    const base = Number(stations[safeIdx]?.distanceFromOrigin) || 0;
    const next = stations[safeIdx + 1];
    const nextDist = next ? Number(next.distanceFromOrigin) || 0 : totalDistance;
    const segmentLen = Math.max(0, nextDist - base);
    const ratio = segmentLen > 0 ? clamp(progressInSection / segmentLen, 0, 1) : 0;
    distanceTravelled = base + segmentLen * ratio;
    distanceToNext = Math.max(0, nextDist - distanceTravelled);
    // If train is past the indexed station, count completed stations
    if (safeIdx > 0 && progressInSection === 0 && speed === 0) {
      distanceTravelled = base;
    }
  }

  distanceTravelled = clamp(distanceTravelled, 0, totalDistance || distanceTravelled);
  const remainingDistance = Math.max(0, (totalDistance || 0) - distanceTravelled);

  let percentage =
    totalDistance > 0 ? (distanceTravelled / totalDistance) * 100 : 0;

  // Resolve station codes consistently with section geometry
  let currentStation = input.currentStation || null;
  let nextStation = input.nextStation || null;
  let previousStation = null;

  if (sections.length > 0) {
    const safeIdx = Math.min(sectionIndex, Math.max(0, sections.length - 1));
    const section = sections[safeIdx];
    if (section) {
      previousStation = section.fromStation;
      const sectionDistance = Number(section.distance) || 0;
      const arrivedInSection = sectionDistance > 0 && progressInSection >= sectionDistance;
      const derivedCurrent = arrivedInSection ? section.toStation : section.fromStation;
      const derivedNext = section.toStation;
      currentStation = input.currentStation || derivedCurrent;
      nextStation = input.nextStation || derivedNext;
      if (sectionIndex >= sections.length - 1 && arrivedInSection) {
        nextStation = section.toStation;
      }
    }
  } else if (stations.length > 0) {
    const idx = stations.findIndex((s) => s.station === currentStation);
    previousStation = idx > 0 ? stations[idx - 1].station : null;
    if (!nextStation && idx >= 0 && idx < stations.length - 1) {
      nextStation = stations[idx + 1].station;
    }
    if (idx >= 0) {
      const base = Number(stations[idx]?.distanceFromOrigin) || 0;
      if (totalDistance > 0) percentage = clamp((base / totalDistance) * 100, 0, 100);
    }
  }

  const atDestination =
    (destination && currentStation === destination) ||
    (sections.length > 0 && sectionIndex >= sections.length) ||
    percentage >= 100;

  // Resolve previous/next around the finalized current station
  if (stations.length > 0 && currentStation) {
    const idx = stations.findIndex((s) => s.station === currentStation);
    if (idx >= 0) {
      previousStation = idx > 0 ? stations[idx - 1].station : source;
      if (!nextStation) {
        nextStation = idx < stations.length - 1 ? stations[idx + 1].station : destination;
      }
    }
  }

  if (atDestination) {
    percentage = 100;
    distanceTravelled = totalDistance || distanceTravelled;
    distanceToNext = 0;
    currentStation = destination || currentStation;
    nextStation = destination || nextStation;
  } else if (
    !currentStation &&
    stations.length > 0 &&
    sectionIndex === 0 &&
    progressInSection === 0 &&
    speed === 0
  ) {
    percentage = 0;
    currentStation = source;
    nextStation = stations[1]?.station || destination;
  }

  percentage = Math.round(clamp(percentage, 0, 100));

  let status = JOURNEY_STATUS.NOT_STARTED;
  const sectionDistance = currentSection ? Number(currentSection.distance) || 0 : 0;
  const arrivedAtSectionEnd =
    Boolean(currentSection) &&
    sectionDistance > 0 &&
    progressInSection >= sectionDistance;

  if (atDestination) {
    status = JOURNEY_STATUS.COMPLETED;
  } else if (sectionIndex === 0 && progressInSection === 0 && speed === 0 && percentage <= 0) {
    status = JOURNEY_STATUS.NOT_STARTED;
  } else if (speed === 0 && arrivedAtSectionEnd) {
    status = delayMinutes > 0 ? JOURNEY_STATUS.DELAYED : JOURNEY_STATUS.AT_STATION;
  } else if (speed === 0 && delayMinutes > 0) {
    status = JOURNEY_STATUS.DELAYED;
  } else if (speed === 0) {
    status = delayMinutes > 0 ? JOURNEY_STATUS.DELAYED : JOURNEY_STATUS.AT_STATION;
  } else if (currentSection) {
    const remainingInSection = sectionDistance - Math.min(progressInSection, sectionDistance);
    status = sectionDistance > 0 && remainingInSection <= 5
      ? JOURNEY_STATUS.ARRIVING
      : (percentage > 0 ? JOURNEY_STATUS.IN_TRANSIT : JOURNEY_STATUS.DEPARTED);
  } else {
    status = percentage > 0 ? JOURNEY_STATUS.IN_TRANSIT : JOURNEY_STATUS.DEPARTED;
  }

  if (percentage > 0 && status === JOURNEY_STATUS.NOT_STARTED) {
    status = JOURNEY_STATUS.DEPARTED;
  }

  // Time estimates (minutes) from schedule or speed
  let elapsedMinutes = null;
  let remainingMinutes = null;
  if (input.departureTime && totalDistance > 0) {
    elapsedMinutes = estimateElapsedMinutes({
      departureTime: input.departureTime,
      arrivalTime: input.arrivalTime,
      totalDistance,
      distanceTravelled,
      speed,
      delayMinutes,
    });
    remainingMinutes =
      elapsedMinutes != null && input.arrivalTime
        ? Math.max(0, scheduleDurationMinutes(input.departureTime, input.arrivalTime) + delayMinutes - elapsedMinutes)
        : null;
  } else if (speed > 0 && totalDistance > 0) {
    remainingMinutes = Math.round((remainingDistance / speed) * 60);
    elapsedMinutes = null;
  }

  const etaToNextMinutes =
    distanceToNext > 0 && speed > 0 ? Math.round((distanceToNext / speed) * 60) : null;

  return {
    percentage,
    distanceTravelled: Math.round(distanceTravelled),
    totalDistance: Math.round(totalDistance),
    remainingDistance: Math.round(remainingDistance),
    distanceToNext: Math.round(distanceToNext),
    sectionIndex,
    progressInSection: Math.round(progressInSection * 10) / 10,
    currentStation,
    previousStation,
    nextStation,
    source,
    destination,
    status,
    speed,
    delayMinutes,
    elapsedMinutes,
    remainingMinutes,
    etaToNextMinutes,
    atDestination: Boolean(atDestination),
  };
}

function scheduleDurationMinutes(departureTime, arrivalTime) {
  const dep = parseHHMM(departureTime);
  const arr = parseHHMM(arrivalTime);
  if (dep == null || arr == null) return 0;
  let diff = arr - dep;
  if (diff < 0) diff += 24 * 60;
  return diff;
}

function parseHHMM(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.match(/^([0-1]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function estimateElapsedMinutes({
  departureTime,
  arrivalTime,
  totalDistance,
  distanceTravelled,
  speed,
  delayMinutes,
}) {
  const scheduled = scheduleDurationMinutes(departureTime, arrivalTime);
  if (scheduled > 0 && totalDistance > 0) {
    // Time-based progress keeps schedule alignment; blend with distance share
    const byDistance = (distanceTravelled / totalDistance) * scheduled + delayMinutes;
    return Math.max(0, Math.round(byDistance));
  }
  if (speed > 0) {
    return Math.round((distanceTravelled / speed) * 60);
  }
  return null;
}

module.exports = {
  calculateJourneyProgress,
  JOURNEY_STATUS,
  getTotalDistance,
  scheduleDurationMinutes,
};
