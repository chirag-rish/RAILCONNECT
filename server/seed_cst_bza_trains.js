const mongoose = require('mongoose');
require('dotenv').config();
const Train = require('./src/models/Train');

const seedTrains = [
    {
        trainNumber: "11019",
        name: "Konark Express",
        type: "Express",
        source: "CST",
        destination: "BZA",
        daysOfOperation: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        departureTime: "15:15",
        arrivalTime: "09:45",
        distance: 980,
        baseFare: 450,
        coachComposition: [
            { classType: "1A", totalSeats: 18, seatsPerCoach: 18 },
            { classType: "2A", totalSeats: 48, seatsPerCoach: 48 },
            { classType: "3A", totalSeats: 128, seatsPerCoach: 64 },
            { classType: "SL", totalSeats: 640, seatsPerCoach: 80 }
        ],
        status: "Active"
    },
    {
        trainNumber: "12701",
        name: "Hussainsagar Exp",
        type: "Superfast",
        source: "CST",
        destination: "BZA",
        daysOfOperation: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        departureTime: "21:50",
        arrivalTime: "12:15",
        distance: 1020,
        baseFare: 520,
        coachComposition: [
            { classType: "2A", totalSeats: 48, seatsPerCoach: 48 },
            { classType: "3A", totalSeats: 192, seatsPerCoach: 64 },
            { classType: "SL", totalSeats: 720, seatsPerCoach: 80 }
        ],
        status: "Active"
    },
    {
        trainNumber: "11049",
        name: "CST-BZA Special",
        type: "Express",
        source: "CST",
        destination: "BZA",
        daysOfOperation: ["Tue", "Thu", "Sat"],
        departureTime: "10:30",
        arrivalTime: "05:15",
        distance: 965,
        baseFare: 480,
        coachComposition: [
            { classType: "3A", totalSeats: 128, seatsPerCoach: 64 },
            { classType: "SL", totalSeats: 560, seatsPerCoach: 80 }
        ],
        status: "Active"
    },
    {
        trainNumber: "12219",
        name: "Duronto Express",
        type: "Duronto",
        source: "CST",
        destination: "BZA",
        daysOfOperation: ["Wed", "Sat"],
        departureTime: "23:05",
        arrivalTime: "17:15",
        distance: 1045,
        baseFare: 850,
        coachComposition: [
            { classType: "1A", totalSeats: 24, seatsPerCoach: 24 },
            { classType: "2A", totalSeats: 96, seatsPerCoach: 48 },
            { classType: "3A", totalSeats: 256, seatsPerCoach: 64 }
        ],
        status: "Active"
    },
    {
        trainNumber: "12859",
        name: "Gitanjali SF Exp",
        type: "Superfast",
        source: "CST",
        destination: "BZA",
        daysOfOperation: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        departureTime: "06:00",
        arrivalTime: "00:45",
        distance: 1010,
        baseFare: 540,
        coachComposition: [
            { classType: "2A", totalSeats: 48, seatsPerCoach: 48 },
            { classType: "3A", totalSeats: 128, seatsPerCoach: 64 },
            { classType: "SL", totalSeats: 800, seatsPerCoach: 80 }
        ],
        status: "Active"
    },
    {
        trainNumber: "12139",
        name: "Sewagram Express",
        type: "Superfast",
        source: "CST",
        destination: "BZA",
        daysOfOperation: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        departureTime: "14:55",
        arrivalTime: "09:10",
        distance: 995,
        baseFare: 510,
        coachComposition: [
            { classType: "2A", totalSeats: 48, seatsPerCoach: 48 },
            { classType: "3A", totalSeats: 192, seatsPerCoach: 64 },
            { classType: "SL", totalSeats: 640, seatsPerCoach: 80 }
        ],
        status: "Active"
    },
    {
        trainNumber: "11061",
        name: "Pawan Express",
        type: "Express",
        source: "CST",
        destination: "BZA",
        daysOfOperation: ["Tue", "Fri", "Sun"],
        departureTime: "12:15",
        arrivalTime: "08:45",
        distance: 975,
        baseFare: 490,
        coachComposition: [
            { classType: "3A", totalSeats: 128, seatsPerCoach: 64 },
            { classType: "SL", totalSeats: 720, seatsPerCoach: 80 }
        ],
        status: "Active"
    },
    {
        trainNumber: "12321",
        name: "Mumbai Mail",
        type: "Superfast",
        source: "CST",
        destination: "BZA",
        daysOfOperation: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        departureTime: "23:35",
        arrivalTime: "19:30",
        distance: 1030,
        baseFare: 560,
        coachComposition: [
            { classType: "1A", totalSeats: 18, seatsPerCoach: 18 },
            { classType: "2A", totalSeats: 48, seatsPerCoach: 48 },
            { classType: "3A", totalSeats: 192, seatsPerCoach: 64 },
            { classType: "SL", totalSeats: 640, seatsPerCoach: 80 }
        ],
        status: "Active"
    },
    {
        trainNumber: "12101",
        name: "Jnaneswari Exp",
        type: "Superfast",
        source: "CST",
        destination: "BZA",
        daysOfOperation: ["Tue", "Thu", "Sat"],
        departureTime: "20:35",
        arrivalTime: "15:40",
        distance: 1015,
        baseFare: 580,
        coachComposition: [
            { classType: "2A", totalSeats: 96, seatsPerCoach: 48 },
            { classType: "3A", totalSeats: 256, seatsPerCoach: 64 },
            { classType: "SL", totalSeats: 400, seatsPerCoach: 80 }
        ],
        status: "Active"
    },
    {
        trainNumber: "12151",
        name: "Samarsata Exp",
        type: "Superfast",
        source: "CST",
        destination: "BZA",
        daysOfOperation: ["Wed", "Thu"],
        departureTime: "20:35",
        arrivalTime: "16:45",
        distance: 1025,
        baseFare: 600,
        coachComposition: [
            { classType: "2A", totalSeats: 48, seatsPerCoach: 48 },
            { classType: "3A", totalSeats: 128, seatsPerCoach: 64 },
            { classType: "SL", totalSeats: 800, seatsPerCoach: 80 }
        ],
        status: "Active"
    }
];

async function seed() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        for (const trainData of seedTrains) {
            // Initialize seatAvailability
            trainData.seatAvailability = trainData.coachComposition.map(c => ({
                classType: c.classType,
                available: c.totalSeats,
                reserved: 0,
                waitlist: 0
            }));

            await Train.findOneAndUpdate(
                { trainNumber: trainData.trainNumber },
                trainData,
                { upsert: true, new: true }
            );
            console.log(`Seeded/Updated train: ${trainData.trainNumber} - ${trainData.name}`);
        }

        console.log('All trains seeded successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding trains:', error);
        process.exit(1);
    }
}

seed();
