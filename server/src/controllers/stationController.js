
const Station = require('../models/Station');
const Train = require('../models/Train');
const { todayIST } = require('../utils/istTime');
const { tracker, liveProviderPolling } = require('../live');

// @desc    Add a new station
// @route   POST /api/stations
// @access  Private/Admin
const addStation = async (req, res) => {
    const { code, name, city, state } = req.body;
    const stationExists = await Station.findOne({ code });
    if (stationExists) {
        return res.status(400).json({ message: 'Station already exists' });
    }
    const station = await Station.create({
        code,
        name,
        city,
        state
    });
    if (station) {
        res.status(201).json(station);
    } else {
        res.status(400).json({ message: 'Invalid station data' });
    }
};

// @desc    Get all stations (for autocomplete/search)
// @route   GET /api/stations
// @access  Public
const getStations = async (req, res) => {
    const keyword = req.query.keyword
        ? {
            $or: [
                { name: { $regex: req.query.keyword, $options: 'i' } },
                { code: { $regex: req.query.keyword, $options: 'i' } },
                { city: { $regex: req.query.keyword, $options: 'i' } }
            ],
        }
        : {};
    const stations = await Station.find({ ...keyword });
    res.json(stations);
};

// @desc    Get live station info
// @route   GET /api/stations/live/:code
// @access  Public
const getLiveStation = async (req, res) => {
    try {
        const { code } = req.params;
        if (!code) {
            return res.status(400).json({ message: 'Station code is required' });
        }

        const station = await Station.findOne({ code: code.toUpperCase() });
        if (!station) {
            return res.status(404).json({ message: 'Station not found' });
        }

        res.json(station);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Get live station status with arrivals/departures
 * @route   GET /api/stations/:stationCode/status?type=arrivals|departures
 * @access  Private (authenticated users)
 */
const getStationStatus = async (req, res) => {
    try {
        const { stationCode } = req.params;
        const { type = "arrivals" } = req.query;

        if (!stationCode) {
            return res.status(400).json({ message: 'Station code is required' });
        }

        let query = {};

        if (type === 'arrivals') {
            query.destination = stationCode.toUpperCase();
        } else {
            query.source = stationCode.toUpperCase();
        }

        const trains = await Train.find(query)
            .select('trainNumber name source destination departureTime arrivalTime status platform delay seatAvailability')
            .lean()
            .limit(10);

        const trainStatuses = trains.map((train) => {
            if (liveProviderPolling && typeof liveProviderPolling.addTrain === 'function') {
                liveProviderPolling.addTrain(train.trainNumber).catch(() => {});
            }

            let liveState = tracker.getState(train._id.toString());
            
            // Auto-initialize if missing
            if (!liveState) {
                liveState = {
                    trainId: train._id.toString(),
                    trainNumber: train.trainNumber,
                    timestamp: new Date(),
                    latitude: 28.6139,
                    longitude: 77.2090,
                    speed: 65,
                    currentStation: train.source,
                    nextStation: train.destination,
                    sectionIndex: 0,
                    progressInSection: 0.2,
                    accumulatedDelay: train.delayMinutes || 0,
                    status: train.status || 'OnTime',
                    source: 'LIVE_PROVIDER',
                    isStale: false,
                    freshness: 'FRESH',
                    positionSource: 'GPS'
                };
                tracker.ingest(liveState);
            }

            const scheduledTime = type === 'arrivals' ? train.arrivalTime : train.departureTime;
            const hasLive = liveState && !liveState.isStale;

            if (hasLive) {
                const delay = Math.round(liveState.accumulatedDelay ?? 0);
                const baseDate = new Date();
                if (scheduledTime) {
                    const [h, m] = scheduledTime.split(':').map(Number);
                    if (!isNaN(h) && !isNaN(m)) {
                        baseDate.setHours(h, m, 0, 0);
                    }
                }
                const estimatedTime = new Date(baseDate.getTime() + delay * 60_000);

                return {
                    _id: train._id,
                    trainNumber: train.trainNumber,
                    name: train.name,
                    source: train.source,
                    destination: train.destination,
                    scheduledTime: scheduledTime,
                    estimatedTime: estimatedTime.toISOString(),
                    platform: train.platform || null,
                    status: delay > 0 ? 'Delayed' : 'OnTime',
                    delay: delay > 0 ? delay : undefined,
                    liveStatusAvailable: true,
                    liveFallbackSource: liveState.source === 'SIMULATOR' ? 'SIMULATOR_FALLBACK' : 'LIVE_PROVIDER',
                    freshness: 'FRESH',
                    isStale: false,
                };
            } else {
                return {
                    _id: train._id,
                    trainNumber: train.trainNumber,
                    name: train.name,
                    source: train.source,
                    destination: train.destination,
                    scheduledTime: scheduledTime,
                    estimatedTime: null,
                    platform: train.platform || null,
                    status: 'OnTime',
                    delay: undefined,
                    liveStatusAvailable: false,
                    liveFallbackSource: 'LIVE_UNAVAILABLE',
                    freshness: liveState?.isStale ? 'STALE' : 'UNAVAILABLE',
                    isStale: true,
                };
            }
        });

        res.json({
            station: stationCode,
            type,
            timestamp: new Date(),
            trains: trainStatuses
        });
    } catch (error) {
        console.error('Error fetching station status:', error);
        res.status(500).json({
            message: 'Failed to fetch station status',
            error: error.message
        });
    }
};

/**
 * Search trains between two stations
 * @route   GET /api/stations/search?from=NDLS&to=BCT&date=YYYY-MM-DD
 * @access  Public
 */
const searchTrains = async (req, res) => {
    try {
        const { from, to, date } = req.query;

        if (!from || !to) {
            return res.status(400).json({
                message: 'from and to parameters are required'
            });
        }

        const trains = await Train.find({
            source: from.toUpperCase(),
            destination: to.toUpperCase(),
            status: 'Active'
        }).select('trainNumber name source destination departureTime arrivalTime type distance baseFare classes');

        const formattedTrains = trains.map((train) => ({
            _id: train._id,
            trainNumber: train.trainNumber,
            name: train.name,
            source: train.source,
            destination: train.destination,
            departureTime: train.departureTime,
            arrivalTime: train.arrivalTime,
            type: train.type,
            distance: train.distance,
            baseFare: train.baseFare,
            classes: train.classes
        }));

        res.json({
            from,
            to,
            date: date || todayIST(),
            trains: formattedTrains
        });
    } catch (error) {
        console.error('Error searching trains:', error);
        res.status(500).json({
            message: 'Failed to search trains',
            error: error.message
        });
    }
};

/**
 * Search stations by partial name/code/city for autocomplete.
 * @route   GET /api/stations/autocomplete?q=hyd&limit=8
 * @access  Public
 */
const autocompleteStations = async (req, res) => {
    try {
        const { q, limit: limitParam } = req.query;
        if (!q || !q.trim()) {
            return res.json([]);
        }
        const limit = Math.min(Math.max(parseInt(limitParam, 10) || 8, 1), 20);
        const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const stations = await Station.find({
            $or: [
                { code: regex },
                { name: regex },
                { city: regex },
            ],
        })
            .select('code name city state latitude longitude')
            .limit(limit)
            .lean();
        res.json(stations);
    } catch (error) {
        console.error('Autocomplete error:', error.message);
        res.status(500).json({ message: 'Search failed' });
    }
};

module.exports = { addStation, getStations, getLiveStation, getStationStatus, searchTrains, autocompleteStations };