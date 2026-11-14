/**
 * SIH26028 — Phase 5A: Telemetry Validation (5C)
 *
 * Validates incoming telemetry against physical and logical limits.
 * Invalid telemetry is rejected (returns error list).
 * Invalid values are NOT silently replaced with random data.
 */

const { VALIDATION_LIMITS } = require('./constants');

/**
 * Validate a normalized telemetry record.
 * Returns { valid: boolean, errors: string[] }.
 *
 * @param {Object} telemetry - Normalized telemetry record
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateTelemetry(telemetry) {
  const errors = [];

  // Required fields
  if (!telemetry.trainId) {
    errors.push('Missing trainId');
  }
  if (!telemetry.trainNumber) {
    errors.push('Missing trainNumber');
  }

  // Timestamp
  if (!telemetry.timestamp || !(telemetry.timestamp instanceof Date) || isNaN(telemetry.timestamp.getTime())) {
    errors.push('Invalid or missing timestamp');
  } else {
    const now = Date.now();
    const ts = telemetry.timestamp.getTime();
    if (ts - now > VALIDATION_LIMITS.MAX_FUTURE_DRIFT_MS) {
      errors.push(`Timestamp too far in the future: ${telemetry.timestamp.toISOString()}`);
    }
    if (now - ts > VALIDATION_LIMITS.MAX_PAST_DRIFT_MS) {
      errors.push(`Timestamp too far in the past: ${telemetry.timestamp.toISOString()}`);
    }
  }

  // Latitude
  if (telemetry.latitude != null) {
    const lat = Number(telemetry.latitude);
    if (Number.isNaN(lat) || lat < VALIDATION_LIMITS.MIN_LATITUDE || lat > VALIDATION_LIMITS.MAX_LATITUDE) {
      errors.push(`Invalid latitude: ${telemetry.latitude}`);
    }
  }

  // Longitude
  if (telemetry.longitude != null) {
    const lng = Number(telemetry.longitude);
    if (Number.isNaN(lng) || lng < VALIDATION_LIMITS.MIN_LONGITUDE || lng > VALIDATION_LIMITS.MAX_LONGITUDE) {
      errors.push(`Invalid longitude: ${telemetry.longitude}`);
    }
  }

  // Speed
  if (telemetry.speed != null) {
    const spd = Number(telemetry.speed);
    if (Number.isNaN(spd) || spd < 0) {
      errors.push(`Negative speed: ${telemetry.speed}`);
    }
    if (!Number.isNaN(spd) && spd > VALIDATION_LIMITS.MAX_SPEED_KMH) {
      errors.push(`Speed exceeds physical limit: ${telemetry.speed} km/h`);
    }
  }

  // Section index
  if (telemetry.sectionIndex != null) {
    const si = Number(telemetry.sectionIndex);
    if (Number.isNaN(si) || si < 0 || si > VALIDATION_LIMITS.MAX_SECTION_INDEX) {
      errors.push(`Invalid sectionIndex: ${telemetry.sectionIndex}`);
    }
  }

  // Progress in section
  if (telemetry.progressInSection != null && telemetry.sectionDistance != null) {
    const ratio = Number(telemetry.progressInSection) / (Number(telemetry.sectionDistance) || 1);
    if (ratio > VALIDATION_LIMITS.MAX_PROGRESS_RATIO) {
      errors.push(`ProgressInSection exceeds section distance: progress=${telemetry.progressInSection}, distance=${telemetry.sectionDistance}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Detect stale telemetry based on source and timestamp.
 *
 * @param {Object} telemetry - Normalized telemetry with source + timestamp
 * @param {Object} stalenessMap - Map of source → threshold in ms
 * @param {Date} [now] - Current time (injectable for testing)
 * @returns {boolean} true if telemetry is stale
 */
function isStale(telemetry, stalenessMap, now = new Date()) {
  if (!telemetry.timestamp) return true;
  const threshold = stalenessMap[telemetry.source];
  if (threshold == null) return true; // Unknown source = always stale
  return (now.getTime() - telemetry.timestamp.getTime()) > threshold;
}

module.exports = { validateTelemetry, isStale };
