/**
 * SIH26028 — Phase 5A: Live Provider Adapter
 *
 * Represents a legitimate third-party live-data provider
 * that offers authorized access to real-time train telemetry.
 *
 * Currently integrated: RailRadar (api.railradar.in)
 *
 * The provider must be legitimate and authorized.
 * We never use unauthorized data sources.
 *
 * Environment variables required:
 *   LIVE_PROVIDER_ENABLED=true
 *   LIVE_PROVIDER_NAME=RailRadar
 *   LIVE_PROVIDER_API_ENDPOINT=https://api.railradar.in/v1
 *   LIVE_PROVIDER_API_KEY=<your-api-key>
 */

const { DATA_SOURCES } = require('../constants');
const BaseAdapter = require('./baseAdapter');

class LiveProviderAdapter extends BaseAdapter {
  constructor(config = {}) {
    super(DATA_SOURCES.LIVE_PROVIDER, {
      enabled: false,
      ...config,
    });
    this.providerName = config.providerName || 'unknown';
    this.apiEndpoint = config.apiEndpoint || null;
    this.apiKey = config.apiKey || null;
  }

  /**
   * Only available when a legitimate provider is configured.
   */
  isAvailable() {
    return this.enabled
      && Boolean(this.apiEndpoint)
      && Boolean(this.apiKey)
      && this.providerName !== 'unknown';
  }

  /**
   * Initialize provider connection.
   */
  async initialize() {
    if (!this.isAvailable()) {
      console.log(`[LiveProviderAdapter] Not configured — skipping initialization`);
      return;
    }
    console.log(`[LiveProviderAdapter] Initialized with provider: ${this.providerName}`);
  }

  /**
   * Normalize provider payload to internal telemetry format.
   *
   * RailRadar actual response shape (from GET /v1/trains/{number}/live):
   * {
   *   "success": true,
   *   "data": {
   *     "trainNumber": "11020",
   *     "trainName": "Konark Express",
   *     "lastUpdatedAt": "2026-09-07T15:02:46+05:30",
   *     "status": "running",
   *     "currentLocation": { "stationCode": "MQR", "stationName": "...", "delayMinutes": 71 },
   *     "nextHalt": { "stationCode": "WADI", "stationName": "Wadi" },
   *     "previousHalt": { "stationCode": "SEM", "stationName": "Seram" },
   *     "delayMinutes": 71
   *   },
   *   "meta": { "timestamp": "...", "traceId": "..." }
   * }
   *
   * Also supports legacy flat format for backward compatibility.
   *
   * @param {Object} providerPayload - Raw provider API response
   * @returns {Object} Normalized telemetry fields
   */
  normalize(providerPayload) {
    if (!providerPayload || typeof providerPayload !== 'object') {
      throw new Error('LiveProvider adapter: Invalid provider payload');
    }

    // Unwrap envelope if present (RailRadar wraps in {success, data, meta})
    const payload = (providerPayload.data && typeof providerPayload.data === 'object' && providerPayload.data.trainNumber)
      ? providerPayload.data
      : providerPayload;

    // Extract train number
    const trainNumber = String(
      payload.train_number ||
      payload.trainNumber ||
      payload.number ||
      ''
    ).trim();

    if (!trainNumber) {
      throw new Error('LiveProvider adapter: Missing train_number in provider response');
    }

    // Extract timestamp
    const timestampRaw = payload.last_updated ||
      payload.lastUpdatedAt ||
      payload.timestamp ||
      payload.observation_time ||
      payload.updated_at;

    const timestamp = timestampRaw ? new Date(timestampRaw) : new Date();

    // Extract current station (handle both flat and nested currentLocation/current_station)
    let currentStation = null;
    const currentLocationRaw = payload.currentLocation || payload.current_station;
    if (typeof currentLocationRaw === 'object' && currentLocationRaw !== null) {
      currentStation = currentLocationRaw.stationCode || currentLocationRaw.code || currentLocationRaw.station_code || null;
    } else if (typeof currentLocationRaw === 'string') {
      currentStation = currentLocationRaw;
    }

    // Extract next station (handle both flat and nested nextHalt/next_station)
    let nextStation = null;
    const nextStationRaw = payload.nextHalt || payload.next_station;
    if (typeof nextStationRaw === 'object' && nextStationRaw !== null) {
      nextStation = nextStationRaw.stationCode || nextStationRaw.code || nextStationRaw.station_code || null;
    } else if (typeof nextStationRaw === 'string') {
      nextStation = nextStationRaw;
    }

    // Extract delay (handle both flat and nested currentLocation.delayMinutes)
    const delayMinutes = Number(
      payload.delay_minutes ??
      payload.delay ??
      payload.delayed_by ??
      payload.delayMinutes ??
      (payload.currentLocation && payload.currentLocation.delayMinutes) ??
      0
    );

    // Map provider status to internal status
    const providerStatus = String(
      payload.status || payload.train_status || 'RUNNING'
    ).toUpperCase();

    let status;
    if (providerStatus.includes('ARRIVED') || providerStatus.includes('TERMINATED')) {
      status = 'Arrived';
    } else if (providerStatus.includes('STOPPED') || providerStatus.includes('HALTED')) {
      status = 'Stopped';
    } else if (delayMinutes > 0) {
      status = 'Delayed';
    } else {
      status = 'OnTime';
    }

    return {
      // trainId will be injected by caller (polling service / DataSourceManager)
      trainId: null,
      trainNumber,
      timestamp,
      latitude: payload.current_latitude ?? payload.latitude ?? null,
      longitude: payload.current_longitude ?? payload.longitude ?? null,
      speed: payload.speed != null ? Number(payload.speed) : null,
      heading: payload.heading != null ? Number(payload.heading) : null,
      currentStation,
      nextStation,
      sectionIndex: Number(payload.section_index ?? payload.sectionIndex ?? 0),
      progressInSection: Number(payload.progress_in_section ?? payload.progressInSection ?? 0),
      accumulatedDelay: delayMinutes,
      status,
      positionSource: payload.positionSource || (payload.current_latitude != null ? 'GPS' : (currentStation ? 'STATION_REFERENCE' : 'UNKNOWN')),
    };
  }
}

module.exports = LiveProviderAdapter;
