const mongoose = require('mongoose');
const Booking = require('./src/models/Booking');
const User = require('./src/models/User');
const Train = require('./src/models/Train');
const dotenv = require('dotenv');

dotenv.config();

const seedBookings = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // clear existing bookings if you want, or just append
        // await Booking.deleteMany({}); 

        const user = await User.findOne({ role: 'user' }) || await User.findOne({});
        const train = await Train.findOne({});

        if (!user || !train) {
            console.error('No user or train found to link bookings to. Run other seeds first.');
            process.exit(1);
        }

        const bookings = [];
        const classes = ['1A', '2A', '3A', 'SL', 'CC'];
        const statuses = ['Confirmed', 'Cancelled', 'Pending'];
        const months = [0, 1, 2, 3, 4]; // Last 5 months relative to now

        // Generate 50 random bookings
        for (let i = 0; i < 50; i++) {
            const randomMonth = months[Math.floor(Math.random() * months.length)];
            const date = new Date();
            date.setMonth(date.getMonth() - randomMonth);

            bookings.push({
                pnr: `TEST${Math.floor(100000 + Math.random() * 900000)}`,
                user: user._id,
                train: train._id,
                journeyDate: new Date(new Date().getTime() + 86400000 * (i + 1)), // Future dates
                travelClass: classes[Math.floor(Math.random() * classes.length)],
                passengers: [{
                    name: `Passenger ${i}`,
                    age: 20 + i,
                    gender: 'Male',
                    seat_type: 'Seat',
                    status: 'CNF'
                }],
                totalFare: 500 + Math.floor(Math.random() * 2000),
                status: statuses[Math.floor(Math.random() * statuses.length)],
                contactDetails: {
                    mobile: '9999999999',
                    email: user.email
                },
                createdAt: date // important for asset utilization graph
            });
        }

        await Booking.insertMany(bookings);
        console.log(`Seeded ${bookings.length} bookings successfully.`);
        process.exit();
    } catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    }
};

seedBookings();
