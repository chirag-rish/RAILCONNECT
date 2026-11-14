/**
 * SIH26028 — Phase 5A: Simulator Data-Source Adapter
 *
 * Wraps the existing trainSimulator module.
 * Does NOT duplicate simulator logic — only normalizes
 * what the simulator already produces into the canonical
 * telemetry format.
 *
 * The simulator continues to run independently.
 * This adapter provides a normalized view of its output.
 */

const { DATA_SOURCES } = require('../constants');
const BaseAdapter = require('./baseAdapter');

class SimulatorAdapter extends BaseAdapter {
  constructor(config = {}) {
    super(DATA_SOURCES.SIMULATOR, { enabled: true, ...config });
  }

  /**
   * The simulator is always available — it requires no external credentials.
   */
  isAvailable() {
    return true;
  }

  /**
   * Convert simulator telemetry (from trainSimulator broadcast payload)
   * into the normalized internal contract.
   *
   * @param {Object} simTelemetry - The payload emitted by trainSimulator
   * @returns {Object} Normalized telemetry fields
   */
  normalize(simTelemetry) {
    return {
      trainId:         simTelemetry.trainId,
      trainNumber:     simTelemetry.trainNumber,
      timestamp:       simTelemetry.timestamp,
      latitude:        simTelemetry.latitude,
      longitude:       simTelemetry.longitude,
      speed:           simTelemetry.speed,
      heading:         simTelemetry.heading,
      currentStation:  simTelemetry.currentStation,
      nextStation:     simTelemetry.nextStation,
      sectionIndex:    simTelemetry.sectionIndex,
      progressInSection: simTelemetry.progressInSection,
      sectionDistance:  simTelemetry.sectionDistance,
      progress:        simTelemetry.progress,
      accumulatedDelay: simTelemetry.accumulatedDelay,
      status:          simTelemetry.status,
    };
  }
}

module.exports = SimulatorAdapter;
