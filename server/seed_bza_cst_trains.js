const mongoose = require('mongoose');
require('dotenv').config();
const Train = require('./src/models/Train');

const seedTrains = [
    {
        trainNumber: "11020",
        name: "Konark Express",
        type: "Express",
        source: "BZA",
        destination: "CST",
        daysOfOperation: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        departureTime: "04:55",
        arrivalTime: "23:45",
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
        trainNumber: "12702",
        name: "Hussainsagar Exp",
        type: "Superfast",
        source: "BZA",
        destination: "CST",
        daysOfOperation: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        departureTime: "14:50",
        arrivalTime: "04:55",
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
        trainNumber: "11050",
        name: "BZA-CST Special",
        type: "Express",
        source: "BZA",
        destination: "CST",
        daysOfOperation: ["Mon", "Wed", "Fri"],
        departureTime: "08:30",
        arrivalTime: "03:15",
        distance: 965,
        baseFare: 480,
        coachComposition: [
            { classType: "3A", totalSeats: 128, seatsPerCoach: 64 },
            { classType: "SL", totalSeats: 560, seatsPerCoach: 80 }
        ],
        status: "Active"
    },
    {
        trainNumber: "12220",
        name: "Duronto Express",
        type: "Duronto",
        source: "BZA",
        destination: "CST",
        daysOfOperation: ["Tue", "Fri"],
        departureTime: "20:15",
        arrivalTime: "14:10",
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
        trainNumber: "12860",
        name: "Gitanjali SF Exp",
        type: "Superfast",
        source: "BZA",
        destination: "CST",
        daysOfOperation: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        departureTime: "11:25",
        arrivalTime: "06:15",
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
        trainNumber: "12140",
        name: "Sewagram Express",
        type: "Superfast",
        source: "BZA",
        destination: "CST",
        daysOfOperation: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        departureTime: "17:40",
        arrivalTime: "12:10",
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
        trainNumber: "11062",
        name: "Pawan Express",
        type: "Express",
        source: "BZA",
        destination: "CST",
        daysOfOperation: ["Mon", "Thu", "Sat"],
        departureTime: "22:10",
        arrivalTime: "18:45",
        distance: 975,
        baseFare: 490,
        coachComposition: [
            { classType: "3A", totalSeats: 128, seatsPerCoach: 64 },
            { classType: "SL", totalSeats: 720, seatsPerCoach: 80 }
        ],
        status: "Active"
    },
    {
        trainNumber: "12322",
        name: "Mumbai Mail",
        type: "Superfast",
        source: "BZA",
        destination: "CST",
        daysOfOperation: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        departureTime: "01:15",
        arrivalTime: "21:30",
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
        trainNumber: "12102",
        name: "Jnaneswari Exp",
        type: "Superfast",
        source: "BZA",
        destination: "CST",
        daysOfOperation: ["Mon", "Wed", "Fri"],
        departureTime: "13:10",
        arrivalTime: "08:40",
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
        trainNumber: "12152",
        name: "Samarsata Exp",
        type: "Superfast",
        source: "BZA",
        destination: "CST",
        daysOfOperation: ["Fri", "Sat"],
        departureTime: "19:50",
        arrivalTime: "15:45",
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
