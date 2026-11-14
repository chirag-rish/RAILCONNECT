/**
 * SIH26028 — AI Assistant 2.0: Canonical Railway Entity Resolver
 *
 * ONE authoritative resolver for all public train lookups.
 * All AI tools that retrieve public train data must go through here.
 *
 * This is SEPARATE from resolveRelevantTrain (which is for personal journey context).
 *
 * Rules:
 *   - Any authenticated user can resolve any train by number or name.
 *   - Train resolution is NEVER restricted by booking ownership.
 *   - Privacy-restricted data (bookings, PNR, wallet) is handled separately.
 *
 * Returns a structured result so callers can always distinguish:
 *   TRAIN_NOT_FOUND        — train does not exist in DB
 *   TRAIN_FOUND            — train exists
 */

const Train = require('../models/Train');
const mongoose = require('mongoose');

/**
 * Normalize a train number or name string for matching.
 * Trims whitespace, uppercases.
 */
function normalizeTrainId(input) {
  if (input == null) return null;
  return String(input).trim().toUpperCase();
}

/**
 * resolveTrain — canonical public train lookup.
 *
 * Accepts any of:
 *   trainNumber   — "11020", "12951"
 *   trainName     — "Konark Express", "rajdhani" (case-insensitive partial match)
 *   _id           — MongoDB ObjectId string
 *
 * Returns:
 *   { found: true,  train, matchedBy: 'number'|'name'|'id', source: 'database' }
 *   { found: false, reason: 'TRAIN_NOT_FOUND', searched: {...} }
 *
 * NEVER throws. Always returns a structured result.
 */
async function resolveTrain({ trainNumber, trainName, id } = {}) {
  const searched = {};

  // 1. Try by MongoDB _id first (most specific)
  if (id) {
    const idStr = String(id).trim();
    searched.id = idStr;
    if (mongoose.Types.ObjectId.isValid(idStr)) {
      const train = await Train.findById(idStr).lean();
      if (train) return { found: true, train, matchedBy: 'id', source: 'database' };
    }
  }

  // 2. Try by trainNumber (exact match, normalized)
  if (trainNumber) {
    const num = normalizeTrainId(trainNumber);
    searched.trainNumber = num;
    if (num) {
      const train = await Train.findOne({ trainNumber: num }).lean();
      if (train) return { found: true, train, matchedBy: 'number', source: 'database' };
    }
  }

  // 3. Try by trainName (case-insensitive, supports partial match)
  if (trainName) {
    const nameTrimmed = String(trainName).trim();
    searched.trainName = nameTrimmed;
    if (nameTrimmed.length >= 2) {
      // Try exact name first (case-insensitive)
      const exactTrain = await Train.findOne({
        name: { $regex: new RegExp(`^${nameTrimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      }).lean();
      if (exactTrain) return { found: true, train: exactTrain, matchedBy: 'name', source: 'database' };

      // Partial match
      const partialTrain = await Train.findOne({
        name: { $regex: new RegExp(nameTrimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
      }).lean();
      if (partialTrain) return { found: true, train: partialTrain, matchedBy: 'name', source: 'database' };
    }
  }

  return { found: false, reason: 'TRAIN_NOT_FOUND', searched };
}

/**
 * resolveTrainWithRoute — same as resolveTrain but also populates the Route subdocument.
 * Use this when you need station stops / schedule / sections.
 */
async function resolveTrainWithRoute({ trainNumber, trainName, id } = {}) {
  const base = await resolveTrain({ trainNumber, trainName, id });
  if (!base.found) return base;

  try {
    const withRoute = await Train.findById(base.train._id)
      .populate('route')
      .lean();
    return { ...base, train: withRoute || base.train };
  } catch (_) {
    return base; // Return train without route if population fails
  }
}

/**
 * resolveStation — canonical station lookup by code or name.
 * Included here so all resolution lives in one place.
 */
const Station = require('../models/Station');

async function resolveStation({ stationCode, stationName } = {}) {
  const searched = {};

  if (stationCode) {
    const code = String(stationCode).trim().toUpperCase();
    searched.stationCode = code;
    const station = await Station.findOne({ code }).lean();
    if (station) return { found: true, station, matchedBy: 'code', source: 'database' };
  }

  if (stationName) {
    const name = String(stationName).trim();
    searched.stationName = name;
    if (name.length >= 2) {
      const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const station = await Station.findOne({ $or: [{ name: re }, { city: re }] }).lean();
      if (station) return { found: true, station, matchedBy: 'name', source: 'database' };
    }
  }

  return { found: false, reason: 'STATION_NOT_FOUND', searched };
}

module.exports = {
  resolveTrain,
  resolveTrainWithRoute,
  resolveStation,
  normalizeTrainId,
};
