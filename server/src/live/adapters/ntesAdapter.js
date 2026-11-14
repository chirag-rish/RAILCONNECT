/**
 * SIH26028 — Phase 5A: NTES Adapter (Stub)
 *
 * NTES (National Train Enquiry System) is Indian Railways'
 * public-facing train information portal.
 *
 * This adapter is a STUB. It becomes active ONLY when:
 *   1. Official NTES API access is authorized, AND
 *   2. Environment variables provide valid credentials/endpoints.
 *
 * Until then, this adapter reports itself as unavailable
 * and the system falls back to lower-priority sources.
 *
 * NEVER scrape the NTES website.
 * NEVER bypass rate limits or authentication.
 * NEVER fabricate NTES data.
 */

const { DATA_SOURCES } = require('../constants');
const BaseAdapter = require('./baseAdapter');

class NTESAdapter extends BaseAdapter {
  constructor(config = {}) {
    super(DATA_SOURCES.OFFICIAL_RAILWAY, {
      enabled: false,
      ...config,
    });
    this.apiEndpoint = config.apiEndpoint || null;
    this.apiKey = config.apiKey || null;
  }

  /**
   * Only available when credentials are explicitly configured.
   */
  isAvailable() {
    return this.enabled
      && Boolean(this.apiEndpoint)
      && Boolean(this.apiKey);
  }

  /**
   * Initialize NTES connection.
   */
  async initialize() {
    if (!this.isAvailable()) {
      console.log('[NTESAdapter] Not configured — skipping initialization');
      return;
    }
    console.log('[NTESAdapter] Initialized with authorized NTES access');
  }

  /**
   * Normalize NTES payload to internal telemetry format.
   * To be implemented when NTES API access is granted.
   *
   * @param {Object} ntesPayload - Raw NTES API response
   * @returns {Object} Normalized telemetry fields
   */
  normalize(ntesPayload) {
    throw new Error(
      'NTES adapter: Not yet implemented. ' +
      'Authorized API access required from Indian Railways.'
    );
  }
}

module.exports = NTESAdapter;
