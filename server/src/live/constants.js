/**
 * SIH26028 — Phase 5A: Data Source & Telemetry Constants
 *
 * Canonical values for data source identification,
 * telemetry validation limits, and staleness thresholds.
 */

const DATA_SOURCES = Object.freeze({
  OFFICIAL_RAILWAY: 'OFFICIAL_RAILWAY',
  LIVE_PROVIDER: 'LIVE_PROVIDER',
  SIMULATOR: 'SIMULATOR',
});

const SOURCE_LABELS = Object.freeze({
  [DATA_SOURCES.OFFICIAL_RAILWAY]: 'Official Railway Feed (RTIS/NTES)',
  [DATA_SOURCES.LIVE_PROVIDER]: 'Live Provider — RailRadar',
  [DATA_SOURCES.SIMULATOR]: 'Simulator Mode',
});

const STALENESS_THRESHOLDS_MS = Object.freeze({
  [DATA_SOURCES.OFFICIAL_RAILWAY]: 300_000,   // 5 minutes
  [DATA_SOURCES.LIVE_PROVIDER]: 300_000,       // 5 minutes
  [DATA_SOURCES.SIMULATOR]: 300_000,            // 5 minutes
});

const VALIDATION_LIMITS = Object.freeze({
  MIN_LATITUDE: -90,
  MAX_LATITUDE: 90,
  MIN_LONGITUDE: -180,
  MAX_LONGITUDE: 180,
  MAX_SPEED_KMH: 500,
  MAX_PROGRESS_RATIO: 2.0,
  MAX_FUTURE_DRIFT_MS: 3_600_000,     // 1 hour ahead
  MAX_PAST_DRIFT_MS: 86_400_000,      // 24 hours behind
  MAX_SECTION_INDEX: 200,
});

module.exports = {
  DATA_SOURCES,
  SOURCE_LABELS,
  STALENESS_THRESHOLDS_MS,
  VALIDATION_LIMITS,
};
