const Train = require('../models/Train');
const Route = require('../models/Route');
const Station = require('../models/Station');
const TrainRun = require('../models/TrainRun');
const OperationalEvent = require('../models/OperationalEvent');
const { tracker, sourceManager, liveProviderPolling, DATA_SOURCES } = require('../live');

let io = null;
let simulationClock = Date.now();
let lastRealTime = Date.now();
let activeSimulation = null;
let cachedStations = {};

const SIM_TICK_MS = 2000; // Update every 2 seconds real-time

// Fetch all stations into memory for fast coordinate lookup
const loadStations = async () => {
    const stations = await Station.find({});
    stations.forEach(st => {
        cachedStations[st.code] = { lat: st.latitude, lng: st.longitude };
    });
};

const interpolate = (start, end, progress) => {
    if (!start || !end || start.lat == null || end.lat == null) {
        return { lat: 0, lng: 0 };
    }
    return {
        lat: start.lat + (end.lat - start.lat) * progress,
        lng: start.lng + (end.lng - start.lng) * progress
    };
};

const calculateHeading = (start, end) => {
    if (!start || !end || start.lat == null) return 0;
    const dy = end.lat - start.lat;
    const dx = Math.cos(Math.PI / 180 * start.lat) * (end.lng - start.lng);
    const angle = Math.atan2(dy, dx);
    return ((angle * 180 / Math.PI) + 360) % 360;
};

