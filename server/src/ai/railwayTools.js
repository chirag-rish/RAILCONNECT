/**
 * SIH26028 — AI Assistant 2.0: Railway Tool Layer (Architecture v3)
 *
 * ARCHITECTURE:
 *   PUBLIC tools — any authenticated user, no booking restriction:
 *     getTrainInfo, getMyTrainStatus, getMyTrainETA, getStationETAs,
 *     getOperationalEvents, getStationInfo, getWeather, getTrainFare, searchTrains
 *
 *   PRIVATE tools — req.user._id scoped only:
 *     getMyBookings, getMyActiveJourney, getMyPNR, getMyWalletBalance
 *
 * PRIVACY RULES (UNCHANGED):
 *   - Passenger A cannot see Passenger B's bookings/PNR/wallet/journey.
 *   - Public train data (status, ETA, fare, route) is available to all authenticated users.
 *   - Staff (TTE/admin) can access any user's PNR if provided.
 *
 * ERROR SEMANTICS:
 *   TRAIN_NOT_FOUND          — train does not exist in database
 *   LIVE_DATA_UNAVAILABLE    — train exists but live tracker has no data
 *   LIVE_DATA_STALE          — live data exists but is older than freshness threshold
 *   ETA_UNAVAILABLE          — ETA engine has no prediction for this train
 *   DATA_UNAVAILABLE         — generic — data source returned nothing
 */

const Booking = require('../models/Booking');
const Wallet  = require('../models/Wallet');
const Train   = require('../models/Train');
const ETAPrediction = require('../models/ETAPrediction');
const OperationalEvent = require('../models/OperationalEvent');
const { tracker, LiveETAEngine } = require('../live');
const { nowIST, getISTMidnight, formatDateForPassenger, formatTimeForPassenger } = require('../utils/istTime');
const { getWeather: fetchWeather } = require('./weatherService');
const { calculateBookingFare } = require('../utils/fareCalculator');
const { resolveTrain, resolveTrainWithRoute } = require('./trainResolver');

// ─── Source label display ────────────────────────────────────────────────────

const SOURCE_LABELS = {
  SIMULATOR:       'Simulator (project fallback)',
  LIVE_PROVIDER:   'Live provider',
  OFFICIAL_RAILWAY:'Official railway feed',
};

function formatSource(source) {
  return SOURCE_LABELS[source] || String(source || 'Unknown');
}

