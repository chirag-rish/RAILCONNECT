const Train = require('../models/Train');
const Station = require('../models/Station');
const { getISTJsDayOfWeek, parseISTDate } = require('../utils/istTime');
const { tracker, liveProviderPolling } = require('../live');

const enrichTrainWithLiveState = (train) => {
    if (liveProviderPolling && typeof liveProviderPolling.addTrain === 'function') {
        liveProviderPolling.addTrain(train.trainNumber).catch(() => {});
    }

    let liveState = tracker.getState(train._id.toString());
    
    // Auto-initialize live state on-the-fly if missing so no train ever shows "Unavailable"
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

    const hasLive = liveState && !liveState.isStale;

    let sourceVal = 'STATIC_REFERENCE';
    let statusVal = 'Live Status Unavailable';
    let delayVal = 0;
    let currentStation = null;
    let nextStation = null;
    let lastLiveUpdate = null;
    let positionSource = null;
    let isStale = true;
    let freshness = 'UNAVAILABLE';
    let liveStatusAvailable = false;

    if (hasLive) {
        liveStatusAvailable = true;
        isStale = false;
        freshness = 'FRESH';
        sourceVal = liveState.source === 'SIMULATOR' ? 'SIMULATOR_FALLBACK' : 'LIVE_PROVIDER';
        statusVal = liveState.status || (liveState.accumulatedDelay > 0 ? 'Delayed' : 'OnTime');
        delayVal = liveState.accumulatedDelay ?? 0;
        currentStation = liveState.currentStation || train.source;
        nextStation = liveState.nextStation || train.destination;
        lastLiveUpdate = liveState.timestamp || liveState.receivedAt || new Date();
        positionSource = liveState.positionSource || 'UNKNOWN';
    } else if (liveState && liveState.isStale) {
        liveStatusAvailable = false;
        isStale = true;
        freshness = 'STALE';
        sourceVal = 'LIVE_UNAVAILABLE';
        statusVal = 'Live Status Unavailable (Stale)';
        delayVal = 0;
        currentStation = null;
        nextStation = null;
        lastLiveUpdate = liveState.timestamp || liveState.receivedAt;
        positionSource = liveState.positionSource || 'UNKNOWN';
    }

    return {
        ...train,
        dbStatus: train.status,
        status: statusVal,
        delayMinutes: delayVal,
        currentStatus: statusVal,
        currentDelay: delayVal,
        currentStation,
        nextStation,
        lastLiveUpdateTimestamp: lastLiveUpdate,
        liveFallbackSource: sourceVal,
        freshness,
        isStale,
        positionSource,
        liveStatusAvailable,
    };
};

// @desc    Add a new train
// @route   POST /api/trains
// @access  Private/Admin
const addTrain = async (req, res) => {
    try {
        const { trainNumber, name, type, source, destination, daysOfOperation, departureTime, arrivalTime, distance, coaches, classes, baseFare, status } = req.body;

        // Validation
        if (!trainNumber || !name || !type || !source || !destination || !baseFare) {
            return res.status(400).json({ message: 'Please provide all required fields' });
        }

        if (baseFare < 0) {
            return res.status(400).json({ message: 'Base fare cannot be negative' });
        }

        if (distance < 0) {
            return res.status(400).json({ message: 'Distance cannot be negative' });
        }

        const trainExists = await Train.findOne({ trainNumber });
        if (trainExists) {
            return res.status(400).json({ message: 'Train with this number already exists' });
        }

        // Build coach composition from either `coaches` (detailed) or `classes` (simpler)
        const coachComposition = coaches && coaches.length > 0
            ? coaches
            : Array.isArray(classes)
                ? classes.map(classType => ({ classType, totalSeats: 72, seatsPerCoach: 72 }))
                : [];

        const train = await Train.create({
            trainNumber,
            name,
            type,
            source: source.toUpperCase(),
            destination: destination.toUpperCase(),
            daysOfOperation,
            departureTime,
            arrivalTime,
            distance,
            coachComposition,
            baseFare,
            status: status || 'Active'
        });

        res.status(201).json(train);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Search trains
// @route   GET /api/trains/search
// @access  Public
const searchTrains = async (req, res) => {
    try {
        const { source, destination, date } = req.query;

        // Validation
        if (!source || !destination || !date) {
            return res.status(400).json({ message: 'Please provide source, destination and date' });
        }

        // Validate date format (IST-safe parsing)
        const searchDate = parseISTDate(date);
        if (isNaN(searchDate.getTime())) {
            return res.status(400).json({ message: 'Invalid date format' });
        }

        // Get day of week from date in IST
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayName = days[getISTJsDayOfWeek(searchDate)];

        // Find trains running between source and destination on this day
        // We explicitly select the new fields 'status' and 'delayMinutes'
        let trains = await Train.find({
            source: source.toUpperCase(),
            destination: destination.toUpperCase(),
            daysOfOperation: { $in: [dayName] }
        })
            .select('trainNumber name source destination departureTime arrivalTime daysOfOperation coachComposition baseFare status delayMinutes type distance')
            .lean(); // Use lean for performance

        // Add classes array for frontend compatibility and enrich with live state
        trains = trains.map(train => {
            const classes = Array.isArray(train.coachComposition)
                ? train.coachComposition.map(c => c.classType)
                : [];
            const enriched = enrichTrainWithLiveState(train);
            return {
                ...enriched,
                classes
            };
        });

        // Return empty array instead of 404 - frontend will show "No trains found" message
        res.json(trains);
    } catch (error) {
        console.error("Search Error:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all trains
// @route   GET /api/trains
// @access  Public
const getTrains = async (req, res) => {
    try {
        const trains = await Train.find({}).lean();
        const results = trains.map(t => {
            const liveState = tracker.getState(t._id.toString());
            return {
                ...t,
                dbStatus: t.status,
                liveStatus: liveState?.status || 'OnTime',
                delayMinutes: liveState?.accumulatedDelay || t.delayMinutes || 0
            };
        });
        res.json(results);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update train
// @route   PUT /api/trains/:id
// @access  Private/Admin
const updateTrain = async (req, res) => {
    try {
        const train = await Train.findById(req.params.id);

        if (train) {
            train.trainNumber = req.body.trainNumber || train.trainNumber;
            train.name = req.body.name || train.name;
            train.type = req.body.type || train.type;
            train.source = req.body.source ? req.body.source.toUpperCase() : train.source;
            train.destination = req.body.destination ? req.body.destination.toUpperCase() : train.destination;
            train.daysOfOperation = req.body.daysOfOperation || train.daysOfOperation;
            train.departureTime = req.body.departureTime || train.departureTime;
            train.arrivalTime = req.body.arrivalTime || train.arrivalTime;
            train.distance = req.body.distance || train.distance;
            train.baseFare = req.body.baseFare || train.baseFare;
            train.status = req.body.status || train.status;

            const updatedTrain = await train.save();
            res.json(updatedTrain);
        } else {
            res.status(404).json({ message: 'Train not found' });
        }
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Delete train
// @route   DELETE /api/trains/:id
// @access  Private/Admin
const deleteTrain = async (req, res) => {
    try {
        const train = await Train.findById(req.params.id);

        if (train) {
            await train.deleteOne();
            res.json({ message: 'Train removed' });
        } else {
            res.status(404).json({ message: 'Train not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { addTrain, searchTrains, getTrains, updateTrain, deleteTrain };
