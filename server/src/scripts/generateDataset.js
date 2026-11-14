require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const TrainRun = require('../models/TrainRun');
const Route = require('../models/Route');
const OperationalEvent = require('../models/OperationalEvent');
const { getISTHour, getISTDayOfWeek, isISTWeekend } = require('../utils/istTime');

const DATA_DIR = path.join(__dirname, '../../data/ml');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DATASET_VERSION = 'eta_dataset_v1';

async function generateDataset() {
    console.log(`Starting dataset generation: ${DATASET_VERSION}`);
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected.');

    const routes = await Route.find({});
    const routeMap = {};
    routes.forEach(r => routeMap[r._id.toString()] = r);

    const events = await OperationalEvent.find({});
    
    // We must sort train runs chronologically to prevent target leakage
    // Sort by runDate ascending
    const trainRuns = await TrainRun.find({}).sort({ runDate: 1 }).lean();

    console.log(`Loaded ${trainRuns.length} TrainRuns, ${routes.length} Routes, ${events.length} Events.`);

    const datasetRows = [];
    
    // For rolling historical averages
    // Map: 'fromStation-toStation' -> Array of past actual travel times and delays
    const historicalStats = {};

    let totalSectionLogs = 0;

    for (const run of trainRuns) {
        const route = routeMap[run.route.toString()];
        if (!route) continue;

        for (let s = 0; s < run.sectionLogs.length; s++) {
            totalSectionLogs++;
            const sectionLog = run.sectionLogs[s];
            const stationLog = run.stationLogs[s]; // Entry to this section
            const routeSection = route.sections[s];

            if (!stationLog || !routeSection) continue;

            const entryTime = new Date(stationLog.actualDeparture || stationLog.scheduledDeparture);
            
            // TARGET
            const target_delay_minutes = sectionLog.actualTravelTime - sectionLog.scheduledTravelTime;

            // Historical rolling stats (calculated BEFORE adding current observation)
            const sectionKey = `${sectionLog.fromStation}-${sectionLog.toStation}`;
            if (!historicalStats[sectionKey]) {
                historicalStats[sectionKey] = { travelTimes: [], delays: [] };
            }
            
            const pastTravelTimes = historicalStats[sectionKey].travelTimes;
            const pastDelays = historicalStats[sectionKey].delays;
            
            const historical_mean_travel_time = pastTravelTimes.length > 0 ? (pastTravelTimes.reduce((a, b) => a + b, 0) / pastTravelTimes.length).toFixed(2) : routeSection.distance / routeSection.typicalSpeed * 60;
            const historical_mean_delay = pastDelays.length > 0 ? (pastDelays.reduce((a, b) => a + b, 0) / pastDelays.length).toFixed(2) : 0;

            // Operational Events active at entryTime
            const activeEvents = events.filter(e => {
                if (!e.affectedSection) return false;
                const matchesSection = e.affectedSection.fromStation === sectionLog.fromStation && e.affectedSection.toStation === sectionLog.toStation;
                const startedBefore = new Date(e.startTime) <= entryTime;
                const activeAfter = !e.endTime || new Date(e.endTime) > entryTime;
                return matchesSection && startedBefore && activeAfter;
            });

            const eventActive = activeEvents.length > 0 ? 1 : 0;
            const eventType = activeEvents.length > 0 ? activeEvents[0].eventType : 'None';
            const eventSpeedLimit = activeEvents.length > 0 && activeEvents[0].speedLimit ? activeEvents[0].speedLimit : routeSection.maxSpeed;

            // Previous section features
            let prev_section_travel_time = 0;
            let prev_section_delay = 0;
            if (s > 0) {
                prev_section_travel_time = run.sectionLogs[s-1].actualTravelTime;
                prev_section_delay = run.sectionLogs[s-1].actualTravelTime - run.sectionLogs[s-1].scheduledTravelTime;
            }

            // Create row
            const row = {
                // Identifiers (usually dropped during training, but kept for traceability)
                train_number: run.trainNumber,
                run_date: run.runDate.toISOString(),
                from_station: sectionLog.fromStation,
                to_station: sectionLog.toStation,
                entry_time: entryTime.toISOString(),

                // Target
                target_delay_minutes: target_delay_minutes,

                // Train State
                accumulated_delay_entering: stationLog.departureDelay || 0,
                prev_section_travel_time: prev_section_travel_time,
                prev_section_delay: prev_section_delay,
                stations_travelled: s,
                stations_remaining: route.sections.length - s - 1,

                // Infrastructure
                section_distance: routeSection.distance,
                typical_speed: routeSection.typicalSpeed,
                max_speed: routeSection.maxSpeed,
                section_type: routeSection.sectionType,
                signal_count: routeSection.signalCount,
                level_crossings: routeSection.levelCrossings,
                gradient_profile: routeSection.gradientProfile,

                // Temporal (IST)
                hour: getISTHour(entryTime),
                day_of_week: getISTDayOfWeek(entryTime),
                is_weekend: isISTWeekend(entryTime),

                // Operational Event
                event_active: eventActive,
                event_type: eventType,
                event_speed_limit: eventSpeedLimit,

                // Historical Baseline Features
                historical_mean_travel_time: Number(historical_mean_travel_time),
                historical_mean_delay: Number(historical_mean_delay)
            };

            // Validation Check - no negative distances, speeds, etc.
            if (row.section_distance <= 0) console.warn(`Invalid distance for ${sectionKey}`);
            if (row.target_delay_minutes < -600 || row.target_delay_minutes > 1440) console.warn(`Extreme outlier delay for ${sectionKey}: ${row.target_delay_minutes}`);

            datasetRows.push(row);

            // Add current observation to historical stats for FUTURE rows
            historicalStats[sectionKey].travelTimes.push(sectionLog.actualTravelTime);
            historicalStats[sectionKey].delays.push(target_delay_minutes);
        }
    }

    // Sort globally by entry_time for perfect chronological split
    datasetRows.sort((a, b) => new Date(a.entry_time) - new Date(b.entry_time));

    const totalRows = datasetRows.length;
    console.log(`Generated ${totalRows} rows.`);

    // 70 / 15 / 15 Split
    const trainIndex = Math.floor(totalRows * 0.70);
    const valIndex = Math.floor(totalRows * 0.85);

    datasetRows.forEach((row, idx) => {
        if (idx < trainIndex) row.split = 'train';
        else if (idx < valIndex) row.split = 'validation';
        else row.split = 'test';
    });

    const trainCount = trainIndex;
    const valCount = valIndex - trainIndex;
    const testCount = totalRows - valIndex;

    const getRange = (split) => {
        const rows = datasetRows.filter(r => r.split === split);
        if (rows.length === 0) return { start: null, end: null };
        return { start: rows[0].entry_time, end: rows[rows.length - 1].entry_time };
    };

    const trainRange = getRange('train');
    const valRange = getRange('validation');
    const testRange = getRange('test');

    // Export CSV
    if (totalRows > 0) {
        const headers = Object.keys(datasetRows[0]);
        const csvContent = [
            headers.join(','),
            ...datasetRows.map(row => headers.map(h => {
                let val = row[h];
                if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
                return val;
            }).join(','))
        ].join('\n');

        fs.writeFileSync(path.join(DATA_DIR, `${DATASET_VERSION}.csv`), csvContent);
    }

    // Export Metadata
    const metadata = {
        dataset_version: DATASET_VERSION,
        generation_timestamp: new Date().toISOString(),
        source_train_runs: trainRuns.length,
        source_section_logs: totalSectionLogs,
        feature_count: datasetRows.length > 0 ? Object.keys(datasetRows[0]).length - 2 : 0, // excluding target and split
        target_definition: "target_delay_minutes = actualTravelTime - scheduledTravelTime",
        baseline_strategy: "Use 'historical_mean_delay' feature as naive baseline predictor",
        synthetic_data_disclaimer: "The prototype is trained and validated on structurally realistic synthetic railway telemetry and historical simulation data, designed to be replaceable with authorized operational railway feeds.",
        split_details: {
            train: { count: trainCount, date_range: trainRange },
            validation: { count: valCount, date_range: valRange },
            test: { count: testCount, date_range: testRange }
        },
        feature_schema: [
            { name: "train_number", type: "string", source: "TrainRun", meaning: "Train ID", available_at_prediction: true, categorical: true },
            { name: "from_station", type: "string", source: "SectionLog", meaning: "Start station of section", available_at_prediction: true, categorical: true },
            { name: "to_station", type: "string", source: "SectionLog", meaning: "End station of section", available_at_prediction: true, categorical: true },
            { name: "entry_time", type: "datetime", source: "StationLog", meaning: "Time train entered the section", available_at_prediction: true, categorical: false },
            { name: "target_delay_minutes", type: "numeric", source: "Derived", meaning: "Actual minus Scheduled travel time for section", available_at_prediction: false, categorical: false },
            { name: "accumulated_delay_entering", type: "numeric", source: "StationLog", meaning: "Delay entering section", available_at_prediction: true, categorical: false },
            { name: "prev_section_travel_time", type: "numeric", source: "Derived", meaning: "Actual travel time of previous section", available_at_prediction: true, categorical: false },
            { name: "prev_section_delay", type: "numeric", source: "Derived", meaning: "Delay accumulated in previous section", available_at_prediction: true, categorical: false },
            { name: "stations_travelled", type: "numeric", source: "Derived", meaning: "Number of stations travelled so far", available_at_prediction: true, categorical: false },
            { name: "stations_remaining", type: "numeric", source: "Derived", meaning: "Number of stations remaining", available_at_prediction: true, categorical: false },
            { name: "section_distance", type: "numeric", source: "Route", meaning: "Distance in km", available_at_prediction: true, categorical: false },
            { name: "typical_speed", type: "numeric", source: "Route", meaning: "Typical speed limit km/h", available_at_prediction: true, categorical: false },
            { name: "max_speed", type: "numeric", source: "Route", meaning: "Maximum speed limit km/h", available_at_prediction: true, categorical: false },
            { name: "section_type", type: "string", source: "Route", meaning: "SingleLine/DoubleLine etc.", available_at_prediction: true, categorical: true },
            { name: "signal_count", type: "numeric", source: "Route", meaning: "Number of signals", available_at_prediction: true, categorical: false },
            { name: "level_crossings", type: "numeric", source: "Route", meaning: "Number of level crossings", available_at_prediction: true, categorical: false },
            { name: "gradient_profile", type: "string", source: "Route", meaning: "Flat/Mild/Steep", available_at_prediction: true, categorical: true },
            { name: "hour", type: "numeric", source: "Derived", meaning: "Hour of day (0-23)", available_at_prediction: true, categorical: true },
            { name: "day_of_week", type: "numeric", source: "Derived", meaning: "Day of week (0-6)", available_at_prediction: true, categorical: true },
            { name: "is_weekend", type: "numeric", source: "Derived", meaning: "Weekend flag (1/0)", available_at_prediction: true, categorical: true },
            { name: "event_active", type: "numeric", source: "OperationalEvent", meaning: "Active event flag (1/0)", available_at_prediction: true, categorical: true },
            { name: "event_type", type: "string", source: "OperationalEvent", meaning: "Type of active event", available_at_prediction: true, categorical: true },
            { name: "event_speed_limit", type: "numeric", source: "OperationalEvent", meaning: "Speed limit from event", available_at_prediction: true, categorical: false },
            { name: "historical_mean_travel_time", type: "numeric", source: "Derived", meaning: "Rolling average of past travel times", available_at_prediction: true, categorical: false },
            { name: "historical_mean_delay", type: "numeric", source: "Derived", meaning: "Rolling average of past section delays", available_at_prediction: true, categorical: false },
            { name: "split", type: "string", source: "Derived", meaning: "train/validation/test", available_at_prediction: true, categorical: true }
        ]
    };

    fs.writeFileSync(path.join(DATA_DIR, `${DATASET_VERSION}_metadata.json`), JSON.stringify(metadata, null, 2));

    console.log(`Exported dataset to ${DATA_DIR}/${DATASET_VERSION}.csv`);
    
    // Leakage Check
    let leakageFound = false;
    datasetRows.forEach(row => {
        if (row.entry_time > new Date().toISOString() && row.target_delay_minutes) {
            console.warn("Possible Leakage: Target calculated for future uncompleted run.");
            leakageFound = true;
        }
    });
    if (!leakageFound) console.log("Leakage check passed.");

    // Missing Values Check
    let missingFound = false;
    datasetRows.forEach(row => {
        Object.keys(row).forEach(k => {
            if (row[k] === undefined || row[k] === null || Number.isNaN(row[k])) {
                console.warn(`Missing value found in row for ${k}`);
                missingFound = true;
            }
        });
    });
    if (!missingFound) console.log("Missing-value check passed.");

    await mongoose.disconnect();
}

if (require.main === module) {
    generateDataset().catch(console.error);
}
