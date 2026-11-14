/**
 * Seed Script: Train Routes
 * 
 * Seeds ~5 representative routes with section data for ML ETA prediction.
 * Uses the stations seeded by seedStations.js.
 * 
 * Usage: node src/scripts/seedRoutes.js
 */

const mongoose = require('mongoose');
require('dotenv').config();
const Route = require('../models/Route');

const routeData = [
    {
        routeCode: 'BZA-CST-11020',
        name: 'Konark Express Route (BZA to CST)',
        stations: [
            { station: 'BZA', stationName: 'Vijayawada Junction', scheduledArrival: null, scheduledDeparture: '10:55', haltDuration: 0, isMajorStation: true },
            { station: 'WL',  stationName: 'Warangal', scheduledArrival: '14:15', scheduledDeparture: '14:20', haltDuration: 5 },
            { station: 'SC',  stationName: 'Secunderabad Junction', scheduledArrival: '16:50', scheduledDeparture: '17:00', haltDuration: 10, isMajorStation: true },
            { station: 'NED', stationName: 'Nanded', scheduledArrival: '21:30', scheduledDeparture: '21:35', haltDuration: 5 },
            { station: 'PVR', stationName: 'Parbhani Junction', scheduledArrival: '23:05', scheduledDeparture: '23:10', haltDuration: 5 },
            { station: 'MMR', stationName: 'Manmad Junction', scheduledArrival: '02:15', scheduledDeparture: '02:20', haltDuration: 5, isMajorStation: true },
            { station: 'KYN', stationName: 'Kalyan Junction', scheduledArrival: '06:15', scheduledDeparture: '06:18', haltDuration: 3 },
            { station: 'CST', stationName: 'Mumbai CSMT', scheduledArrival: '07:25', scheduledDeparture: null, haltDuration: 0, isMajorStation: true }
        ],
        sections: [
            { fromStation: 'BZA', toStation: 'WL',  distance: 207, typicalSpeed: 70, maxSpeed: 110, sectionType: 'DoubleLine' },
            { fromStation: 'WL',  toStation: 'SC',  distance: 142, typicalSpeed: 65, maxSpeed: 110, sectionType: 'DoubleLine' },
            { fromStation: 'SC',  toStation: 'NED', distance: 271, typicalSpeed: 60, maxSpeed: 100, sectionType: 'SingleLine' },
            { fromStation: 'NED', toStation: 'PVR', distance: 59,  typicalSpeed: 55, maxSpeed: 100, sectionType: 'SingleLine' },
            { fromStation: 'PVR', toStation: 'MMR', distance: 291, typicalSpeed: 65, maxSpeed: 100, sectionType: 'SingleLine' },
            { fromStation: 'MMR', toStation: 'KYN', distance: 206, typicalSpeed: 70, maxSpeed: 120, sectionType: 'DoubleLine', gradientProfile: 'Steep' },
            { fromStation: 'KYN', toStation: 'CST', distance: 54,  typicalSpeed: 45, maxSpeed: 100, sectionType: 'Quadruple', signalCount: 15 }
        ]
    },
    {
        routeCode: 'NDLS-BCT-12952',
        name: 'Mumbai Rajdhani Route (NDLS to BCT)',
        stations: [
            { station: 'NDLS', stationName: 'New Delhi', scheduledArrival: null, scheduledDeparture: '16:55', haltDuration: 0, isMajorStation: true },
            { station: 'KOTA', stationName: 'Kota Junction', scheduledArrival: '21:30', scheduledDeparture: '21:40', haltDuration: 10, isMajorStation: true },
            { station: 'RTM',  stationName: 'Ratlam Junction', scheduledArrival: '00:27', scheduledDeparture: '00:30', haltDuration: 3 },
            { station: 'BRC',  stationName: 'Vadodara Junction', scheduledArrival: '03:40', scheduledDeparture: '03:50', haltDuration: 10, isMajorStation: true },
            { station: 'ST',   stationName: 'Surat', scheduledArrival: '05:13', scheduledDeparture: '05:18', haltDuration: 5 },
            { station: 'BCT',  stationName: 'Mumbai Central', scheduledArrival: '08:35', scheduledDeparture: null, haltDuration: 0, isMajorStation: true }
        ],
        sections: [
            { fromStation: 'NDLS', toStation: 'KOTA', distance: 466, typicalSpeed: 95, maxSpeed: 130, sectionType: 'DoubleLine', electrified: true },
            { fromStation: 'KOTA', toStation: 'RTM',  distance: 267, typicalSpeed: 90, maxSpeed: 130, sectionType: 'DoubleLine', electrified: true },
            { fromStation: 'RTM',  toStation: 'BRC',  distance: 261, typicalSpeed: 85, maxSpeed: 130, sectionType: 'DoubleLine', electrified: true },
            { fromStation: 'BRC',  toStation: 'ST',   distance: 130, typicalSpeed: 85, maxSpeed: 130, sectionType: 'DoubleLine', electrified: true },
            { fromStation: 'ST',   toStation: 'BCT',  distance: 263, typicalSpeed: 80, maxSpeed: 130, sectionType: 'Quadruple', electrified: true }
        ]
    },
    {
        routeCode: 'MAS-SBC-12007',
        name: 'Shatabdi Express Route (MAS to SBC)',
        stations: [
            { station: 'MAS', stationName: 'Chennai Central', scheduledArrival: null, scheduledDeparture: '06:00', haltDuration: 0, isMajorStation: true },
            { station: 'KPD', stationName: 'Katpadi Junction', scheduledArrival: '07:38', scheduledDeparture: '07:40', haltDuration: 2, isMajorStation: true },
            { station: 'SBC', stationName: 'KSR Bengaluru', scheduledArrival: '10:45', scheduledDeparture: null, haltDuration: 0, isMajorStation: true }
        ],
        sections: [
            { fromStation: 'MAS', toStation: 'KPD', distance: 130, typicalSpeed: 80, maxSpeed: 130, sectionType: 'DoubleLine' },
            { fromStation: 'KPD', toStation: 'SBC', distance: 229, typicalSpeed: 75, maxSpeed: 110, sectionType: 'DoubleLine', gradientProfile: 'Mild' }
        ]
    },
    {
        routeCode: 'HWH-NDLS-12301',
        name: 'Howrah Rajdhani Route (HWH to NDLS)',
        stations: [
            { station: 'HWH',  stationName: 'Howrah Junction', scheduledArrival: null, scheduledDeparture: '16:50', haltDuration: 0, isMajorStation: true },
            { station: 'ASN',  stationName: 'Asansol Junction', scheduledArrival: '18:57', scheduledDeparture: '18:59', haltDuration: 2 },
            { station: 'PNBE', stationName: 'Patna Junction', scheduledArrival: '22:15', scheduledDeparture: '22:25', haltDuration: 10, isMajorStation: true },
            { station: 'MGS',  stationName: 'Mughal Sarai Junction', scheduledArrival: '01:05', scheduledDeparture: '01:15', haltDuration: 10, isMajorStation: true },
            { station: 'ALD',  stationName: 'Prayagraj Junction', scheduledArrival: '03:00', scheduledDeparture: '03:05', haltDuration: 5 },
            { station: 'CNB',  stationName: 'Kanpur Central', scheduledArrival: '05:20', scheduledDeparture: '05:25', haltDuration: 5, isMajorStation: true },
            { station: 'NDLS', stationName: 'New Delhi', scheduledArrival: '10:05', scheduledDeparture: null, haltDuration: 0, isMajorStation: true }
        ],
        sections: [
            { fromStation: 'HWH',  toStation: 'ASN',  distance: 200, typicalSpeed: 95, maxSpeed: 130, sectionType: 'DoubleLine' },
            { fromStation: 'ASN',  toStation: 'PNBE', distance: 331, typicalSpeed: 90, maxSpeed: 130, sectionType: 'DoubleLine' },
            { fromStation: 'PNBE', toStation: 'MGS',  distance: 211, typicalSpeed: 85, maxSpeed: 130, sectionType: 'DoubleLine' },
            { fromStation: 'MGS',  toStation: 'ALD',  distance: 153, typicalSpeed: 90, maxSpeed: 130, sectionType: 'DoubleLine' },
            { fromStation: 'ALD',  toStation: 'CNB',  distance: 195, typicalSpeed: 95, maxSpeed: 130, sectionType: 'DoubleLine' },
            { fromStation: 'CNB',  toStation: 'NDLS', distance: 440, typicalSpeed: 95, maxSpeed: 130, sectionType: 'DoubleLine' }
        ]
    },
    {
        routeCode: 'CST-PUNE-12123',
        name: 'Deccan Queen Route (CST to PUNE)',
        stations: [
            { station: 'CST',  stationName: 'Mumbai CSMT', scheduledArrival: null, scheduledDeparture: '17:10', haltDuration: 0, isMajorStation: true },
            { station: 'KJT',  stationName: 'Karjat Junction', scheduledArrival: '18:33', scheduledDeparture: '18:35', haltDuration: 2 },
            { station: 'LNL',  stationName: 'Lonavala', scheduledArrival: '19:18', scheduledDeparture: '19:20', haltDuration: 2 },
            { station: 'PUNE', stationName: 'Pune Junction', scheduledArrival: '20:25', scheduledDeparture: null, haltDuration: 0, isMajorStation: true }
        ],
        sections: [
            { fromStation: 'CST', toStation: 'KJT', distance: 100, typicalSpeed: 65, maxSpeed: 110, sectionType: 'Quadruple', signalCount: 12 },
            { fromStation: 'KJT', toStation: 'LNL', distance: 28,  typicalSpeed: 35, maxSpeed: 60,  sectionType: 'DoubleLine', gradientProfile: 'Steep' },
            { fromStation: 'LNL', toStation: 'PUNE', distance: 64,  typicalSpeed: 60, maxSpeed: 110, sectionType: 'DoubleLine' }
        ]
    }
];

const seedRoutes = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected for route seeding');

        let created = 0;
        let updated = 0;

        for (const data of routeData) {
            let totalDist = 0;
            // Pre-process sequences and distances
            for (let i = 0; i < data.stations.length; i++) {
                data.stations[i].sequenceNumber = i + 1;
                data.stations[i].distanceFromOrigin = totalDist;
                
                if (i < data.sections.length) {
                    totalDist += data.sections[i].distance;
                }
            }
            data.totalDistance = totalDist;
            data.totalStations = data.stations.length;

            const existing = await Route.findOne({ routeCode: data.routeCode });
            if (existing) {
                await Route.updateOne({ routeCode: data.routeCode }, { $set: data });
                updated++;
            } else {
                await Route.create(data);
                created++;
            }
        }

        console.log(`\nRoute Seed Complete:`);
        console.log(`  Created: ${created}`);
        console.log(`  Updated: ${updated}`);
        console.log(`  Total in DB: ${await Route.countDocuments()}`);

        await mongoose.disconnect();
        console.log('Done.\n');
    } catch (error) {
        console.error('Route seed error:', error);
        process.exit(1);
    }
};

if (require.main === module) {
    seedRoutes();
}

module.exports = seedRoutes;
