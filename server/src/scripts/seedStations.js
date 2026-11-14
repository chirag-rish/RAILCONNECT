/**
 * Seed Script: Indian Railway Stations
 * 
 * Seeds ~45 stations across major corridors for SIH26028 ETA demonstration.
 * 
 * Station coordinates and zone data are from publicly available sources
 * (Wikipedia, OpenStreetMap). This is NOT official Indian Railways data.
 * 
 * Usage: node src/scripts/seedStations.js
 */

const mongoose = require('mongoose');
require('dotenv').config();
const Station = require('../models/Station');

const stations = [
    // === Delhi–Mumbai Western Corridor ===
    { code: 'NDLS', name: 'New Delhi', city: 'New Delhi', state: 'Delhi', latitude: 28.6419, longitude: 77.2194, zone: 'NR', division: 'Delhi', platformCount: 16, stationType: 'Terminal' },
    { code: 'MTJ',  name: 'Mathura Junction', city: 'Mathura', state: 'Uttar Pradesh', latitude: 27.4728, longitude: 77.6735, zone: 'NCR', division: 'Agra', platformCount: 8, stationType: 'Junction' },
    { code: 'AGC',  name: 'Agra Cantt', city: 'Agra', state: 'Uttar Pradesh', latitude: 27.1591, longitude: 78.0102, zone: 'NCR', division: 'Agra', platformCount: 6, stationType: 'Junction' },
    { code: 'GWL',  name: 'Gwalior', city: 'Gwalior', state: 'Madhya Pradesh', latitude: 26.2124, longitude: 78.1822, zone: 'NCR', division: 'Jhansi', platformCount: 5, stationType: 'Junction' },
    { code: 'JHS',  name: 'Jhansi Junction', city: 'Jhansi', state: 'Uttar Pradesh', latitude: 25.4431, longitude: 78.5685, zone: 'NCR', division: 'Jhansi', platformCount: 8, stationType: 'Junction' },
    { code: 'BPL',  name: 'Bhopal Junction', city: 'Bhopal', state: 'Madhya Pradesh', latitude: 23.2688, longitude: 77.4122, zone: 'WCR', division: 'Bhopal', platformCount: 6, stationType: 'Junction' },
    { code: 'NGP',  name: 'Nagpur Junction', city: 'Nagpur', state: 'Maharashtra', latitude: 21.1498, longitude: 79.0806, zone: 'CR', division: 'Nagpur', platformCount: 8, stationType: 'Junction' },
    { code: 'BSL',  name: 'Bhusaval Junction', city: 'Bhusaval', state: 'Maharashtra', latitude: 21.0451, longitude: 75.7714, zone: 'CR', division: 'Bhusaval', platformCount: 6, stationType: 'Junction' },
    { code: 'NZB',  name: 'Nashik Road', city: 'Nashik', state: 'Maharashtra', latitude: 19.9870, longitude: 73.7481, zone: 'CR', division: 'Bhusaval', platformCount: 4, stationType: 'Halt' },
    { code: 'KYN',  name: 'Kalyan Junction', city: 'Kalyan', state: 'Maharashtra', latitude: 19.2297, longitude: 73.1350, zone: 'CR', division: 'Mumbai', platformCount: 8, stationType: 'Junction' },
    { code: 'CST',  name: 'Mumbai CSMT', city: 'Mumbai', state: 'Maharashtra', latitude: 18.9398, longitude: 72.8354, zone: 'CR', division: 'Mumbai', platformCount: 18, stationType: 'Terminal' },
    { code: 'BCT',  name: 'Mumbai Central', city: 'Mumbai', state: 'Maharashtra', latitude: 18.9696, longitude: 72.8193, zone: 'WR', division: 'Mumbai Central', platformCount: 10, stationType: 'Terminal' },

    // === Delhi–Kolkata Eastern Corridor ===
    { code: 'CNB',  name: 'Kanpur Central', city: 'Kanpur', state: 'Uttar Pradesh', latitude: 26.4534, longitude: 80.3496, zone: 'NCR', division: 'Prayagraj', platformCount: 10, stationType: 'Junction' },
    { code: 'ALD',  name: 'Prayagraj Junction', city: 'Prayagraj', state: 'Uttar Pradesh', latitude: 25.4272, longitude: 81.8327, zone: 'NCR', division: 'Prayagraj', platformCount: 10, stationType: 'Junction' },
    { code: 'BSB',  name: 'Varanasi Junction', city: 'Varanasi', state: 'Uttar Pradesh', latitude: 25.3176, longitude: 83.0100, zone: 'NER', division: 'Varanasi', platformCount: 9, stationType: 'Junction' },
    { code: 'MGS',  name: 'Mughal Sarai Junction', city: 'Chandauli', state: 'Uttar Pradesh', latitude: 25.2814, longitude: 83.1186, zone: 'ECR', division: 'Mughal Sarai', platformCount: 10, stationType: 'Junction' },
    { code: 'PNBE', name: 'Patna Junction', city: 'Patna', state: 'Bihar', latitude: 25.6075, longitude: 85.1372, zone: 'ECR', division: 'Danapur', platformCount: 10, stationType: 'Junction' },
    { code: 'ASN',  name: 'Asansol Junction', city: 'Asansol', state: 'West Bengal', latitude: 23.6859, longitude: 86.9562, zone: 'ER', division: 'Asansol', platformCount: 7, stationType: 'Junction' },
    { code: 'HWH',  name: 'Howrah Junction', city: 'Kolkata', state: 'West Bengal', latitude: 22.5839, longitude: 88.3428, zone: 'ER', division: 'Howrah', platformCount: 23, stationType: 'Terminal' },

    // === Vijayawada–Mumbai Corridor (existing seed trains use BZA–CST) ===
    { code: 'BZA',  name: 'Vijayawada Junction', city: 'Vijayawada', state: 'Andhra Pradesh', latitude: 16.5175, longitude: 80.6200, zone: 'SCR', division: 'Vijayawada', platformCount: 10, stationType: 'Junction' },
    { code: 'WL',   name: 'Warangal', city: 'Warangal', state: 'Telangana', latitude: 17.9689, longitude: 79.5941, zone: 'SCR', division: 'Secunderabad', platformCount: 5, stationType: 'Junction' },
    { code: 'SC',   name: 'Secunderabad Junction', city: 'Hyderabad', state: 'Telangana', latitude: 17.4337, longitude: 78.5016, zone: 'SCR', division: 'Secunderabad', platformCount: 10, stationType: 'Junction' },
    { code: 'KCG',  name: 'Kacheguda', city: 'Hyderabad', state: 'Telangana', latitude: 17.3853, longitude: 78.4893, zone: 'SCR', division: 'Hyderabad', platformCount: 6, stationType: 'Terminal' },
    { code: 'NED',  name: 'Nanded', city: 'Nanded', state: 'Maharashtra', latitude: 19.1543, longitude: 77.3209, zone: 'SCR', division: 'Nanded', platformCount: 5, stationType: 'Junction' },
    { code: 'PVR',  name: 'Parbhani Junction', city: 'Parbhani', state: 'Maharashtra', latitude: 19.2613, longitude: 76.7745, zone: 'SCR', division: 'Nanded', platformCount: 4, stationType: 'Junction' },
    { code: 'MMR',  name: 'Manmad Junction', city: 'Manmad', state: 'Maharashtra', latitude: 20.2536, longitude: 74.4315, zone: 'CR', division: 'Bhusaval', platformCount: 5, stationType: 'Junction' },

    // === Chennai–Bangalore–Mysore Southern Corridor ===
    { code: 'MAS',  name: 'Chennai Central', city: 'Chennai', state: 'Tamil Nadu', latitude: 13.0827, longitude: 80.2707, zone: 'SR', division: 'Chennai', platformCount: 12, stationType: 'Terminal' },
    { code: 'AJJ',  name: 'Arakkonam Junction', city: 'Arakkonam', state: 'Tamil Nadu', latitude: 13.0764, longitude: 79.6733, zone: 'SR', division: 'Chennai', platformCount: 6, stationType: 'Junction' },
    { code: 'KPD',  name: 'Katpadi Junction', city: 'Vellore', state: 'Tamil Nadu', latitude: 12.9357, longitude: 79.1449, zone: 'SR', division: 'Chennai', platformCount: 6, stationType: 'Junction' },
    { code: 'JTJ',  name: 'Jolarpettai Junction', city: 'Jolarpettai', state: 'Tamil Nadu', latitude: 12.5704, longitude: 78.5732, zone: 'SR', division: 'Salem', platformCount: 4, stationType: 'Junction' },
    { code: 'BWT',  name: 'Bangarapet Junction', city: 'Bangarapet', state: 'Karnataka', latitude: 12.9854, longitude: 78.1785, zone: 'SWR', division: 'Bangalore', platformCount: 4, stationType: 'Junction' },
    { code: 'SBC',  name: 'KSR Bengaluru', city: 'Bengaluru', state: 'Karnataka', latitude: 12.9774, longitude: 77.5699, zone: 'SWR', division: 'Bangalore', platformCount: 10, stationType: 'Terminal' },

    // === Pune Corridor ===
    { code: 'PUNE', name: 'Pune Junction', city: 'Pune', state: 'Maharashtra', latitude: 18.5285, longitude: 73.8743, zone: 'CR', division: 'Pune', platformCount: 6, stationType: 'Junction' },
    { code: 'LNL',  name: 'Lonavala', city: 'Lonavala', state: 'Maharashtra', latitude: 18.7500, longitude: 73.4050, zone: 'CR', division: 'Pune', platformCount: 4, stationType: 'Halt', altitude: 622 },
    { code: 'KJT',  name: 'Karjat Junction', city: 'Karjat', state: 'Maharashtra', latitude: 18.9106, longitude: 73.3236, zone: 'CR', division: 'Mumbai', platformCount: 5, stationType: 'Junction', altitude: 59 },

    // === Additional key stations ===
    { code: 'KOTA', name: 'Kota Junction', city: 'Kota', state: 'Rajasthan', latitude: 25.1837, longitude: 75.8563, zone: 'WCR', division: 'Kota', platformCount: 7, stationType: 'Junction' },
    { code: 'RTM',  name: 'Ratlam Junction', city: 'Ratlam', state: 'Madhya Pradesh', latitude: 23.3315, longitude: 75.0367, zone: 'WR', division: 'Ratlam', platformCount: 6, stationType: 'Junction' },
    { code: 'BRC',  name: 'Vadodara Junction', city: 'Vadodara', state: 'Gujarat', latitude: 22.3102, longitude: 73.1812, zone: 'WR', division: 'Vadodara', platformCount: 7, stationType: 'Junction' },
    { code: 'ST',   name: 'Surat', city: 'Surat', state: 'Gujarat', latitude: 21.2049, longitude: 72.8406, zone: 'WR', division: 'Vadodara', platformCount: 5, stationType: 'Junction' },
    { code: 'ADI',  name: 'Ahmedabad Junction', city: 'Ahmedabad', state: 'Gujarat', latitude: 23.0258, longitude: 72.6001, zone: 'WR', division: 'Ahmedabad', platformCount: 12, stationType: 'Junction' },
    { code: 'JP',   name: 'Jaipur Junction', city: 'Jaipur', state: 'Rajasthan', latitude: 26.9197, longitude: 75.7877, zone: 'NWR', division: 'Jaipur', platformCount: 8, stationType: 'Junction' },
    { code: 'UDZ',  name: 'Udaipur City', city: 'Udaipur', state: 'Rajasthan', latitude: 24.5804, longitude: 73.6822, zone: 'NWR', division: 'Ajmer', platformCount: 4, stationType: 'Terminal' },
    { code: 'GKP',  name: 'Gorakhpur Junction', city: 'Gorakhpur', state: 'Uttar Pradesh', latitude: 26.7509, longitude: 83.3644, zone: 'NER', division: 'Lucknow', platformCount: 10, stationType: 'Junction' },
    { code: 'LKO',  name: 'Lucknow Charbagh', city: 'Lucknow', state: 'Uttar Pradesh', latitude: 26.8313, longitude: 80.9205, zone: 'NR', division: 'Lucknow', platformCount: 9, stationType: 'Junction' },
];

const seedStations = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected for station seeding');

        let created = 0;
        let updated = 0;
        let skipped = 0;

        for (const stationData of stations) {
            const existing = await Station.findOne({ code: stationData.code });
            if (existing) {
                // Update existing station with new fields (additive — don't overwrite name/city/state)
                await Station.updateOne(
                    { code: stationData.code },
                    {
                        $set: {
                            latitude: stationData.latitude,
                            longitude: stationData.longitude,
                            zone: stationData.zone,
                            division: stationData.division,
                            platformCount: stationData.platformCount,
                            stationType: stationData.stationType,
                            altitude: stationData.altitude || 0
                        }
                    }
                );
                updated++;
            } else {
                await Station.create(stationData);
                created++;
            }
        }

        console.log(`\nStation Seed Complete:`);
        console.log(`  Created: ${created}`);
        console.log(`  Updated: ${updated}`);
        console.log(`  Total:   ${stations.length}`);

        const total = await Station.countDocuments();
        console.log(`  Total stations in DB: ${total}`);

        await mongoose.disconnect();
        console.log('Done.\n');
    } catch (error) {
        console.error('Station seed error:', error);
        process.exit(1);
    }
};

if (require.main === module) {
    seedStations();
}

module.exports = seedStations;
