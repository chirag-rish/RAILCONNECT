/**
 * SIH26028 — Phase 5A: Live Train Tracker (5D)
 *
 * Central in-memory state for the latest valid telemetry per train.
 * Provides:
 *   - Per-train state with source, timestamp, freshness
 *   - Stale detection
 *   - Ingestion statistics
 *   - Socket.io broadcast of normalized telemetry
 *
 * Architecture note:
 *   Uses an in-memory Map for O(1) per-train lookups.
 *   The MongoDB Train.currentState field is the persistent backup;
 *   this tracker is the high-frequency runtime layer.
 *   Future scaling: replace Map with Redis for multi-process.
 */

const { STALENESS_THRESHOLDS_MS, SOURCE_LABELS } = require('./constants');
const logger = require('../utils/logger');
const etaEngine = require('./liveEtaEngine');

class LiveTrainTracker {
  constructor() {
    /** @type {Map<string, Object>} trainId → live state record */
    this.state = new Map();

    /** @type {Object|null} Socket.io instance */
    this.io = null;

    /** Ingestion statistics */
    this.stats = {
      totalIngested: 0,
      validIngested: 0,
      invalidTelemetry: 0,
      staleTelemetry: 0,
      lastIngestionTime: null,
      lastIngestionError: null,
      startedAt: new Date(),
    };
  }

  /**
   * Attach Socket.io instance for broadcasting.
   * @param {Object} ioInstance
   */
  setIo(ioInstance) {
    this.io = ioInstance;
  }

  /**
   * Accept a normalized telemetry record.
   * Validates, updates state, detects staleness, emits Socket.io events.
   *
   * @param {Object} telemetry - Fully normalized + validated telemetry
   * @param {string[]} [validationErrors] - Pre-computed validation errors (if invalid)
   * @returns {boolean} true if accepted, false if rejected
   */
  ingest(telemetry, validationErrors) {
    this.stats.totalIngested++;
    this.stats.lastIngestionTime = new Date();

    // Reject invalid telemetry
    if (validationErrors && validationErrors.length > 0) {
      this.stats.invalidTelemetry++;
      this.stats.lastIngestionError = {
        time: new Date(),
        trainNumber: telemetry.trainNumber,
        errors: validationErrors,
      };
      logger.warn('Rejected invalid telemetry', {
        trainNumber: telemetry.trainNumber,
        errors: validationErrors,
      });
      return false;
    }

    // Detect staleness
    const now = new Date();
    const threshold = STALENESS_THRESHOLDS_MS[telemetry.source];
    if (telemetry.timestamp && threshold != null) {
      telemetry.isStale = (now.getTime() - telemetry.timestamp.getTime()) > threshold;
    } else {
      telemetry.isStale = true;
    }

    if (telemetry.isStale) {
      this.stats.staleTelemetry++;
    }

    // Store in state
    const key = telemetry.trainId;
    this.state.set(key, {
      ...telemetry,
      receivedAt: now,
    });

    this.stats.validIngested++;

    // Broadcast via Socket.io
    this._broadcast(telemetry);

    // Trigger operational notifications on significant delay or cancellation
    if ((telemetry.accumulatedDelay >= 15 || telemetry.status === 'Cancelled') && telemetry.trainId) {
      try {
        const Booking = require('../models/Booking');
        const User = require('../models/User');

        if (!this._notifiedKeys) {
          this._notifiedKeys = new Set();
        }
        const notifiedKey = `${telemetry.trainId}:${telemetry.accumulatedDelay}:${telemetry.status}`;
        if (!this._notifiedKeys.has(notifiedKey)) {
          this._notifiedKeys.add(notifiedKey);

          Booking.find({
            train: telemetry.trainId,
            status: { $in: ['Confirmed', 'Pending'] }
          }).populate('user').then(async (bookings) => {
            for (const booking of bookings) {
              if (booking.user) {
                const user = booking.user;
                const notification = {
                  type: telemetry.status === 'Cancelled' ? 'BOOKING_CANCELLED' : 'TRAIN_DELAYED',
                  title: `Train Operational Alert: ${telemetry.trainNumber}`,
                  message: `Train ${telemetry.trainNumber} is currently ${telemetry.status === 'Cancelled' ? 'cancelled' : 'experiencing a delay of ' + telemetry.accumulatedDelay + ' mins'}.`,
                  date: new Date()
                };
                user.notifications.push(notification);
                await user.save();

                if (this.io) {
                  this.io.to(`user:${user._id.toString()}`).emit('notification:booking', notification);
                }
              }
            }
          }).catch(err => {
            logger.warn('Failed to send operational notifications', { error: err.message });
          });
        }
      } catch (err) {
        logger.warn('Operational notification failed (non-blocking)', { error: err.message });
      }
    }

    // Phase 5B — Trigger dynamic ML ETA prediction
    try {
      etaEngine.onTelemetryIngested(telemetry);
    } catch (err) {
      logger.warn('Eta engine trigger failed (non-blocking)', { error: err.message });
    }

    return true;
  }

