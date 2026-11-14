const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./src/models/User');
const Train = require('./src/models/Train');
const Booking = require('./src/models/Booking');
const bcrypt = require('bcryptjs');

async function seedTTETest() {
    try {
        // Connect to MongoDB
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Create/find TTE user
        console.log('Creating TTE user...');
        let tteUser = await User.findOne({ email: 'tte@railconnect.com' });
        if (!tteUser) {
            tteUser = await User.create({
                name: 'Test TTE',
                email: 'tte@railconnect.com',
                password: await bcrypt.hash('password123', 10),
                mobile: '9876543210',
                role: 'tte'
            });
            console.log('TTE user created:', tteUser._id);
        } else {
            console.log('TTE user already exists:', tteUser._id);
        }

        // Create/find a test train
        console.log('Creating test train...');
        let train = await Train.findOne({ trainNumber: '12345' });
        if (!train) {
            train = await Train.create({
                trainNumber: '12345',
                name: 'Express Test Train',
                type: 'Express',
                source: 'CST',
                destination: 'BZA',
                daysOfOperation: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                departureTime: '08:00',
                arrivalTime: '20:00',
                distance: 500,
                coachComposition: [
                    { classType: 'SL', totalSeats: 72, seatsPerCoach: 72 },
                    { classType: 'SL', totalSeats: 72, seatsPerCoach: 72 }
                ],
                baseFare: 500,
                platform: 'P1',
                status: 'Active',
                delayMinutes: 0
            });
            console.log('Train created:', train._id);
        } else {
            console.log('Train already exists:', train._id);
        }

        // Create a test passenger user
        console.log('Creating passenger user...');
        let passengerUser = await User.findOne({ email: 'passenger@railconnect.com' });
        if (!passengerUser) {
            passengerUser = await User.create({
                name: 'Test Passenger',
                email: 'passenger@railconnect.com',
                password: await bcrypt.hash('password123', 10),
                mobile: '9876543212',
                role: 'passenger'
            });
            console.log('Passenger user created:', passengerUser._id);
        } else {
            console.log('Passenger user already exists:', passengerUser._id);
        }

        // Create a test booking
        console.log('Creating test booking...');
        const existingBooking = await Booking.findOne({ pnr: 'TTE1234567' });
        if (!existingBooking) {
            const booking = await Booking.create({
                user: passengerUser._id,
                train: train._id,
                pnr: 'TTE1234567',
                journeyDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
                travelClass: 'SL',
                passengers: [
                    {
                        name: 'Raj Kumar',
                        age: 30,
                        gender: 'Male',
                        berth_preference: 'Lower',
                        assigned_seat: 'S1-01',
                        seat_type: 'Berth',
                        status: 'Confirmed',
                        boarded: false
                    },
                    {
                        name: 'Priya Sharma',
                        age: 28,
                        gender: 'Female',
                        berth_preference: 'Middle',
                        assigned_seat: 'S1-02',
                        seat_type: 'Berth',
                        status: 'Confirmed',
                        boarded: true
                    }
                ],
                totalFare: 1000,
                fareBreakdown: {
                    baseFare: 1000,
                    gst: 0,
                    discount: 0,
                    finalFare: 1000
                },
                status: 'Confirmed',
                contactDetails: {
                    mobile: passengerUser.mobile,
                    email: passengerUser.email
                }
            });
            console.log('Test booking created:', booking._id);
            console.log('PNR:', booking.pnr);
        } else {
            console.log('Test booking already exists:', existingBooking.pnr);
        }

        console.log('\n✅ Test data seeded successfully!');
        console.log('TTE Credentials: tte@railconnect.com / password123');
        console.log('Test PNR to verify: TTE1234567');

    } catch (error) {
        console.error('Error seeding test data:', error.message);
    } finally {
        await mongoose.connection.close();
    }
}

seedTTETest();
