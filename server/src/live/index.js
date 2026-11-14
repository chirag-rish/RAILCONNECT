/**
 * SIH26028 — Phase 5A: Live Data Ingestion Core — Public API
 *
 * This module is the single entry-point for the live-data layer.
 * It wires together:
 *   - DataSourceManager  (adapter priority + fallback)
 *   - LiveTrainTracker   (per-train state + Socket.io broadcast)
 *   - LiveProviderPolling (controlled server-side polling of live provider)
 *   - Telemetry schema   (normalized contract)
 *   - Validation         (sanity checks)
 *
 * Usage (in server.js):
 *   const { tracker, sourceManager, initLiveCore } = require('./src/live');
 *   initLiveCore(io);
 */

const LiveTrainTracker = require('./liveTrainTracker');
const DataSourceManager = require('./dataSourceManager');
const LiveETAEngine = require('./liveEtaEngine');
const liveProviderPolling = require('./liveProviderPollingService');
const { normalizeTelemetry } = require('./telemetrySchema');
const { validateTelemetry, isStale } = require('./validation');
const { DATA_SOURCES, SOURCE_LABELS, STALENESS_THRESHOLDS_MS, VALIDATION_LIMITS } = require('./constants');
const createIngestHealthRoutes = require('../routes/ingestHealthRoutes');

const tracker = new LiveTrainTracker();
const sourceManager = new DataSourceManager(tracker);

/**
 * Initialize the live-data core.
 * Call once at server startup after Socket.io is ready.
 *
 * @param {Object} io - Socket.io server instance
 */
async function initLiveCore(io) {
  tracker.setIo(io);
  LiveETAEngine.setIo(io);
  await sourceManager.initialize();

  // Initialize live provider polling if the provider is available
  liveProviderPolling.initialize(sourceManager);
  if (sourceManager.getActiveSource() === DATA_SOURCES.LIVE_PROVIDER) {
    // Auto-start polling for all trains with routes
    await _autoStartLiveProviderPolling();
  }
}

/**
 * Auto-start live provider polling for all trains with active routes.
 * @private
 */
async function _autoStartLiveProviderPolling() {
  try {
    const Train = require('../models/Train');
    const trains = await Train.find({ route: { $exists: true, $ne: null } })
      .select('trainNumber')
      .limit(50); // Reasonable initial batch

    for (const train of trains) {
      await liveProviderPolling.addTrain(train.trainNumber);
    }

    liveProviderPolling.start();
  } catch (err) {
    console.error('[LiveCore] Failed to auto-start live provider polling:', err.message);
  }
}

module.exports = {
  tracker,
  sourceManager,
  liveProviderPolling,
  LiveETAEngine,
  initLiveCore,
  normalizeTelemetry,
  validateTelemetry,
  isStale,
  DATA_SOURCES,
  SOURCE_LABELS,
  STALENESS_THRESHOLDS_MS,
  VALIDATION_LIMITS,
  createIngestHealthRoutes,
};
