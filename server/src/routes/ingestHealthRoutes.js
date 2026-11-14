/**
 * SIH26028 — Phase 5A/5B: Ingestion Health Endpoint (5I)
 *
 * GET /api/ingest/health
 *
 * Exposes live-data ingestion health for the control room:
 *   - active trains
 *   - active data source
 *   - stale train count
 *   - invalid telemetry count
 *   - last ingestion time
 *   - ingestion errors
 *   - source configuration
 *   - live provider polling status
 */

const express = require('express');
const router = express.Router();
const etaEngine = require('../live/liveEtaEngine');
const liveProviderPolling = require('../live/liveProviderPollingService');

/**
 * Create health routes with injected dependencies.
 * @param {LiveTrainTracker} tracker
 * @param {DataSourceManager} sourceManager
 */
function createIngestHealthRoutes(tracker, sourceManager) {
  router.get('/health', (req, res) => {
    try {
      const trackerHealth = tracker.getHealth();
      const sourceStatus = sourceManager.getSourceStatus();
      const etaHealth = etaEngine.getEngineHealth();
      const pollingStatus = liveProviderPolling.getStatus();

      res.json({
        success: true,
        activeSource: sourceManager.getActiveSource(),
        activeSourceLabel: sourceManager.getActiveSourceLabel(),
        sources: sourceStatus,
        trains: {
          active: trackerHealth.activeTrains,
          stale: trackerHealth.staleTrains,
          healthy: trackerHealth.healthyTrains,
        },
        ingestion: {
          totalIngested:    trackerHealth.stats.totalIngested,
          validIngested:    trackerHealth.stats.validIngested,
          invalidTelemetry: trackerHealth.stats.invalidTelemetry,
          staleTelemetry:   trackerHealth.stats.staleTelemetry,
          lastIngestionTime: trackerHealth.stats.lastIngestionTime,
          lastIngestionError: trackerHealth.stats.lastIngestionError,
        },
        eta: {
          trainsTracked: etaHealth.trainsTracked,
          totalPredictions: etaHealth.totalPredicted,
          totalThrottled: etaHealth.totalThrottled,
          throttle: etaHealth.throttle,
        },
        liveProviderPolling: pollingStatus,
        uptime: trackerHealth.stats.uptimeMs,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve ingestion health',
        error: error.message,
      });
    }
  });

  router.get('/sources', (req, res) => {
    try {
      res.json({
        success: true,
        activeSource: sourceManager.getActiveSource(),
        sources: sourceManager.getSourceStatus(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve source status',
        error: error.message,
      });
    }
  });

  router.get('/trains', (req, res) => {
    try {
      const allStates = tracker.getAllStates();
      const trainList = Object.entries(allStates).map(([trainId, state]) => ({
        trainId,
        trainNumber: state.trainNumber,
        source: state.source,
        isStale: state.isStale,
        speed: state.speed,
        currentStation: state.currentStation,
        accumulatedDelay: state.accumulatedDelay,
        timestamp: state.timestamp,
        receivedAt: state.receivedAt,
      }));

      res.json({
        success: true,
        count: trainList.length,
        trains: trainList,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve train states',
        error: error.message,
      });
    }
  });

  return router;
}

module.exports = createIngestHealthRoutes;
