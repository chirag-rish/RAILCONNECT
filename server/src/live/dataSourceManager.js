/**
 * SIH26028 — Phase 5A: Data Source Manager (5E)
 *
 * Manages adapters, source priority, and fallback.
 *
 * Priority order (configurable):
 *   1. OFFICIAL_RAILWAY  (RTIS/NTES — only if authorized credentials configured)
 *   2. LIVE_PROVIDER     (legitimate provider — only if configured)
 *   3. SIMULATOR         (always available as fallback)
 *
 * NEVER claims an official source exists if credentials are absent.
 * Exposes which source is currently active.
 */

const { createAdapters } = require('./adapters');
const { normalizeTelemetry } = require('./telemetrySchema');
const { validateTelemetry } = require('./validation');
const { DATA_SOURCES, SOURCE_LABELS } = require('./constants');
const logger = require('../utils/logger');

class DataSourceManager {
  /**
   * @param {LiveTrainTracker} tracker - Central live-state tracker
   * @param {Object} [env] - Environment variables (defaults to process.env)
   */
  constructor(tracker, env = process.env) {
    this.tracker = tracker;
    this.adapters = createAdapters(env);

    // Priority order: official → provider → simulator
    this.priorityOrder = [
      DATA_SOURCES.OFFICIAL_RAILWAY,
      DATA_SOURCES.LIVE_PROVIDER,
      DATA_SOURCES.SIMULATOR,
    ];

    // Determine which sources are actually available
    this._resolveAvailableSources();
  }

  /**
   * Initialize all available adapters.
   */
  async initialize() {
    for (const sourceKey of this.priorityOrder) {
      const adapter = this._getAdapterForSource(sourceKey);
      if (adapter && adapter.isAvailable()) {
        try {
          await adapter.initialize();
          logger.info(`Adapter initialized: ${SOURCE_LABELS[sourceKey]}`);
        } catch (err) {
          logger.error(`Failed to initialize adapter: ${SOURCE_LABELS[sourceKey]}`, { error: err.message });
        }
      }
    }
  }

  /**
   * Get the currently active (highest-priority available) source.
   * @returns {string} DATA_SOURCES value
   */
  getActiveSource() {
    for (const sourceKey of this.priorityOrder) {
      const adapter = this._getAdapterForSource(sourceKey);
      if (adapter && adapter.isAvailable()) {
        return sourceKey;
      }
    }
    return DATA_SOURCES.SIMULATOR; // Should never be reached
  }

  /**
   * Get human-readable label for the active source.
   * @returns {string}
   */
  getActiveSourceLabel() {
    return SOURCE_LABELS[this.getActiveSource()] || 'Unknown';
  }

  /**
   * Get status of all configured sources.
   * @returns {Object}
   */
  getSourceStatus() {
    const status = {};
    for (const sourceKey of this.priorityOrder) {
      const adapter = this._getAdapterForSource(sourceKey);
      status[sourceKey] = {
        label: SOURCE_LABELS[sourceKey],
        configured: adapter ? adapter.enabled : false,
        available: adapter ? adapter.isAvailable() : false,
        active: sourceKey === this.getActiveSource(),
      };
    }
    return status;
  }

  /**
   * Process incoming telemetry from the active source.
   * Normalizes, validates, and ingests into the tracker.
   *
   * @param {Object} rawData - Raw data from a data-source adapter
   * @param {string} [sourceKey] - Override source (defaults to active)
   * @returns {{ accepted: boolean, source: string, errors?: string[] }}
   */
  processTelemetry(rawData, sourceKey, trainIdOverride) {
    const source = sourceKey || this.getActiveSource();
    const adapter = this._getAdapterForSource(source);

    if (!adapter) {
      return { accepted: false, source, errors: ['No adapter found for source'] };
    }

    let normalizedFields;
    try {
      normalizedFields = adapter.normalize(rawData);
    } catch (err) {
      logger.error('Adapter normalization failed', { source, error: err.message });
      return { accepted: false, source, errors: [err.message] };
    }

    if (trainIdOverride) {
      normalizedFields.trainId = trainIdOverride;
    }

    // Add source metadata
    normalizedFields.source = source;

    // Full normalization (adds receivedAt, isStale, etc.)
    const telemetry = normalizeTelemetry(normalizedFields);

    // Validate
    const validation = validateTelemetry(telemetry);
    if (!validation.valid) {
      this.tracker.ingest(telemetry, validation.errors);
      return { accepted: false, source, errors: validation.errors };
    }

    // Ingest
    const accepted = this.tracker.ingest(telemetry);
    return { accepted, source };
  }

  /**
   * Shutdown all adapters.
   */
  async shutdown() {
    for (const sourceKey of this.priorityOrder) {
      const adapter = this._getAdapterForSource(sourceKey);
      if (adapter) {
        try {
          await adapter.shutdown();
        } catch (err) {
          logger.error(`Error shutting down adapter: ${SOURCE_LABELS[sourceKey]}`, { error: err.message });
        }
      }
    }
  }

  /**
   * Resolve which sources are actually available.
   * @private
   */
  _resolveAvailableSources() {
    this.availableSources = this.priorityOrder.filter(key => {
      const adapter = this._getAdapterForSource(key);
      return adapter && adapter.isAvailable();
    });

    const active = this.getActiveSource();
    logger.info(`DataSourceManager: Active source = ${SOURCE_LABELS[active]}`, {
      available: this.availableSources,
    });
  }

  /**
   * Get the adapter for a given source key.
   * @param {string} sourceKey
   * @returns {Object|null}
   * @private
   */
  _getAdapterForSource(sourceKey) {
    switch (sourceKey) {
      case DATA_SOURCES.OFFICIAL_RAILWAY:
        // Check both RTIS and NTES — use whichever is available
        if (this.adapters.rtis.isAvailable()) return this.adapters.rtis;
        if (this.adapters.ntes.isAvailable()) return this.adapters.ntes;
        return null;
      case DATA_SOURCES.LIVE_PROVIDER:
        return this.adapters.liveProvider;
      case DATA_SOURCES.SIMULATOR:
        return this.adapters.simulator;
      default:
        return null;
    }
  }
}

module.exports = DataSourceManager;
