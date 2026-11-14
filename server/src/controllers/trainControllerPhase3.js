const Train = require("../models/Train");
const Station = require("../models/Station");
const Booking = require("../models/Booking");
const { tracker, liveProviderPolling } = require("../live");
const { todayIST, getISTDateString, nowIST, parseISTDate } = require("../utils/istTime");
const { calculateJourneyProgress, JOURNEY_STATUS } = require("../utils/journeyProgress");

/**
 * Get train tracking information
 * @route   GET /api/trains/:trainNumber/tracking
 * @access  Private (authenticated users)
 */

exports.getTrainTracking = async (req, res) => {
  try {
    const { trainNumber } = req.params;

    if (!trainNumber) {
      return res.status(400).json({ message: "Train number is required" });
    }

    const train = await Train.findOne({ trainNumber: trainNumber.toUpperCase() })
      .select(
        "trainNumber name source destination departureTime arrivalTime distance status delayMinutes type baseFare coachComposition route"
      )
      .populate('route');

    if (!train) {
      return res.status(404).json({ message: "Train not found" });
    }

    if (liveProviderPolling && typeof liveProviderPolling.addTrain === 'function') {
      liveProviderPolling.addTrain(train.trainNumber).catch(() => {});
    }

    // Try to get live telemetry state from Phase 5A/5B tracker
    const liveState = tracker.getState(train._id.toString());

    // Resolve route stations and segments with coordinates
    let routeStations = [];
    let routeSegments = [];

    if (train.route && train.route.stations && train.route.stations.length > 0) {
      const stationCodes = train.route.stations.map(s => s.station).filter(Boolean);
      const stationDocs = await Station.find({ code: { $in: stationCodes } }).lean();
      const stationMap = {};
      stationDocs.forEach(d => { stationMap[d.code] = d; });

      routeStations = train.route.stations.map((st, idx) => {
        const doc = stationMap[st.station] || {};
        return {
          code: st.station,
          name: st.stationName || doc.name || st.station,
          city: doc.city || '',
          state: doc.state || '',
          latitude: doc.latitude || 0,
          longitude: doc.longitude || 0,
          sequence: st.sequenceNumber || (idx + 1),
          distanceFromOrigin: st.distanceFromOrigin || 0,
          scheduledArrival: st.scheduledArrival || null,
          scheduledDeparture: st.scheduledDeparture || null,
          haltDuration: st.haltDuration ?? 2,
        };
      });

      routeSegments = (train.route.sections || []).map(sec => {
        const fromDoc = stationMap[sec.fromStation] || {};
        const toDoc = stationMap[sec.toStation] || {};
        return {
          fromStation: sec.fromStation,
          toStation: sec.toStation,
          distance: sec.distance,
          typicalSpeed: sec.typicalSpeed,
          maxSpeed: sec.maxSpeed,
          sectionType: sec.sectionType,
          from: { lat: fromDoc.latitude || 0, lng: fromDoc.longitude || 0, name: fromDoc.name || sec.fromStation },
          to: { lat: toDoc.latitude || 0, lng: toDoc.longitude || 0, name: toDoc.name || sec.toStation },
        };
      });
    }

    // Prefer live telemetry over simulated data
    const speed = liveState?.speed ?? 0;
    const latitude = liveState?.latitude ?? (routeStations[0]?.latitude || 28.6139);
    const longitude = liveState?.longitude ?? (routeStations[0]?.longitude || 77.209);
    const progressInSection = liveState?.progressInSection ?? 0;
    const sectionIndex = liveState?.sectionIndex ?? 0;
    const accumulatedDelay = liveState?.accumulatedDelay ?? train.delayMinutes ?? 0;
    const status = liveState?.status || train.status || "OnTime";
    const isStale = liveState?.isStale ?? false;
    const source = liveState?.source ?? 'UNKNOWN';
    const freshness = liveState?.freshness ?? 'UNKNOWN';
    const heading = liveState?.heading ?? 0;

    // Single source of truth for journey progress / station chain
    const journey = calculateJourneyProgress({
      route: train.route,
      sectionIndex,
      progressInSection,
      currentStation: liveState?.currentStation || null,
      nextStation: liveState?.nextStation || null,
      source: train.source,
      destination: train.destination,
      speed,
      delayMinutes: accumulatedDelay,
      departureTime: train.departureTime,
      arrivalTime: train.arrivalTime,
    });

    let currentStationCode = journey.currentStation || train.source;
    let nextStationCode = journey.nextStation || train.destination;

    // Prefer exact route codes when derived codes are missing from the route list
    const routeCodes = new Set(routeStations.map(s => s.code));
    if (!routeCodes.has(currentStationCode)) {
      currentStationCode = train.source;
    }
    if (!routeCodes.has(nextStationCode) || nextStationCode === currentStationCode) {
      const curIdx = routeStations.findIndex(s => s.code === currentStationCode);
      nextStationCode = routeStations[curIdx + 1]?.code || train.destination;
    }

    if (journey.atDestination || currentStationCode === train.destination) {
      currentStationCode = train.destination;
      nextStationCode = train.destination;
    }

    const progress = journey.percentage;
    const distanceToNext = journey.distanceToNext;

    // Simulate occupancy per class from coachComposition (real seat counts from DB)
    const occupancy = (train.coachComposition || []).map((coach) => {
      const totalSeats = coach.totalSeats || 72;
      const filledSeats = Math.floor(totalSeats * 0.75);
      return {
        class: coach.classType,
        filled: filledSeats,
        total: totalSeats,
      };
    });

    // Calculate ETA to next station / destination from journey geometry + speed
    let etaMinutes = journey.etaToNextMinutes;
    if (etaMinutes == null) {
      if (journey.atDestination) {
        etaMinutes = 0;
      } else if (journey.remainingDistance > 0 && speed > 0) {
        etaMinutes = Math.round((journey.remainingDistance / speed) * 60);
      } else {
        etaMinutes = 15;
      }
    }
    const estimatedArrival = new Date(Date.now() + etaMinutes * 60000);

    res.json({
      _id: train._id,
      trainNumber: train.trainNumber,
      name: train.name,
      source: train.source,
      destination: train.destination,
      currentStation: currentStationCode,
      previousStation: journey.previousStation,
      currentLocation: { lat: latitude, lng: longitude },
      nextStation: nextStationCode,
      distanceFromNext: Math.round(distanceToNext),
      estimatedArrival: estimatedArrival.toISOString(),
      status: status,
      delay: accumulatedDelay,
      speed: speed,
      heading,
      occupancy: occupancy,
      progress,
      journeyState: journey.status,
      sectionIndex: journey.sectionIndex,
      progressInSection: journey.progressInSection,
      distanceTravelled: journey.distanceTravelled,
      totalDistance: journey.totalDistance,
      remainingDistance: journey.remainingDistance,
      elapsedMinutes: journey.elapsedMinutes,
      remainingMinutes: journey.remainingMinutes,
      departureTime: train.departureTime,
      arrivalTime: train.arrivalTime,
      routeStations,
      routeSegments,
      telemetrySource: source,
      telemetryFreshness: freshness,
      telemetryTimestamp: liveState?.timestamp?.toISOString?.() ?? null,
      positionSource: liveState?.positionSource || 'UNKNOWN',
      isStale: isStale,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching train tracking:", error);
    res.status(500).json({
      message: "Failed to fetch train tracking",
      error: error.message,
    });
  }
};

/**
 * Get train details with availability
 * @route   GET /api/trains/:trainNumber
 * @access  Private (authenticated users)
 */
exports.getTrainDetails = async (req, res) => {
  try {
    const { trainNumber } = req.params;

    if (!trainNumber) {
      return res.status(400).json({ message: "Train number is required" });
    }

    const train = await Train.findOne({
      trainNumber: trainNumber.toUpperCase(),
    }).populate("routes");

    if (!train) {
      return res.status(404).json({ message: "Train not found" });
    }

    res.json({
      _id: train._id,
      trainNumber: train.trainNumber,
      name: train.name,
      type: train.type,
      source: train.source,
      destination: train.destination,
      departureTime: train.departureTime,
      arrivalTime: train.arrivalTime,
      distance: train.distance,
      baseFare: train.baseFare,
      classes: train.classes,
      coaches: train.coaches,
      status: train.status,
      platform: train.platform,
      daysOfOperation: train.daysOfOperation,
      seatAvailability: train.seatAvailability,
    });
  } catch (error) {
    console.error("Error fetching train details:", error);
    res.status(500).json({
      message: "Failed to fetch train details",
      error: error.message,
    });
  }
};

/**
 * Get seat availability for a specific class and date
 * @route   GET /api/trains/:trainNumber/availability?class=2A&date=YYYY-MM-DD
 * @access  Private (authenticated users)
 */
exports.getTrainAvailability = async (req, res) => {
  try {
    const { trainNumber } = req.params;
    const { class: trainClass, date } = req.query;

    if (!trainNumber || !trainClass) {
      return res
        .status(400)
        .json({ message: "Train number and class are required" });
    }

    const train = await Train.findOne({
      trainNumber: trainNumber.toUpperCase(),
    });

    if (!train) {
      return res.status(404).json({ message: "Train not found" });
    }

    if (!train.classes.includes(trainClass)) {
      return res.status(400).json({ message: "Invalid class for this train" });
    }

    // Get bookings for this train on the specified date (IST)
    const journeyDateStr = date || todayIST();
    const bookings = await Booking.find({
      train: train._id,
      journeyDate: journeyDateStr,
    });

    // Calculate availability
    const classCoach = train.coaches.find((c) => c.class === trainClass);
    const totalSeats = classCoach ? classCoach.totalSeats : 50;

    let bookedSeats = 0;
    bookings.forEach((booking) => {
      const passengers = booking.passengers.filter(
        (p) => p.status === "CNF"
      ).length;
      bookedSeats += passengers;
    });

    const available = totalSeats - bookedSeats;

    res.json({
      trainNumber: train.trainNumber,
      class: trainClass,
      date: journeyDateStr,
      totalSeats,
      bookedSeats,
      available,
      status: available > 0 ? "Available" : "Fully Booked",
    });
  } catch (error) {
    console.error("Error fetching train availability:", error);
    res.status(500).json({
      message: "Failed to fetch train availability",
      error: error.message,
    });
  }
};

/**
 * List all trains
 * @route   GET /api/trains
 * @access  Public
 */
exports.getAllTrains = async (req, res) => {
  try {
    const trains = await Train.find({ status: "Active" })
      .select(
        "trainNumber name type source destination departureTime arrivalTime baseFare classes"
      )
      .limit(20);

    res.json({
      count: trains.length,
      trains,
    });
  } catch (error) {
    console.error("Error fetching trains:", error);
    res.status(500).json({
      message: "Failed to fetch trains",
      error: error.message,
    });
  }
};
