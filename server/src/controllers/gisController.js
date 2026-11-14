/**
 * SIH26028 — Live Railway GIS Controller
 *
 * Provides aggregated geospatial data for the live railway map:
 *   - All stations with coordinates
 *   - All active train positions with live telemetry
 *   - Route geometry (station-to-station geodesic segments)
 *   - Section congestion status
 */

const mongoose = require('mongoose');
const Station = require('../models/Station');
const Train = require('../models/Train');
const OperationalEvent = require('../models/OperationalEvent');
const { tracker, sourceManager } = require('../live');

/**
 * GET /api/gis/stations
 * Return all stations with coordinates.
 * @access Public
 */
const getStations = async (req, res) => {
  try {
    const stations = await Station.find({
      latitude: { $exists: true, $ne: null },
      longitude: { $exists: true, $ne: null },
    })
      .select('code name city state latitude longitude zone stationType')
      .lean();

    res.json({
      success: true,
      count: stations.length,
      stations,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch stations', error: error.message });
  }
};

/**
 * GET /api/gis/trains
 * Return all active trains with live telemetry positions.
 * Only trains with fresh telemetry or valid currentState are included.
 * @access Public
 */
const getActiveTrains = async (req, res) => {
  try {
    const allLiveStates = tracker.getAllStates();
    const trainIds = Object.keys(allLiveStates);

    if (trainIds.length === 0) {
      return res.json({ success: true, count: 0, trains: [] });
    }

    const trains = await Train.find({
      _id: { $in: trainIds.map(id => new mongoose.Types.ObjectId(id)) },
    })
      .select('trainNumber name source destination route delayMinutes status')
      .populate({
        path: 'route',
        select: 'routeCode name stations sections',
        populate: {
          path: 'stations',
          match: {},
        },
      })
      .lean();

    const enrichedTrains = trains
      .filter(train => {
        const liveState = allLiveStates[train._id.toString()];
        return liveState && liveState.latitude != null && liveState.longitude != null;
      })
      .map(train => {
        const liveState = allLiveStates[train._id.toString()];
        return {
          _id: train._id,
          trainNumber: train.trainNumber,
          name: train.name,
          source: train.source,
          destination: train.destination,
          latitude: liveState.latitude,
          longitude: liveState.longitude,
          speed: liveState.speed || 0,
          heading: liveState.heading || 0,
          currentStation: liveState.currentStation,
          nextStation: liveState.nextStation,
          sectionIndex: liveState.sectionIndex || 0,
          progressInSection: liveState.progressInSection || 0,
          delay: liveState.accumulatedDelay || 0,
          status: liveState.status || train.status || 'OnTime',
          source: liveState.source || 'UNKNOWN',
          sourceLabel: liveState.sourceLabel || liveState.source || 'Unknown',
          freshness: liveState.isStale ? 'STALE' : 'FRESH',
          isStale: !!liveState.isStale,
          timestamp: liveState.timestamp,
          receivedAt: liveState.receivedAt,
          trainDelayMinutes: train.delayMinutes || 0,
        };
      });

    res.json({
      success: true,
      count: enrichedTrains.length,
      trains: enrichedTrains,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch active trains', error: error.message });
  }
};

/**
 * GET /api/gis/routes
 * Return route geometry: station-to-station geodesic segments with section metadata.
 * @access Public
 */
const getRouteGeometry = async (req, res) => {
  try {
    const Route = require('../models/Route');
    const routes = await Route.find({})
      .select('routeCode name stations sections')
      .lean();

    const stationMap = {};
    const allStations = await Station.find({
      latitude: { $exists: true, $ne: null },
      longitude: { $exists: true, $ne: null },
    })
      .select('code name latitude longitude')
      .lean();

    allStations.forEach(s => {
      stationMap[s.code] = { lat: s.latitude, lng: s.longitude, name: s.name };
    });

    const enrichedRoutes = routes
      .filter(route => route.sections && route.sections.length > 0)
      .map(route => {
        const segments = route.sections
          .map(section => {
            const from = stationMap[section.fromStation];
            const to = stationMap[section.toStation];
            if (!from || !to) return null;

            return {
              fromStation: section.fromStation,
              toStation: section.toStation,
              distance: section.distance,
              typicalSpeed: section.typicalSpeed,
              maxSpeed: section.maxSpeed,
              sectionType: section.sectionType,
              from: { lat: from.lat, lng: from.lng, name: from.name },
              to: { lat: to.lat, lng: to.lng, name: to.name },
            };
          })
          .filter(Boolean);

        if (segments.length === 0) return null;

        return {
          routeCode: route.routeCode,
          name: route.name,
          segmentCount: segments.length,
          segments,
        };
      })
      .filter(Boolean);

    res.json({
      success: true,
      count: enrichedRoutes.length,
      routes: enrichedRoutes,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch route geometry', error: error.message });
  }
};

/**
 * GET /api/gis/congestion
 * Return section congestion status based on operational events and train density.
 * @access Public
 */
const getSectionCongestion = async (req, res) => {
  try {
    const activeEvents = await OperationalEvent.find({ isActive: true }).lean();
    const allLiveStates = tracker.getAllStates();
    const liveStateArray = Object.values(allLiveStates);

    const sectionTrainCount = {};
    liveStateArray.forEach(state => {
      if (state.isStale || state.latitude == null) return;
      const key = `${state.currentStation || 'unknown'}->${state.nextStation || 'unknown'}`;
      sectionTrainCount[key] = (sectionTrainCount[key] || 0) + 1;
    });

    const sections = [];
    activeEvents.forEach(event => {
      const from = event.affectedSection?.fromStation;
      const to = event.affectedSection?.toStation;
      if (!from || !to) return;

      let status = 'NORMAL';
      if (event.eventType === 'SpeedRestriction' || event.eventType === 'WeatherAlert') {
        status = 'CONGESTED';
      } else if (event.eventType === 'SignalFailure' || event.eventType === 'MaintenanceBlock') {
        status = 'SEVERE';
      }

      sections.push({
        fromStation: from,
        toStation: to,
        status,
        eventType: event.eventType,
        speedLimit: event.speedLimit,
        severity: event.severity,
        description: event.description,
      });
    });

    Object.entries(sectionTrainCount).forEach(([key, count]) => {
      if (count >= 3) {
        const [from, to] = key.split('->');
        const existing = sections.find(s => s.fromStation === from && s.toStation === to);
        if (!existing) {
          sections.push({
            fromStation: from,
            toStation: to,
            status: count >= 5 ? 'SEVERE' : 'CONGESTED',
            eventType: 'HighDensity',
            trainCount: count,
          });
        }
      }
    });

    res.json({
      success: true,
      count: sections.length,
      sections,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch congestion data', error: error.message });
  }
};

/**
 * GET /api/gis/overview
 * Single aggregated endpoint for the map: stations + trains + routes + congestion.
 * @access Public
 */
const getOverview = async (req, res) => {
  try {
    const [stationsResult, trainsResult, routesResult, congestionResult] = await Promise.allSettled([
      getStationsData(),
      getTrainsData(),
      getRoutesData(),
      getCongestionData(),
    ]);

    res.json({
      success: true,
      stations: stationsResult.status === 'fulfilled' ? stationsResult.value : [],
      trains: trainsResult.status === 'fulfilled' ? trainsResult.value : [],
      routes: routesResult.status === 'fulfilled' ? routesResult.value : [],
      congestion: congestionResult.status === 'fulfilled' ? congestionResult.value : [],
      activeSource: sourceManager.getActiveSource(),
      sourceLabel: sourceManager.getActiveSourceLabel(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch GIS overview', error: error.message });
  }
};

// ============================================================
// INTERNAL DATA FUNCTIONS (shared between overview + individual endpoints)
// ============================================================

async function getStationsData() {
  const stations = await Station.find({
    latitude: { $exists: true, $ne: null },
    longitude: { $exists: true, $ne: null },
  })
    .select('code name city state latitude longitude zone stationType')
    .lean();
  return stations;
}

async function getTrainsData() {
  const allLiveStates = tracker.getAllStates();
  const trainIds = Object.keys(allLiveStates);
  if (trainIds.length === 0) return [];

  const trains = await Train.find({
    _id: { $in: trainIds.map(id => new mongoose.Types.ObjectId(id)) },
  })
    .select('trainNumber name source destination route delayMinutes status')
    .lean();

  return trains
    .filter(train => {
      const liveState = allLiveStates[train._id.toString()];
      return liveState && liveState.latitude != null && liveState.longitude != null;
    })
    .map(train => {
      const liveState = allLiveStates[train._id.toString()];
      return {
        _id: train._id,
        trainNumber: train.trainNumber,
        name: train.name,
        source: train.source,
        destination: train.destination,
        latitude: liveState.latitude,
        longitude: liveState.longitude,
        speed: liveState.speed || 0,
        heading: liveState.heading || 0,
        currentStation: liveState.currentStation,
        nextStation: liveState.nextStation,
        sectionIndex: liveState.sectionIndex || 0,
        progressInSection: liveState.progressInSection || 0,
        delay: liveState.accumulatedDelay || 0,
        status: liveState.status || train.status || 'OnTime',
        source: liveState.source || 'UNKNOWN',
        sourceLabel: liveState.sourceLabel || liveState.source || 'Unknown',
        freshness: liveState.isStale ? 'STALE' : 'FRESH',
        isStale: !!liveState.isStale,
        timestamp: liveState.timestamp,
      };
    });
}

async function getRoutesData() {
  const Route = require('../models/Route');
  const routes = await Route.find({})
    .select('routeCode name stations sections')
    .lean();

  const stationMap = {};
  const allStations = await Station.find({
    latitude: { $exists: true, $ne: null },
    longitude: { $exists: true, $ne: null },
  })
    .select('code name latitude longitude')
    .lean();

  allStations.forEach(s => {
    stationMap[s.code] = { lat: s.latitude, lng: s.longitude, name: s.name };
  });

  const enrichedRoutes = routes
    .filter(route => route.sections && route.sections.length > 0)
    .map(route => {
      const segments = route.sections
        .map(section => {
          const from = stationMap[section.fromStation];
          const to = stationMap[section.toStation];
          if (!from || !to) return null;
          return {
            fromStation: section.fromStation,
            toStation: section.toStation,
            distance: section.distance,
            typicalSpeed: section.typicalSpeed,
            maxSpeed: section.maxSpeed,
            sectionType: section.sectionType,
            from: { lat: from.lat, lng: from.lng, name: from.name },
            to: { lat: to.lat, lng: to.lng, name: to.name },
          };
        })
        .filter(Boolean);

      if (segments.length === 0) return null;
      return { routeCode: route.routeCode, name: route.name, segments };
    })
    .filter(Boolean);

  return enrichedRoutes;
}

async function getCongestionData() {
  const activeEvents = await OperationalEvent.find({ isActive: true }).lean();
  const allLiveStates = tracker.getAllStates();
  const liveStateArray = Object.values(allLiveStates);

  const sectionTrainCount = {};
  liveStateArray.forEach(state => {
    if (state.isStale || state.latitude == null) return;
    const key = `${state.currentStation || 'unknown'}->${state.nextStation || 'unknown'}`;
    sectionTrainCount[key] = (sectionTrainCount[key] || 0) + 1;
  });

  const sections = [];
  activeEvents.forEach(event => {
    const from = event.affectedSection?.fromStation;
    const to = event.affectedSection?.toStation;
    if (!from || !to) return;

    let status = 'NORMAL';
    if (event.eventType === 'SpeedRestriction' || event.eventType === 'WeatherAlert') {
      status = 'CONGESTED';
    } else if (event.eventType === 'SignalFailure' || event.eventType === 'MaintenanceBlock') {
      status = 'SEVERE';
    }

    sections.push({
      fromStation: from,
      toStation: to,
      status,
      eventType: event.eventType,
      speedLimit: event.speedLimit,
      severity: event.severity,
    });
  });

  Object.entries(sectionTrainCount).forEach(([key, count]) => {
    if (count >= 3) {
      const [from, to] = key.split('->');
      const existing = sections.find(s => s.fromStation === from && s.toStation === to);
      if (!existing) {
        sections.push({
          fromStation: from,
          toStation: to,
          status: count >= 5 ? 'SEVERE' : 'CONGESTED',
          eventType: 'HighDensity',
          trainCount: count,
        });
      }
    }
  });

  return sections;
}

module.exports = {
  getStations,
  getActiveTrains,
  getRouteGeometry,
  getSectionCongestion,
  getOverview,
};
