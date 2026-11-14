/**
 * SIH26028 — Phase 5A: Base Data-Source Adapter
 *
 * All data-source adapters extend this class.
 * It defines the contract each adapter must fulfill
 * so that the DataSourceManager can treat them uniformly.
 */

const { DATA_SOURCES } = require('../constants');

class BaseAdapter {
  /**
   * @param {string} sourceKey - One of DATA_SOURCES values
   * @param {Object} config    - Source-specific configuration
   */
  constructor(sourceKey, config = {}) {
    if (!Object.values(DATA_SOURCES).includes(sourceKey)) {
      throw new Error(`Invalid data source key: ${sourceKey}`);
    }
    this.sourceKey = sourceKey;
    this.config = config;
    this.enabled = Boolean(config.enabled);
  }

  /**
   * Whether this adapter is configured and ready to provide data.
   * @returns {boolean}
   */
  isAvailable() {
    return this.enabled;
  }

  /**
   * Initialize the adapter (connect, authenticate, etc.).
   * Called once at server startup.
   * @returns {Promise<void>}
   */
  async initialize() {
    // Default: no-op
  }

  /**
   * Gracefully shut down the adapter.
   * @returns {Promise<void>}
   */
  async shutdown() {
    // Default: no-op
  }

  /**
   * Convert raw source data to normalized telemetry.
   * Subclasses MUST override this.
   *
   * @param {Object} rawData - Source-specific raw data
   * @returns {Object} Normalized telemetry fields (without source/receivedAt/isStale — added by manager)
   */
  normalize(rawData) {
    throw new Error(`${this.constructor.name}.normalize() must be implemented`);
  }
}

module.exports = BaseAdapter;