const updateTrains = async () => {
    const SIMULATION_SPEED = Number(process.env.SIMULATION_SPEED) || 1;
    const now = Date.now();
    const elapsedRealMs = now - lastRealTime;
    lastRealTime = now;
    
    // Advance simulation clock
    const elapsedSimMs = elapsedRealMs * SIMULATION_SPEED;
    simulationClock += elapsedSimMs;
    const elapsedSimHours = elapsedSimMs / (1000 * 60 * 60);

    // Get active operational events
    const activeEvents = await OperationalEvent.find({ isActive: true });

    // Fetch trains that have a route
    const trains = await Train.find({ route: { $exists: true } }).populate('route');
    
    for (const train of trains) {
        if (!train.route) continue;

        // Skip simulator update if RailRadar is actively and healthily providing live telemetry for this train
        if (liveProviderPolling && typeof liveProviderPolling.isTrainActive === 'function' && liveProviderPolling.isTrainActive(train.trainNumber)) {
            continue;
        }

        let state = train.currentState || {};
        if (!state.isRunning) {
            // Initialize train at start of route
            state = {
                lastKnownStation: train.route.stations[0].station,
                nextStation: train.route.stations[1] ? train.route.stations[1].station : null,
                latitude: cachedStations[train.route.stations[0].station]?.lat || 0,
                longitude: cachedStations[train.route.stations[0].station]?.lng || 0,
                speed: 0,
                heading: 0,
                lastUpdated: new Date(simulationClock),
                sectionIndex: 0,
                progressInSection: 0, // distance travelled in current section (km)
                isRunning: true
            };
        }

        // If train reached destination
        if (state.sectionIndex >= train.route.sections.length) {
            state.isRunning = false;
            state.speed = 0;
            train.currentState = state;
            await train.save();
            continue;
        }

        const currentSection = train.route.sections[state.sectionIndex];
        const nextStationInfo = train.route.stations[state.sectionIndex + 1];

        // 1. Determine Target Speed
        let targetSpeed = currentSection.typicalSpeed;

        // Apply Operational Events affecting this section
        const sectionEvents = activeEvents.filter(e => 
            e.affectedSection?.fromStation === currentSection.fromStation &&
            e.affectedSection?.toStation === currentSection.toStation
        );
        for (const event of sectionEvents) {
            if (event.eventType === 'SpeedRestriction' && event.speedLimit) {
                targetSpeed = Math.min(targetSpeed, event.speedLimit);
            } else if (event.eventType === 'SignalFailure' || event.eventType === 'MaintenanceBlock') {
                targetSpeed = 0; // Stopped
            } else if (event.eventType === 'WeatherAlert' || event.eventType === 'Fog') {
                targetSpeed = Math.min(targetSpeed, currentSection.typicalSpeed * 0.6); // 40% speed reduction
            }
        }

        // Basic Congestion / Preceding Train Effect (Mock logic: if multiple trains in same section, reduce speed)
        const trainsInSection = trains.filter(t => 
            t._id.toString() !== train._id.toString() && 
            t.currentState?.sectionIndex === state.sectionIndex &&
            t.currentState?.isRunning
        );
        if (trainsInSection.length > 0) {
            // Congestion!
            targetSpeed = Math.min(targetSpeed, currentSection.typicalSpeed * 0.7);
        }

        // Acceleration/Deceleration Model
        // Accelerate by max 15 km/h per simulated minute, decelerate by max 30 km/h per minute
        const speedDelta = targetSpeed - state.speed;
        const elapsedSimMinutes = elapsedSimHours * 60;
        
        if (speedDelta > 0) {
            state.speed += Math.min(15 * elapsedSimMinutes, speedDelta);
        } else if (speedDelta < 0) {
            state.speed -= Math.min(30 * elapsedSimMinutes, -speedDelta);
        }

        // 2. Advance Position
        const distanceTravelled = state.speed * elapsedSimHours; // km
        state.progressInSection += distanceTravelled;

        // Handle section completion
        if (state.progressInSection >= currentSection.distance) {
            // Arrived at next station
            state.lastKnownStation = currentSection.toStation;
            
            // Station Dwell Simulation
            // We can simulate this by keeping progressInSection > distance but we need to wait for haltDuration
            const haltDurationKmEq = (nextStationInfo.haltDuration || 2) * (targetSpeed / 60); // approx km eq
            
            if (state.progressInSection >= currentSection.distance + haltDurationKmEq) {
                // Departed station, move to next section
                state.sectionIndex += 1;
                state.progressInSection = 0;
                
                if (state.sectionIndex < train.route.sections.length) {
                    state.nextStation = train.route.sections[state.sectionIndex].toStation;
                } else {
                    state.nextStation = null;
                }
            } else {
                state.speed = 0; // Stopped at station
            }
        }

        // 3. Update Coordinates
        if (state.isRunning && state.sectionIndex < train.route.sections.length) {
            const activeSection = train.route.sections[state.sectionIndex];
            const startCoord = cachedStations[activeSection.fromStation];
            const endCoord = cachedStations[activeSection.toStation];
            
            const progressRatio = Math.min(state.progressInSection / activeSection.distance, 1.0);
            const coords = interpolate(startCoord, endCoord, progressRatio);
            
            state.latitude = coords.lat;
            state.longitude = coords.lng;
            state.heading = calculateHeading(startCoord, endCoord);
        }

        // 4. Update Delay Estimation (Simple Delay Propagation)
        // If speed < typical, delay increases
        if (state.speed < currentSection.typicalSpeed && state.speed > 0) {
            const timeLostHours = (distanceTravelled / state.speed) - (distanceTravelled / currentSection.typicalSpeed);
            if (timeLostHours > 0) {
                train.delayMinutes = (train.delayMinutes || 0) + (timeLostHours * 60);
            }
        } else if (state.speed > currentSection.typicalSpeed) {
            // Recovery
            const timeGainedHours = (distanceTravelled / currentSection.typicalSpeed) - (distanceTravelled / state.speed);
            if (timeGainedHours > 0 && train.delayMinutes > 0) {
                train.delayMinutes = Math.max(0, train.delayMinutes - (timeGainedHours * 60));
            }
        }

        state.lastUpdated = new Date(simulationClock);
        train.currentState = state;
        
        // Save to DB periodically or immediately
        await train.save();

        // Compute journey progress from route geometry so clients never diverge
        const totalDistance = (train.route.sections || []).reduce(
            (acc, s) => acc + (Number(s.distance) || 0), 0
        ) || train.route.totalDistance || 0;
        let completedDistance = 0;
        for (let i = 0; i < state.sectionIndex && i < train.route.sections.length; i++) {
            completedDistance += Number(train.route.sections[i].distance) || 0;
        }
        if (currentSection) {
            completedDistance += Math.min(
                Number(currentSection.distance) || 0,
                Math.max(0, state.progressInSection)
            );
        }
        const journeyProgress = totalDistance > 0
            ? Math.min(100, Math.max(0, Math.round((completedDistance / totalDistance) * 100)))
            : null;

        // Emit telemetry through the Phase 5A data ingestion core
        // This normalizes, validates, stores, and broadcasts via Socket.io
        sourceManager.processTelemetry({
            trainId:           train._id.toString(),
            trainNumber:       train.trainNumber,
            timestamp:         state.lastUpdated,
            latitude:          state.latitude,
            longitude:         state.longitude,
            speed:             Math.round(state.speed),
            heading:           Math.round(state.heading),
            currentStation:    state.lastKnownStation,
            nextStation:       state.nextStation,
            sectionIndex:      state.sectionIndex,
            progressInSection: state.progressInSection,
            sectionDistance:    currentSection ? currentSection.distance : 0,
            progress:          journeyProgress,
            accumulatedDelay:  Math.round(train.delayMinutes || 0),
            status:            train.delayMinutes > 15 ? 'Delayed' : 'OnTime',
        }, DATA_SOURCES.SIMULATOR);
    }
};

const setIo = (ioInstance) => {
    io = ioInstance;
};

const startSimulation = async () => {
    await loadStations();
    lastRealTime = Date.now();
    simulationClock = Date.now();
    activeSimulation = setInterval(() => {
        updateTrains().catch(err => console.error('Simulation loop error:', err));
    }, SIM_TICK_MS);
    console.log(`✅ Phase 2 Railway Telemetry Simulator Started (Tick: ${SIM_TICK_MS}ms)`);
};

const stopSimulation = () => {
    if (activeSimulation) {
        clearInterval(activeSimulation);
        activeSimulation = null;
        console.log('🛑 Simulator Stopped');
    }
};

module.exports = {
    startSimulation,
    stopSimulation,
    setIo
};
