/**
 * SIH26028 — Phase 5A: Normalized Telemetry Contract
 *
 * Canonical internal telemetry structure produced by all data-source adapters.
 * Every field is documented; null/undefined means the source genuinely
 * does not provide that value — we never fabricate data.
 *
 * @typedef {Object} NormalizedTelemetry
 * @property {string}  trainId              - MongoDB ObjectId of the train
 * @property {string}  trainNumber          - Official train number (e.g. "11020")
 * @property {Date}    timestamp            - Source-side timestamp of the observation
 * @property {number|null} latitude         - GPS latitude (null if source lacks GPS)
 * @property {number|null} longitude        - GPS longitude (null if source lacks GPS)
 * @property {number|null} speed            - Speed in km/h (null if unavailable)
 * @property {number|null} heading          - Compass heading in degrees (null if unavailable)
 * @property {string|null} currentStation   - Station code where train currently is
 * @property {string|null} nextStation      - Station code of next scheduled stop
 * @property {number}   sectionIndex        - Index of current section in route
 * @property {number}   progressInSection   - Distance travelled within current section (km)
 * @property {number}   accumulatedDelay    - Delay accumulated since departure (minutes)
 * @property {string}   status              - 'OnTime' | 'Delayed' | 'Stopped' | 'Arrived'
 * @property {string}   source              - One of DATA_SOURCES values
 * @property {Date|null} sourceTimestamp    - Timestamp at source system (if different from timestamp)
 * @property {Date}     receivedAt          - When this system received the telemetry
 * @property {boolean}  isStale             - Whether telemetry exceeds freshness threshold
 */

const { DATA_SOURCES } = require('./constants');

/**
 * Create a normalized telemetry record from raw adapter output.
 * All adapters must call this to ensure a consistent contract.
 *
 * @param {Object} raw - Fields from the data-source adapter
 * @returns {NormalizedTelemetry}
 */
function normalizeTelemetry(raw) {
  return {
    trainId:         raw.trainId,
    trainNumber:     raw.trainNumber,
    timestamp:       raw.timestamp instanceof Date ? raw.timestamp : new Date(raw.timestamp),
    latitude:        raw.latitude != null ? Number(raw.latitude) : null,
    longitude:       raw.longitude != null ? Number(raw.longitude) : null,
    speed:           raw.speed != null ? Number(raw.speed) : null,
    heading:         raw.heading != null ? Number(raw.heading) : null,
    currentStation:  raw.currentStation || null,
    nextStation:     raw.nextStation || null,
    sectionIndex:    Number(raw.sectionIndex) || 0,
    progressInSection: Number(raw.progressInSection) || 0,
    sectionDistance: raw.sectionDistance != null && Number.isFinite(Number(raw.sectionDistance))
      ? Number(raw.sectionDistance)
      : null,
    // Optional precomputed journey percentage (0-100) when the source knows route geometry
    progress:        raw.progress != null && Number.isFinite(Number(raw.progress))
      ? Math.min(100, Math.max(0, Number(raw.progress)))
      : null,
    accumulatedDelay: Number(raw.accumulatedDelay) || 0,
    status:          raw.status || 'OnTime',
    source:          raw.source || DATA_SOURCES.SIMULATOR,
    positionSource:  raw.positionSource || (raw.latitude != null ? 'GPS' : (raw.currentStation ? 'STATION_REFERENCE' : 'UNKNOWN')),
    sourceTimestamp: raw.sourceTimestamp
      ? (raw.sourceTimestamp instanceof Date ? raw.sourceTimestamp : new Date(raw.sourceTimestamp))
      : null,
    receivedAt: new Date(),
    isStale:    false,
  };
}

module.exports = { normalizeTelemetry };
