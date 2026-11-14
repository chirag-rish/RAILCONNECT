/**
 * Seed Script: Historical Train Runs (Small Dev Dataset)
 * 
 * Generates ~30 days of synthetic historical train runs for ML training.
 * Creates realistic delay patterns (cascading delays, section-specific noise).
 * 
 * Usage: node src/scripts/seedHistoricalRuns.js
 */

const mongoose = require('mongoose');
require('dotenv').config();
const Route = require('../models/Route');
const Train = require('../models/Train');
const TrainRun = require('../models/TrainRun');

const DELAY_CAUSES = [
    'SignalHalt', 'Congestion', 'PrecedingTrainDelay', 'SpeedRestriction',
    'MaintenanceBlock', 'LevelCrossing', 'WeatherSlow', 'LocoFailure'
];

const generateTrainRuns = async (days = 30) => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected for historical run seeding');

        const routes = await Route.find();
        if (routes.length === 0) {
            console.log('No routes found. Run seedRoutes.js first.');
            process.exit(1);
        }

        let runsCreated = 0;
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        for (const route of routes) {
            // Find or create a train for this route
            const trainNumMatch = route.routeCode.match(/-(\d+)$/);
            const trainNumber = trainNumMatch ? trainNumMatch[1] : '99999';
            
            let train = await Train.findOne({ trainNumber });
            if (!train) {
                const src = route.stations[0].station;
                const dest = route.stations[route.stations.length - 1].station;
                train = await Train.create({
                    trainNumber,
                    name: route.name.split(' Route')[0],
                    type: 'Express',
                    source: src,
                    destination: dest,
                    departureTime: route.stations[0].scheduledDeparture,
                    arrivalTime: route.stations[route.stations.length - 1].scheduledArrival,
                    distance: route.totalDistance,
                    route: route._id,
                    baseFare: 500,
                    coachComposition: [
                        { classType: 'SL', totalSeats: 720 },
                        { classType: '3A', totalSeats: 256 },
                        { classType: '2A', totalSeats: 96 }
                    ]
                });
            } else {
                train.route = route._id;
                await train.save();
            }

            // Generate runs for the last 'days' days
            for (let i = 0; i < days; i++) {
                const runDate = new Date(now);
                runDate.setDate(runDate.getDate() - i);
                
                // Parse departure time to set initial timestamp
                const [depH, depM] = route.stations[0].scheduledDeparture.split(':').map(Number);
                const baseTime = new Date(runDate);
                baseTime.setHours(depH, depM, 0, 0);

                const stationLogs = [];
                const sectionLogs = [];
                let accumulatedDelay = 0; // minutes
                let currentTime = new Date(baseTime);

                // Initial station
                stationLogs.push({
                    station: route.stations[0].station,
                    sequenceNumber: 1,
                    scheduledArrival: null,
                    actualArrival: null,
                    scheduledDeparture: new Date(baseTime),
                    actualDeparture: new Date(baseTime),
                    arrivalDelay: 0,
                    departureDelay: 0,
                    skipped: false
                });

                for (let s = 0; s < route.sections.length; s++) {
                    const section = route.sections[s];
                    const nextStation = route.stations[s + 1];

                    // Base travel time calculation
                    const scheduledTravelTimeMin = Math.round((section.distance / section.typicalSpeed) * 60);
                    
                    // Simulate realistic delays
                    let sectionDelay = 0;
                    const delays = [];
                    
                    // Random minor noise (-2 to +5 mins)
                    const noise = Math.floor(Math.random() * 8) - 2;
                    sectionDelay += noise;

                    // 15% chance of a specific delay event
                    if (Math.random() < 0.15) {
                        const cause = DELAY_CAUSES[Math.floor(Math.random() * DELAY_CAUSES.length)];
                        const duration = Math.floor(Math.random() * 20) + 5; // 5 to 25 mins
                        sectionDelay += duration;
                        delays.push({ cause, duration, description: `Simulated ${cause}` });
                    }

                    // Recovery: if running late, try to make up time (up to 10% of travel time)
                    if (accumulatedDelay > 10 && sectionDelay <= 0) {
                        const recovery = Math.min(accumulatedDelay, Math.floor(scheduledTravelTimeMin * 0.1));
                        sectionDelay -= recovery;
                    }

                    const actualTravelTimeMin = scheduledTravelTimeMin + sectionDelay;
                    accumulatedDelay += sectionDelay;

                    // Calculate arrival at next station
                    const scheduledArrTime = new Date(baseTime.getTime() + (scheduledTravelTimeMin * 60000));
                    const actualArrTime = new Date(currentTime.getTime() + (actualTravelTimeMin * 60000));

                    sectionLogs.push({
                        fromStation: section.fromStation,
                        toStation: section.toStation,
                        sectionIndex: s,
                        scheduledTravelTime: scheduledTravelTimeMin,
                        actualTravelTime: actualTravelTimeMin,
                        avgSpeed: (section.distance / (actualTravelTimeMin / 60)).toFixed(1),
                        maxSpeed: section.maxSpeed,
                        delays
                    });

                    // Next station departure (add halt)
                    const halt = nextStation.haltDuration;
                    const scheduledDepTime = nextStation.scheduledDeparture ? new Date(scheduledArrTime.getTime() + halt * 60000) : null;
                    const actualDepTime = nextStation.scheduledDeparture ? new Date(actualArrTime.getTime() + halt * 60000) : null;

                    stationLogs.push({
                        station: nextStation.station,
                        sequenceNumber: nextStation.sequenceNumber,
                        scheduledArrival: scheduledArrTime,
                        actualArrival: actualArrTime,
                        scheduledDeparture: scheduledDepTime,
                        actualDeparture: actualDepTime,
                        arrivalDelay: accumulatedDelay,
                        departureDelay: scheduledDepTime ? accumulatedDelay : 0,
                        skipped: false
                    });

                    // Update time trackers for next loop
                    if (scheduledDepTime) baseTime.setTime(scheduledDepTime.getTime());
                    if (actualDepTime) currentTime.setTime(actualDepTime.getTime());
                }

                await TrainRun.create({
                    train: train._id,
                    route: route._id,
                    trainNumber: train.trainNumber,
                    runDate,
                    dayOfWeek: runDate.getDay(),
                    stationLogs,
                    sectionLogs,
                    overallDelay: accumulatedDelay,
                    status: 'Completed',
                    weatherCode: 'Clear',
                    isSimulated: true
                });
                
                runsCreated++;
            }
        }

        console.log(`\nHistorical Runs Seed Complete:`);
        console.log(`  Created ${runsCreated} runs across ${routes.length} routes.`);
        console.log(`  Total runs in DB: ${await TrainRun.countDocuments()}`);

        await mongoose.disconnect();
        console.log('Done.\n');
    } catch (error) {
        console.error('Historical runs seed error:', error);
        process.exit(1);
    }
};

if (require.main === module) {
    generateTrainRuns(30); // 30 days for dev
}

module.exports = generateTrainRuns;