function cleanDelay(delay) {
  if (delay == null) return 0;
  const n = Number(delay);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function pickStationName(stationCode, routeStations) {
  if (!routeStations || !routeStations.length) return stationCode;
  const match = routeStations.find(
    (s) => String(s.station).toUpperCase() === String(stationCode).toUpperCase()
  );
  return match?.stationName || stationCode;
}

// ─── Active booking resolver (PRIVATE — user journey context only) ───────────

/**
 * resolveRelevantTrain — resolves the user's PERSONAL active journey.
 *
 * Used ONLY when the user asks about "my train" without specifying a train number.
 * NEVER used to block public queries like "where is train 11020?"
 *
 * Passengers → their nearest upcoming confirmed booking's train.
 * Staff       → train by explicit trainNumber (bypasses booking check).
 */
async function resolveRelevantTrain(context, trainNumber) {
  const userId = context.userId;
  const isStaff = context.isStaff === true || context.role === 'tte' || context.role === 'admin';
  let train = null;
  let booking = null;

  // Staff: resolve by trainNumber directly (no booking requirement)
  if (trainNumber && isStaff) {
    const resolved = await resolveTrain({ trainNumber: String(trainNumber) });
    if (resolved.found) train = resolved.train;
  }

  // All users: look in their bookings
  if (!train && userId) {
    const dayStart = getISTMidnight();
    const bookings = await Booking.find({ user: userId })
      .sort({ journeyDate: 1 })
      .populate('train', 'trainNumber name source destination status delayMinutes route')
      .lean();

    let active = bookings.filter(
      (b) =>
        b.train &&
        b.status !== 'Cancelled' &&
        new Date(b.journeyDate) >= dayStart
    );

    if (active.length === 0 && bookings.length > 0) {
      active = bookings.filter((b) => b.train && b.status !== 'Cancelled');
    }

    if (active.length > 0) {
      if (trainNumber) {
        const match = active.find(
          (b) => String(b.train.trainNumber).toUpperCase() === String(trainNumber).toUpperCase()
        );
        if (match) { booking = match; train = match.train; }
      } else {
        const upcoming = active.sort((a, b) => new Date(a.journeyDate) - new Date(b.journeyDate))[0];
        booking = upcoming;
        train = upcoming.train;
      }
    }
  }

  return { train, booking };
}

// ============================================================
// PUBLIC TOOLS — no booking restriction
// ============================================================

/**
 * getTrainInfo — general information about a train.
 * Any user may call this for any train.
 */
async function getTrainInfo(context, params = {}) {
  const { trainNumber, trainName } = params;
  if (!trainNumber && !trainName) {
    return { available: false, reason: 'Provide a train number or train name to look up.' };
  }

  const resolved = await resolveTrainWithRoute({ trainNumber, trainName });
  if (!resolved.found) {
    return {
      available: false,
      reason: `TRAIN_NOT_FOUND`,
      detail: `No train found for ${trainNumber || trainName} in the RailConnect database.`,
      searched: resolved.searched,
    };
  }

  const t = resolved.train;
  const stations = t.route?.stations?.map((s) => ({
    code: s.station,
    name: s.stationName || s.station,
    sequence: s.sequenceNumber,
    distanceFromOrigin: s.distanceFromOrigin,
    scheduledArrival: s.scheduledArrival || null,
    scheduledDeparture: s.scheduledDeparture || null,
    haltMinutes: s.haltDuration || null,
    isMajor: s.isMajorStation || false,
    platform: s.platform || null,
  })) || [];

  return {
    available: true,
    matchedBy: resolved.matchedBy,
    train: {
      trainNumber: t.trainNumber,
      name: t.name,
      type: t.type,
      source: t.source,
      destination: t.destination,
      departureTime: t.departureTime || null,
      arrivalTime: t.arrivalTime || null,
      distance: t.distance || null,
      daysOfOperation: t.daysOfOperation || [],
      status: t.status || null,
      delayMinutes: cleanDelay(t.delayMinutes),
      coachComposition: t.coachComposition?.map((c) => ({
        class: c.classType,
        totalSeats: c.totalSeats,
      })) || [],
    },
    route: {
      totalStations: stations.length || t.route?.totalStations || null,
      totalDistance: t.route?.totalDistance || t.distance || null,
      stations,
    },
  };
}

/**
 * searchTrains — search trains by route or at a station.
 * Supports source/destination codes AND city names (resolved via Station collection).
 */
async function searchTrains(context, params = {}) {
  const { source, destination, station, trainNumber, trainName } = params;

  // If a specific train number/name is given, delegate to getTrainInfo
  if (trainNumber || trainName) {
    return getTrainInfo(context, { trainNumber, trainName });
  }

  let query = {};

  if (source) {
    query.source = String(source).toUpperCase().trim();
  }
  if (destination) {
    query.destination = String(destination).toUpperCase().trim();
  }
  if (station) {
    const stationCode = String(station).toUpperCase().trim();
    query.$or = [{ source: stationCode }, { destination: stationCode }];
  }

  if (Object.keys(query).length === 0) {
    return { available: false, reason: 'Please provide a source, destination, or station to search trains.' };
  }

  const trains = await Train.find(query)
    .select('trainNumber name source destination departureTime arrivalTime type status delayMinutes daysOfOperation distance')
    .lean();

  if (!trains.length) {
    return {
      available: true,
      trains: [],
      message: 'No trains found matching your search criteria.',
    };
  }

  return {
    available: true,
    count: trains.length,
    trains: trains.map((t) => ({
      trainNumber: t.trainNumber,
      name: t.name,
      source: t.source,
      destination: t.destination,
      departureTime: t.departureTime || null,
      arrivalTime: t.arrivalTime || null,
      type: t.type || null,
      status: t.status || null,
      delayMinutes: cleanDelay(t.delayMinutes),
      daysOfOperation: t.daysOfOperation || [],
    })),
  };
}

/**
 * getMyTrainStatus — live status for a train.
 *
 * When trainNumber is supplied → public lookup (any user).
 * When trainNumber is absent   → resolves from user's active booking.
 */
async function getMyTrainStatus(context, params = {}) {
  const trainNumber = params?.trainNumber ? String(params.trainNumber).toUpperCase() : null;
  let train = null;
  let booking = null;

  if (trainNumber) {
    // PUBLIC path — resolve train directly, no booking requirement
    const resolved = await resolveTrain({ trainNumber });
    if (!resolved.found) {
      return {
        available: false,
        errorCode: 'TRAIN_NOT_FOUND',
        reason: `Train ${trainNumber} was not found in the RailConnect database.`,
      };
    }
    train = resolved.train;
  } else {
    // PRIVATE path — user's active journey
    const resolved = await resolveRelevantTrain(context);
    if (!resolved.train) {
      return {
        available: false,
        errorCode: 'NO_ACTIVE_BOOKING',
        reason: 'No active booking found. Please provide a train number or make a booking.',
      };
    }
    train = resolved.train;
    booking = resolved.booking;
  }

  // Fetch live state from tracker
  const liveState = tracker.getState(train._id.toString());

  // Fetch route for station names
  let routeStations = [];
  try {
    const withRoute = await Train.findById(train._id).populate('route').lean();
    routeStations = withRoute?.route?.stations || [];
  } catch (_) {}

  const currentStationCode = liveState?.currentStation || train.currentState?.lastKnownStation || train.source;
  const nextStationCode    = liveState?.nextStation    || train.currentState?.nextStation    || train.destination;

  const hasLiveTelemetry = Boolean(liveState);
  const isStale = liveState ? Boolean(liveState.isStale) : true;

  // If train exists but no live data at all
  if (!hasLiveTelemetry && !train.currentState?.lastKnownStation) {
    return {
      available: true,
      hasLiveTelemetry: false,
      errorCode: 'LIVE_DATA_UNAVAILABLE',
      train: {
        trainNumber: train.trainNumber,
        name: train.name,
        source: train.source,
        destination: train.destination,
        scheduledDeparture: train.departureTime || null,
        scheduledArrival: train.arrivalTime || null,
      },
      message: `${train.name} (${train.trainNumber}) exists in RailConnect but live tracking data is currently unavailable.`,
      pnr: booking?.pnr || null,
    };
  }

  return {
    available: true,
    hasLiveTelemetry,
    errorCode: isStale ? 'LIVE_DATA_STALE' : null,
    train: {
      trainNumber: train.trainNumber,
      name: train.name,
      source: train.source,
      sourceName: pickStationName(train.source, routeStations),
      destination: train.destination,
      destinationName: pickStationName(train.destination, routeStations),
      scheduledArrival: train.arrivalTime || null,
    },
    currentStation: currentStationCode,
    currentStationName: pickStationName(currentStationCode, routeStations),
    nextStation: nextStationCode,
    nextStationName: pickStationName(nextStationCode, routeStations),
    speedKmh: liveState?.speed != null ? Math.round(Number(liveState.speed)) : null,
    delayMinutes: cleanDelay(liveState?.accumulatedDelay ?? train.delayMinutes),
    status: liveState?.status || train.status || 'OnTime',
    source: liveState?.source || null,
    sourceLabel: liveState ? formatSource(liveState.source) : null,
    freshness: liveState ? (isStale ? 'STALE' : 'FRESH') : null,
    isStale,
    timestamp: liveState?.timestamp?.toISOString() || null,
    pnr: booking?.pnr || null,
  };
}

/**
 * getMyTrainETA — dynamic ETA for a train.
 *
 * When trainNumber is supplied → public lookup.
 * When trainNumber is absent   → user's active booking.
 */
async function getMyTrainETA(context, params = {}) {
  const trainNumber = params?.trainNumber ? String(params.trainNumber).toUpperCase() : null;
  let train = null;
  let booking = null;

  if (trainNumber) {
    const resolved = await resolveTrain({ trainNumber });
    if (!resolved.found) {
      return {
        available: false,
        errorCode: 'TRAIN_NOT_FOUND',
        reason: `Train ${trainNumber} was not found in the RailConnect database.`,
      };
    }
    train = resolved.train;
  } else {
    const resolved = await resolveRelevantTrain(context);
    if (!resolved.train) {
      return {
        available: false,
        errorCode: 'NO_ACTIVE_BOOKING',
        reason: 'No active booking found. Please provide a train number.',
      };
    }
    train = resolved.train;
    booking = resolved.booking;
  }

  // Try in-memory cache from LiveETAEngine first
  const cached = LiveETAEngine.getLatestPrediction(train._id.toString());

  if (cached?.destination) {
    return {
      available: true,
      hasDynamicETA: true,
      source: 'LiveETAEngine',
      trainNumber: train.trainNumber,
      trainName: train.name,
      predictionTime: cached.predictionTime,
      currentStation: cached.currentStation,
      nextStation: cached.nextStation,
      destination: cached.destination,
      quality: cached.quality || null,
      pnr: booking?.pnr || null,
    };
  }

  // Fallback: persisted ETAPrediction
  const latest = await ETAPrediction.findOne({ train: train._id })
    .sort({ predictionTime: -1 })
    .lean();

  if (latest?.predictedArrival) {
    return {
      available: true,
      hasDynamicETA: true,
      source: 'ETAPrediction (persisted)',
      trainNumber: train.trainNumber,
      trainName: train.name,
      predictionTime: latest.predictionTime,
      destination: {
        station: latest.targetStation,
        predictedArrival: latest.predictedArrival,
        predictedDelayMinutes: cleanDelay(latest.predictedDelay),
        stationsAway: latest.stationsAway ?? null,
      },
      pnr: booking?.pnr || null,
    };
  }

  return {
    available: true,
    hasDynamicETA: false,
    errorCode: 'ETA_UNAVAILABLE',
    trainNumber: train.trainNumber,
    trainName: train.name,
    reason: `No dynamic ETA prediction is currently available for ${train.name} (${train.trainNumber}).`,
    pnr: booking?.pnr || null,
  };
}

/**
 * getStationETAs — station-by-station ETA for a train.
 *
 * Public when trainNumber is supplied; uses active booking when absent.
 */
async function getStationETAs(context, params = {}) {
  const trainNumber = params?.trainNumber ? String(params.trainNumber).toUpperCase() : null;
  let train = null;
  let booking = null;

  if (trainNumber) {
    const resolved = await resolveTrain({ trainNumber });
    if (!resolved.found) {
      return {
        available: false,
        errorCode: 'TRAIN_NOT_FOUND',
        reason: `Train ${trainNumber} was not found in the RailConnect database.`,
      };
    }
    train = resolved.train;
  } else {
    const resolved = await resolveRelevantTrain(context);
    if (!resolved.train) {
      return {
        available: false,
        errorCode: 'NO_ACTIVE_BOOKING',
        reason: 'No active booking found. Please provide a train number.',
      };
    }
    train = resolved.train;
    booking = resolved.booking;
  }

  const cached = LiveETAEngine.getLatestPrediction(train._id.toString());

  if (cached && Array.isArray(cached.stationETAs) && cached.stationETAs.length > 0) {
    return {
      available: true,
      hasStationETAs: true,
      trainNumber: train.trainNumber,
      trainName: train.name,
      predictionTime: cached.predictionTime,
      source: cached.source || null,
      sourceLabel: cached.source ? formatSource(cached.source) : null,
      stationETAs: cached.stationETAs.map((s) => ({
        fromStation: s.fromStation,
        toStation: s.toStation,
        sectionIndex: s.sectionIndex,
        scheduledTravelTimeMinutes: s.scheduledTravelTimeMinutes,
        predictedDelayMinutes: cleanDelay(s.predictedDelayMinutes),
        predictedArrival: s.predictedArrival,
        accumulatedDelay: cleanDelay(s.accumulatedDelay),
        source: s.source || null,
      })),
      pnr: booking?.pnr || null,
    };
  }

  return {
    available: true,
    hasStationETAs: false,
    errorCode: 'ETA_UNAVAILABLE',
    trainNumber: train.trainNumber,
    trainName: train.name,
    reason: 'Station-by-station ETA is not currently available for this train.',
    pnr: booking?.pnr || null,
  };
}

/**
 * getOperationalEvents — active events affecting a train's route.
 *
 * Public when trainNumber is supplied; uses active booking when absent.
 * If no train at all, returns all active events system-wide.
 */
async function getOperationalEvents(context, params = {}) {
  const trainNumber = params?.trainNumber ? String(params.trainNumber).toUpperCase() : null;
  let train = null;

  if (trainNumber) {
    const resolved = await resolveTrain({ trainNumber });
    if (resolved.found) train = resolved.train;
    // If TRAIN_NOT_FOUND, still return events (just not filtered)
  } else {
    // Try active journey — but don't fail if none
    const resolved = await resolveRelevantTrain(context);
    if (resolved.train) train = resolved.train;
  }

  let activeEvents = await OperationalEvent.find({ isActive: true }).lean();
  if (!activeEvents.length) {
    return {
      available: true,
      hasEvents: false,
      trainNumber: train?.trainNumber || null,
      message: 'No active operational events are currently recorded.',
    };
  }

  // Filter events relevant to this train's route if we have a train
  if (train) {
    let relevantStations = new Set([
      String(train.source).toUpperCase(),
      String(train.destination).toUpperCase(),
    ]);
    try {
      const withRoute = await Train.findById(train._id).populate('route').lean();
      (withRoute?.route?.stations || []).forEach((s) =>
        relevantStations.add(String(s.station).toUpperCase())
      );
      (withRoute?.route?.sections || []).forEach((s) => {
        relevantStations.add(String(s.fromStation).toUpperCase());
        relevantStations.add(String(s.toStation).toUpperCase());
      });
    } catch (_) {}

    const filtered = activeEvents.filter((e) => {
      const touched =
        (e.affectedSection && relevantStations.has(String(e.affectedSection.fromStation).toUpperCase())) ||
        (e.affectedSection && relevantStations.has(String(e.affectedSection.toStation).toUpperCase())) ||
        (e.affectedStations || []).some((s) => relevantStations.has(String(s).toUpperCase()));
      return touched;
    });

    if (!filtered.length) {
      return {
        available: true,
        hasEvents: false,
        trainNumber: train.trainNumber,
        message: `No active operational events are currently affecting ${train.name} (${train.trainNumber}).`,
      };
    }
    activeEvents = filtered;
  }

  return {
    available: true,
    hasEvents: true,
    trainNumber: train?.trainNumber || null,
    events: activeEvents.slice(0, 10).map((e) => ({
      eventType: e.eventType,
      severity: e.severity,
      description: e.description || null,
      affectedSection: e.affectedSection
        ? { fromStation: e.affectedSection.fromStation, toStation: e.affectedSection.toStation }
        : null,
      affectedStations: e.affectedStations || [],
      speedLimit: e.speedLimit ?? null,
      estimatedDurationMinutes: e.estimatedDuration ?? null,
      startTime: e.startTime,
      endTime: e.endTime || null,
      source: e.source || null,
    })),
  };
}

/**
 * getTrainFare — authoritative fare calculation.
 * Public — any user can query fare for any train.
 */
async function getTrainFare(context, params = {}) {
  const { trainNumber, trainName, travelClass, passengerCount = 1, source, destination } = params;
  let train = null;

  // 1. Try canonical resolver
  if (trainNumber || trainName) {
    const resolved = await resolveTrain({ trainNumber, trainName });
    if (resolved.found) train = resolved.train;
  }

  // 2. Try source/destination if no specific train
  if (!train && source && destination) {
    train = await Train.findOne({
      source: String(source).toUpperCase().trim(),
      destination: String(destination).toUpperCase().trim(),
    }).lean();
  }

  // 3. Fall back to user's active booking
  if (!train) {
    const resolved = await resolveRelevantTrain(context, trainNumber);
    if (resolved.train) train = resolved.train;
  }

  if (!train) {
    return {
      available: false,
      errorCode: 'TRAIN_NOT_FOUND',
      reason: 'Train not found. Please provide a valid train number, train name, or route.',
    };
  }

  const cls = travelClass || 'SL';
  const count = parseInt(passengerCount, 10) || 1;
  const fareResult = calculateBookingFare(train, cls, count);

  return {
    available: true,
    trainNumber: train.trainNumber,
    trainName: train.name,
    travelClass: cls,
    passengerCount: fareResult.passengerCount,
    fareBreakdown: {
      baseFare: fareResult.baseFare,
      gst: fareResult.gst,
      totalFare: fareResult.totalFare,
      baseFarePerPassenger: fareResult.baseFarePerPassenger,
    },
    totalFare: fareResult.totalFare,
    priceNote: 'Authoritative booking fare (including 18% GST)',
  };
}

/**
 * getStationInfo — station details by code or name.
 */
const Station = require('../models/Station');

async function getStationInfo(context, params = {}) {
  const { stationCode, stationName } = params;
  if (!stationCode && !stationName) {
    return { available: true, found: false, reason: 'Provide a station code or station name.' };
  }

  const code = String(stationCode || '').toUpperCase().trim();
  const name = String(stationName || '').trim();

  let station = null;
  if (code) {
    station = await Station.findOne({ code }).lean();
  }
  if (!station && name) {
    const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    station = await Station.findOne({ $or: [{ name: re }, { city: re }] }).lean();
  }

  if (!station) {
    return {
      available: true,
      found: false,
      errorCode: 'STATION_NOT_FOUND',
      reason: `No station found for "${stationCode || stationName}".`,
    };
  }

  return {
    available: true,
    found: true,
    station: {
      code: station.code,
      name: station.name,
      city: station.city,
      state: station.state,
      zone: station.zone || null,
      division: station.division || null,
      latitude: station.latitude ?? null,
      longitude: station.longitude ?? null,
      stationType: station.stationType || null,
      platformCount: station.platformCount ?? null,
    },
  };
}

/**
 * getWeatherTool — real weather for a station/city.
 * ONLY called for explicit weather questions.
 */
async function getWeatherTool(context, params = {}) {
  const dateType = params?.date === 'tomorrow' ? 'tomorrow' : 'today';

  if (params?.destination === true) {
    // Get weather at user's active journey destination
    const { train } = await resolveRelevantTrain(context);
    if (!train) {
      return {
        available: false,
        reason: 'No active journey found. Please provide a station code or city name for weather.',
      };
    }
    return fetchWeather({ stationCode: train.destination, date: dateType });
  }

  if (params?.stationCode || params?.stationName) {
    return fetchWeather({
      stationCode: params.stationCode || undefined,
      stationName: params.stationName || undefined,
      date: dateType,
    });
  }

  return {
    available: false,
    reason: 'Please provide a station code or city name for weather. Example: "weather in Bangalore".',
  };
}

// ============================================================
// PRIVATE TOOLS — user identity enforced
// ============================================================

/**
 * getMyBookings — authenticated user's own bookings only.
 */
async function getMyBookings(context) {
  if (!context.userId) return { available: false, reason: 'No authenticated user' };
  const bookings = await Booking.find({ user: context.userId })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('train', 'trainNumber name source destination status delayMinutes type')
    .lean();

  if (!bookings.length) {
    return { available: true, bookings: [], message: 'No bookings found for this account.' };
  }

  return {
    available: true,
    bookings: bookings.map((b) => ({
      pnr: b.pnr,
      trainNumber: b.train?.trainNumber || null,
      trainName: b.train?.name || null,
      source: b.train?.source || null,
      destination: b.train?.destination || null,
      journeyDate: b.journeyDate,
      status: b.status,
      paymentStatus: b.paymentStatus,
      passengerCount: b.passengers?.length || 0,
      totalFare: b.totalFare,
    })),
  };
}

/**
 * getMyActiveJourney — the user's current/upcoming journey.
 */
async function getMyActiveJourney(context) {
  if (!context.userId) return { available: false, reason: 'No authenticated user' };
  const { train, booking } = await resolveRelevantTrain(context);
  if (!train || !booking) {
    return {
      available: false,
      errorCode: 'NO_ACTIVE_BOOKING',
      reason: 'No active or upcoming booking found for this account.',
    };
  }

  let stationNames = {};
  try {
    const route = await Train.findById(train._id).populate('route').lean();
    (route?.route?.stations || []).forEach((s) => {
      stationNames[String(s.station).toUpperCase()] = s.stationName || s.station;
    });
  } catch (_) {}

  return {
    available: true,
    booking: {
      pnr: booking.pnr,
      trainNumber: train.trainNumber,
      trainName: train.name,
      source: train.source,
      sourceName: stationNames[String(train.source).toUpperCase()] || null,
      destination: train.destination,
      destinationName: stationNames[String(train.destination).toUpperCase()] || null,
      journeyDate: booking.journeyDate,
      travelClass: booking.travelClass,
      status: booking.status,
      passengerCount: booking.passengers?.length || 0,
    },
  };
}

/**
 * getMyPNR — PNR/booking information (private).
 * Passengers see only their own PNR. Staff may look up any PNR.
 */
async function getMyPNR(context, params = {}) {
  if (!context.userId) return { available: false, reason: 'No authenticated user' };
  const isStaff = context.isStaff === true || context.role === 'tte' || context.role === 'admin';
  const pnr = params?.pnr ? String(params.pnr).toUpperCase() : null;

  let query = {};
  if (isStaff && pnr) {
    query = { pnr };
  } else if (pnr) {
    query = { pnr, user: context.userId };
  } else {
    query = { user: context.userId };
  }

  const bookings = await Booking.find(query)
    .sort({ createdAt: -1 })
    .limit(isStaff ? 5 : 10)
    .populate('train', 'trainNumber name source destination status delayMinutes type route')
    .lean();

  if (!bookings.length) {
    return {
      available: true,
      found: false,
      message: pnr
        ? `PNR ${pnr} was not found within the authorized scope.`
        : 'No bookings found for this account.',
    };
  }

  return {
    available: true,
    found: true,
    pnrs: bookings.map((b) => ({
      pnr: b.pnr,
      trainNumber: b.train?.trainNumber || null,
      trainName: b.train?.name || null,
      source: b.train?.source || null,
      destination: b.train?.destination || null,
      journeyDate: b.journeyDate,
      status: b.status,
      travelClass: b.travelClass,
      passengers: b.passengers?.map((p) => ({
        name: p.name,
        age: p.age,
        gender: p.gender,
        status: p.status,
        seat: p.assigned_seat || null,
        boarded: Boolean(p.boarded),
      })) || [],
      totalFare: b.totalFare,
      paymentStatus: b.paymentStatus,
    })),
  };
}

/**
 * getMyWalletBalance — wallet balance and recent transactions (private).
 */
async function getMyWalletBalance(context) {
  if (!context.userId) return { available: false, reason: 'No authenticated user' };

  const wallet = await Wallet.findOne({ user: context.userId }).lean();
  if (!wallet) {
    // Also check User.walletBalance for backward compatibility
    const User = require('../models/User');
    const user = await User.findById(context.userId).select('walletBalance').lean();
    const balance = user?.walletBalance ?? 0;
    return {
      available: true,
      balance,
      totalAdded: null,
      totalSpent: null,
      recentTransactions: [],
    };
  }

  return {
    available: true,
    balance: wallet.balance,
    totalAdded: wallet.totalAdded,
    totalSpent: wallet.totalSpent,
    recentTransactions: (wallet.transactions || [])
      .slice(-5)
      .reverse()
      .map((t) => ({
        type: t.type,
        amount: t.amount,
        description: t.description,
        date: t.createdAt,
      })),
  };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Public railway data tools
  getTrainInfo,
  searchTrains,
  getMyTrainStatus,
  getMyTrainETA,
  getStationETAs,
  getOperationalEvents,
  getStationInfo,
  getWeather: getWeatherTool,
  getTrainFare,
  // Private user data tools
  getMyBookings,
  getMyActiveJourney,
  getMyPNR,
  getMyWalletBalance,
  // Helpers
  resolveRelevantTrain,
  formatSource,
};