  /**
   * Get the latest live state for a specific train.
   * @param {string} trainId
   * @returns {Object|null}
   */
  getState(trainId) {
    return this.state.get(trainId) || null;
  }

  /**
   * Get the latest live state for all tracked trains.
   * @returns {Object} trainId → state
   */
  getAllStates() {
    const result = {};
    for (const [trainId, state] of this.state) {
      result[trainId] = state;
    }
    return result;
  }

  /**
   * Count how many trains are currently stale.
   * @returns {number}
   */
  getStaleCount() {
    let count = 0;
    for (const [, state] of this.state) {
      if (state.isStale) count++;
    }
    return count;
  }

  /**
   * Get comprehensive health/status information.
   * @returns {Object}
   */
  getHealth() {
    const staleCount = this.getStaleCount();
    return {
      activeTrains: this.state.size,
      staleTrains: staleCount,
      healthyTrains: this.state.size - staleCount,
      stats: {
        totalIngested: this.stats.totalIngested,
        validIngested: this.stats.validIngested,
        invalidTelemetry: this.stats.invalidTelemetry,
        staleTelemetry: this.stats.staleTelemetry,
        lastIngestionTime: this.stats.lastIngestionTime,
        lastIngestionError: this.stats.lastIngestionError,
        startedAt: this.stats.startedAt,
        uptimeMs: Date.now() - this.stats.startedAt.getTime(),
      },
      sources: this._getSourceBreakdown(),
    };
  }

  /**
   * Broadcast telemetry to connected Socket.io clients.
   * Preserves existing event format for backward compatibility.
   * @param {Object} telemetry
   * @private
   */
  _broadcast(telemetry) {
    if (!this.io) return;

    const payload = {
      trainId:           telemetry.trainId,
      trainNumber:       telemetry.trainNumber,
      timestamp:         telemetry.timestamp,
      latitude:          telemetry.latitude,
      longitude:         telemetry.longitude,
      speed:             telemetry.speed,
      heading:           telemetry.heading,
      currentStation:    telemetry.currentStation,
      nextStation:       telemetry.nextStation,
      sectionIndex:      telemetry.sectionIndex,
      progressInSection: telemetry.progressInSection,
      sectionDistance:    telemetry.sectionDistance || 0,
      progress:          telemetry.progress != null && Number.isFinite(Number(telemetry.progress))
        ? Math.min(100, Math.max(0, Number(telemetry.progress)))
        : null,
      accumulatedDelay:  telemetry.accumulatedDelay,
      status:            telemetry.status,
      isRunning:         true,
      // Phase 5A additions (backward-compatible — new fields)
      source:            telemetry.source,
      sourceLabel:       SOURCE_LABELS[telemetry.source] || telemetry.source,
      sourceTimestamp:    telemetry.sourceTimestamp,
      receivedAt:        telemetry.receivedAt,
      isStale:           telemetry.isStale,
      freshness:         telemetry.isStale ? 'STALE' : 'FRESH',
      positionSource:    telemetry.positionSource || 'UNKNOWN',
    };

    // Same events as existing simulator for backward compatibility
    this.io.to(`train:${telemetry.trainId}`).emit('train:update', payload);
    this.io.to('telemetry:all').emit('train:telemetry', payload);
  }

  /**
   * Get breakdown of active trains per source.
   * @returns {Object}
   * @private
   */
  _getSourceBreakdown() {
    const breakdown = {};
    for (const [, state] of this.state) {
      const src = state.source || 'UNKNOWN';
      breakdown[src] = (breakdown[src] || 0) + 1;
    }
    return breakdown;
  }
}

module.exports = LiveTrainTracker;
