const mongoose = require('mongoose');
const dotenv = require('dotenv');
require('dotenv').config();

const Station = require('../models/Station');
const Train = require('../models/Train');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Staff = require('../models/Staff');

const seedDatabase = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/railconnect');
        console.log('✅ Connected to MongoDB');

        // Clear existing data
        await Promise.all([
            User.deleteMany({}),
            Train.deleteMany({}),
            Station.deleteMany({}),
            Booking.deleteMany({}),
            Staff.deleteMany({})
        ]);
        console.log('✅ Cleared existing data');

        // ===== SEED STATIONS =====
        const stations = await Station.insertMany([
            { code: 'NDLS', name: 'New Delhi', city: 'Delhi', state: 'Delhi' },
            { code: 'BCT', name: 'Mumbai Central', city: 'Mumbai', state: 'Maharashtra' },
            { code: 'HWH', name: 'Howrah', city: 'Kolkata', state: 'West Bengal' },
            { code: 'MAS', name: 'Chennai Central', city: 'Chennai', state: 'Tamil Nadu' },
            { code: 'SBC', name: 'Bangalore', city: 'Bangalore', state: 'Karnataka' },
            { code: 'CST', name: 'Mumbai CST', city: 'Mumbai', state: 'Maharashtra' },
            { code: 'PUNE', name: 'Pune', city: 'Pune', state: 'Maharashtra' },
            { code: 'BZA', name: 'Vijayawada', city: 'Vijayawada', state: 'Andhra Pradesh' },
            { code: 'LKO', name: 'Lucknow', city: 'Lucknow', state: 'Uttar Pradesh' },
            { code: 'JAI', name: 'Jaipur', city: 'Jaipur', state: 'Rajasthan' }
        ]);
        console.log(`✅ Seeded ${stations.length} stations`);

        // ===== SEED TRAINS =====
        const trains = await Train.insertMany([
            {
                trainNumber: '12001',
                name: 'Shatabdi Express',
                type: 'Shatabdi',
                source: 'NDLS',
                destination: 'BCT',
                daysOfOperation: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                departureTime: '06:00',
                arrivalTime: '16:30',
                distance: 1440,
                coachComposition: [
                    { classType: '1A', totalSeats: 72, seatsPerCoach: 72 },
                    { classType: '2A', totalSeats: 144, seatsPerCoach: 72 },
                    { classType: 'CC', totalSeats: 72, seatsPerCoach: 72 }
                ],
                baseFare: 850,
                seatAvailability: [
                    { classType: '1A', available: 60, reserved: 10, waitlist: 2 },
                    { classType: '2A', available: 120, reserved: 20, waitlist: 4 },
                    { classType: 'CC', available: 70, reserved: 2, waitlist: 0 }
                ],
                status: 'Active'
            },
            {
                trainNumber: '12002',
                name: 'Rajdhani Express',
                type: 'Rajdhani',
                source: 'NDLS',
                destination: 'HWH',
                daysOfOperation: ['Mon', 'Wed', 'Fri', 'Sat', 'Sun'],
                departureTime: '16:30',
                arrivalTime: '10:15',
                distance: 1475,
                coachComposition: [
                    { classType: '1A', totalSeats: 72, seatsPerCoach: 72 },
                    { classType: '2A', totalSeats: 144, seatsPerCoach: 72 },
                    { classType: '3A', totalSeats: 216, seatsPerCoach: 72 }
                ],
                baseFare: 900,
                seatAvailability: [
                    { classType: '1A', available: 55, reserved: 15, waitlist: 2 },
                    { classType: '2A', available: 110, reserved: 30, waitlist: 4 },
                    { classType: '3A', available: 180, reserved: 30, waitlist: 6 }
                ],
                status: 'Active'
            },
            {
                trainNumber: '12003',
                name: 'Duronto Express',
                type: 'Duronto',
                source: 'NDLS',
                destination: 'MAS',
                daysOfOperation: ['Tue', 'Thu', 'Sat'],
                departureTime: '07:00',
                arrivalTime: '07:00',
                distance: 2190,
                coachComposition: [
                    { classType: '2A', totalSeats: 144, seatsPerCoach: 72 },
                    { classType: '3A', totalSeats: 216, seatsPerCoach: 72 }
                ],
                baseFare: 750,
                seatAvailability: [
                    { classType: '2A', available: 130, reserved: 14, waitlist: 0 },
                    { classType: '3A', available: 200, reserved: 16, waitlist: 0 }
                ],
                status: 'Active'
            },
            {
                trainNumber: '12004',
                name: 'Express Train',
                type: 'Express',
                source: 'NDLS',
                destination: 'JAI',
                daysOfOperation: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                departureTime: '10:30',
                arrivalTime: '15:45',
                distance: 280,
                coachComposition: [
                    { classType: 'SL', totalSeats: 288, seatsPerCoach: 72 },
                    { classType: '3A', totalSeats: 216, seatsPerCoach: 72 },
                    { classType: '2S', totalSeats: 144, seatsPerCoach: 72 }
                ],
                baseFare: 400,
                seatAvailability: [
                    { classType: 'SL', available: 250, reserved: 30, waitlist: 8 },
                    { classType: '3A', available: 190, reserved: 20, waitlist: 6 },
                    { classType: '2S', available: 120, reserved: 20, waitlist: 4 }
                ],
                status: 'Active'
            },
            {
                trainNumber: '12005',
                name: 'Superfast Express',
                type: 'Superfast',
                source: 'BCT',
                destination: 'PUNE',
                daysOfOperation: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                departureTime: '08:00',
                arrivalTime: '11:30',
                distance: 210,
                coachComposition: [
                    { classType: '2A', totalSeats: 144, seatsPerCoach: 72 },
                    { classType: '3A', totalSeats: 216, seatsPerCoach: 72 },
                    { classType: 'SL', totalSeats: 288, seatsPerCoach: 72 }
                ],
                baseFare: 500,
                seatAvailability: [
                    { classType: '2A', available: 130, reserved: 14, waitlist: 0 },
                    { classType: '3A', available: 200, reserved: 16, waitlist: 0 },
                    { classType: 'SL', available: 250, reserved: 30, waitlist: 8 }
                ],
                status: 'Active'
            }
        ]);
        console.log(`✅ Seeded ${trains.length} trains`);


        // ===== SEED USERS =====
        const userSeedData = [
            {
                name: 'John Passenger',
                email: 'passenger@example.com',
                password: 'password123',
                mobile: '9876543210',
                role: 'passenger',
                gender: 'Male',
                dateOfBirth: new Date('1990-05-15'),
                walletBalance: 5000,
                preferences: {
                    preferredBerth: 'Lower',
                    mealPreference: 'Veg',
                    seatPreference: 'Window'
                }
            },
            {
                name: 'Admin User',
                email: 'admin@example.com',
                password: 'admin123',
                mobile: '9876543211',
                role: 'admin',
                gender: 'Male',
                walletBalance: 0
            },
            {
                name: 'Jane Passenger',
                email: 'jane@example.com',
                password: 'password456',
                mobile: '8765432109',
                role: 'passenger',
                gender: 'Female',
                dateOfBirth: new Date('1992-08-22'),
                walletBalance: 3000
            }
        ];
        const users = await User.create(userSeedData);
        console.log(`✅ Seeded ${users.length} users`);

        // ===== SEED STAFF =====
        const staff = await Staff.create([
            {
                name: 'Rajesh Kumar',
                email: 'tte1@example.com',
                password: 'tte12345',
                mobile: '9800000001',
                staffRole: 'TTE',
                designation: 'Senior TTE',
                department: 'Operations',
                gender: 'Male',
                assignedStation: stations[0]._id,
                assignedTrains: [trains[0]._id, trains[1]._id],
                shifts: [
                    { startTime: '06:00', endTime: '14:00', dayOfWeek: 'Mon' },
                    { startTime: '06:00', endTime: '14:00', dayOfWeek: 'Tue' }
                ],
                employeeId: 'TTE001',
                isActive: true
            },

            {
                name: 'Vikram Patel',
                email: 'tte2@example.com',
                password: 'tte12345',
                mobile: '9800000003',
                staffRole: 'TTE',
                designation: 'Junior TTE',
                department: 'Operations',
                gender: 'Male',
                assignedStation: stations[1]._id,
                assignedTrains: [trains[2]._id, trains[3]._id],
                employeeId: 'TTE002',
                isActive: true
            }
        ]);
        console.log(`✅ Seeded ${staff.length} staff members`);

        // ===== SEED BOOKINGS =====
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        const bookings = await Booking.insertMany([
            {
                pnr: 'PNR0001001',
                user: users[0]._id,
                train: trains[0]._id,
                journeyDate: tomorrow,
                travelClass: '2A',
                passengers: [
                    {
                        name: 'John Passenger',
                        age: 32,
                        gender: 'Male',
                        berth_preference: 'Lower',
                        assigned_seat: '2A-45',
                        seat_type: 'Berth',
                        status: 'CNF'
                    }
                ],
                totalFare: 1200,
                fareBreakdown: {
                    baseFare: 1000,
                    gst: 180,
                    discount: 0,
                    finalFare: 1200
                },
                status: 'Confirmed',
                paymentStatus: 'Completed',
                paymentMethod: 'Card',
                contactDetails: {
                    mobile: '9876543210',
                    email: 'passenger@example.com'
                }
            },
            {
                pnr: 'PNR0001002',
                user: users[2]._id,
                train: trains[1]._id,
                journeyDate: tomorrow,
                travelClass: '3A',
                passengers: [
                    {
                        name: 'Jane Passenger',
                        age: 30,
                        gender: 'Female',
                        berth_preference: 'Middle',
                        assigned_seat: '3A-72',
                        seat_type: 'Berth',
                        status: 'CNF'
                    }
                ],
                totalFare: 1200,
                fareBreakdown: {
                    baseFare: 900,
                    gst: 162,
                    discount: 0,
                    finalFare: 1200
                },
                status: 'Confirmed',
                paymentStatus: 'Completed',
                paymentMethod: 'UPI',
                contactDetails: {
                    mobile: '8765432109',
                    email: 'jane@example.com'
                }
            }
        ]);
        console.log(`✅ Seeded ${bookings.length} bookings`);

        console.log('\n✅ Database seeding completed successfully!');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding database:', error.message);
        process.exit(1);
    }
};

seedDatabase();
