/**
 * SIH26028 — Phase 5A: RTIS Adapter (Stub)
 *
 * RTIS (Real Time Information System) is Indian Railways'
 * official train tracking system.
 *
 * This adapter is a STUB. It becomes active ONLY when:
 *   1. Indian Railways grants authorized API access, AND
 *   2. Environment variables provide valid credentials.
 *
 * Until then, this adapter reports itself as unavailable
 * and the system falls back to lower-priority sources.
 *
 * NEVER fabricate RTIS data.
 * NEVER bypass authentication.
 * NEVER scrape protected railway endpoints.
 */

const { DATA_SOURCES } = require('../constants');
const BaseAdapter = require('./baseAdapter');

class RTISAdapter extends BaseAdapter {
  constructor(config = {}) {
    super(DATA_SOURCES.OFFICIAL_RAILWAY, {
      enabled: false,
      ...config,
    });
    this.apiEndpoint = config.apiEndpoint || null;
    this.apiKey = config.apiKey || null;
    this.organizationId = config.organizationId || null;
  }

  /**
   * Only available when credentials are explicitly configured.
   */
  isAvailable() {
    return this.enabled
      && Boolean(this.apiEndpoint)
      && Boolean(this.apiKey)
      && Boolean(this.organizationId);
  }

  /**
   * Initialize RTIS connection.
   * Validates credentials and establishes connection.
   */
  async initialize() {
    if (!this.isAvailable()) {
      console.log('[RTISAdapter] Not configured — skipping initialization');
      return;
    }
    // Future: validate credentials, establish connection
    console.log('[RTISAdapter] Initialized with authorized RTIS access');
  }

  /**
   * Normalize RTIS payload to internal telemetry format.
   * To be implemented when RTIS API access is granted.
   *
   * @param {Object} rtisPayload - Raw RTIS API response
   * @returns {Object} Normalized telemetry fields
   */
  normalize(rtisPayload) {
    // Future implementation when RTIS access is authorized
    throw new Error(
      'RTIS adapter: Not yet implemented. ' +
      'Authorized API access required from Indian Railways.'
    );
  }
}

module.exports = RTISAdapter;
