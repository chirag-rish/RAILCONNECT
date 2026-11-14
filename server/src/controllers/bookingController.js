const Booking = require('../models/Booking');
const Train = require('../models/Train');
const User = require('../models/User');
const { generateTicketPDF } = require('../utils/ticketPdf');
const { nowIST, parseISTDate } = require('../utils/istTime');
const { getClassMultiplier, calculateBookingFare } = require('../utils/fareCalculator');

// Generate PNR
const generatePNR = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let pnr = '';
    for (let i = 0; i < 10; i++) {
        pnr += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return pnr;
};

const calculateFare = calculateBookingFare;

// Allocate seats
const allocateSeats = (passengers, classType) => {
    const seatTypes = ['Berth', 'Seat'];
    const berthPositions = ['Lower', 'Upper', 'Middle', 'Side Lower', 'Side Upper'];

    return passengers.map((p, index) => {
        const seatNumber = `${classType}-${Math.floor(Math.random() * 72) + 1}`;
        const seatType = classType === '2S' ? 'Seat' : 'Berth';
        const berthPreference = p.berth_preference || berthPositions[Math.floor(Math.random() * berthPositions.length)];

        return {
            ...p,
            status: 'CNF',
            assigned_seat: seatNumber,
            seat_type: seatType,
            berth_preference: berthPreference,
            checkedIn: false
        };
    });
};

const ensureBookingTicketUrl = async (booking) => {
    if (booking.ticketUrl) return booking.ticketUrl;

    try {
        const ticketUrl = await generateTicketPDF(booking._id);
        booking.ticketUrl = ticketUrl;
        await booking.save();
        return ticketUrl;
    } catch (error) {
        console.error('Failed to generate ticket PDF:', error);
        return '';
    }
};

// Create booking with full flow
const createBooking = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        const {
            trainId,
            journeyDate,
            travelClass,
            passengers,
            contactDetails,
            paymentMethod
        } = req.body;

        if (!passengers || passengers.length === 0) {
            return res.status(400).json({ success: false, message: 'No passengers provided' });
        }

        if (!trainId || !journeyDate || !travelClass) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const journeyDateObj = parseISTDate(journeyDate);
        const todayISTMidnight = nowIST();
        todayISTMidnight.setHours(0, 0, 0, 0);
        if (journeyDateObj < todayISTMidnight) {
            return res.status(400).json({ success: false, message: 'Journey date must be in the future' });
        }

        let train = await Train.findById(trainId).catch(() => null);
        if (!train) {
            train = await Train.findOne({ trainNumber: trainId?.toString().toUpperCase() });
        }
        if (!train) {
            return res.status(404).json({ success: false, message: 'Train not found' });
        }

        const classAvailable = train.coachComposition.some(c => c.classType === travelClass);
        if (!classAvailable) {
            return res.status(400).json({ success: false, message: `Class ${travelClass} not available on this train` });
        }

        const { baseFarePerPassenger, gstAmount, totalFare } = calculateFare(train, travelClass, passengers.length);

        const updatedUser = await User.findOneAndUpdate(
            { _id: req.user._id, walletBalance: { $gte: totalFare } },
            {
                $inc: { walletBalance: -totalFare },
                $push: {
                    walletTransactions: {
                        amount: totalFare,
                        transaction_type: 'DEBIT',
                        description: 'Train booking pending PNR',
                        date: new Date()
                    }
                }
            },
            { new: true }
        );

        if (!updatedUser) {
            const currentUser = await User.findById(req.user._id);
            const currentBal = currentUser ? currentUser.walletBalance : 0;
            if (currentBal < totalFare) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient wallet balance. Required: Rs.${totalFare}, Available: Rs.${currentBal}`
                });
            }
            return res.status(400).json({ success: false, message: 'Insufficient wallet balance or user not found' });
        }

        const allocatedPassengers = allocateSeats(passengers, travelClass);
        const pnr = generatePNR();

        if (updatedUser.walletTransactions && updatedUser.walletTransactions.length > 0) {
            const lastTx = updatedUser.walletTransactions[updatedUser.walletTransactions.length - 1];
            if (lastTx && lastTx.description && lastTx.description.includes('Train booking pending PNR')) {
                lastTx.description = `Train booking ${pnr}`;
                await updatedUser.save();
            }
        }

        const booking = new Booking({
            pnr,
            user: req.user._id,
            train: train._id,
            journeyDate: journeyDateObj,
            travelClass,
            passengers: allocatedPassengers,
            totalFare,
            fareBreakdown: {
                baseFare: baseFarePerPassenger * passengers.length,
                gst: gstAmount * passengers.length,
                discount: 0,
                finalFare: totalFare
            },
            status: 'Confirmed',
            paymentStatus: 'Completed',
            paymentMethod: paymentMethod || 'Wallet',
            contactDetails
        });

        const savedBooking = await booking.save();

        const userWithTx = await User.findById(req.user._id);
        if (userWithTx && userWithTx.walletTransactions && userWithTx.walletTransactions.length > 0) {
            const tx = userWithTx.walletTransactions[userWithTx.walletTransactions.length - 1];
            if (tx) {
                tx.booking_ref = savedBooking._id;
                await userWithTx.save();
            }
        }

        let ticketUrl = '';
        try {
            ticketUrl = await generateTicketPDF(savedBooking._id);
            savedBooking.ticketUrl = ticketUrl;
            await savedBooking.save();
        } catch (err) {
            console.error('Ticket PDF generation failed:', err);
        }

        if (userWithTx) {
            userWithTx.notifications.push({
                type: 'BOOKING_CONFIRMED',
                title: 'Booking Confirmed',
                message: `Your booking with PNR ${pnr} has been confirmed for ${train.name}`,
                read: false
            });
            await userWithTx.save();
        }

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.user._id}`).emit('notification:booking', {
                bookingId: savedBooking._id,
                pnr,
                message: `Your booking for ${train.name} is confirmed!`,
            });
        }

        res.status(201).json({
            success: true,
            message: 'Booking created successfully',
            booking: { ...savedBooking.toObject(), ticketUrl }
        });
    } catch (error) {
        console.error('[ERROR][CREATE_BOOKING] Booking creation error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

// Get available seats for a train and class
const getAvailableSeats = async (req, res) => {
    try {
        const { trainId, travelClass } = req.query;

        if (!trainId || !travelClass) {
            return res.status(400).json({ success: false, message: 'Missing parameters' });
        }

        const train = await Train.findById(trainId);
        if (!train) {
            return res.status(404).json({ success: false, message: 'Train not found' });
        }

        // Find seat availability for the class
        const availability = train.seatAvailability.find(s => s.classType === travelClass);

        if (!availability) {
            return res.status(404).json({ success: false, message: 'Class not available on this train' });
        }

        res.status(200).json({
            success: true,
            data: availability
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get user bookings
const getMyBookings = async (req, res) => {
    try {
        console.log('[DEBUG][GET_MY_BOOKINGS] User:', req.user ? req.user._id : null, 'Email:', req.user ? req.user.email : null);
        if (!req.user || !req.user._id) {
            console.error('[ERROR][GET_MY_BOOKINGS] User not authenticated');
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const bookings = await Booking.find({ user: req.user._id }).populate('train', 'name trainNumber departureTime arrivalTime');
        console.log('[DEBUG][GET_MY_BOOKINGS] Bookings found:', bookings.length, 'for user:', req.user._id, 'Bookings:', bookings);
        if (!bookings || bookings.length === 0) {
            console.warn('[WARN][GET_MY_BOOKINGS] No bookings found for user:', req.user._id);
        }
        // Add ticketUrl, trainName, date, and status for frontend compatibility
        const bookingsWithExtras = await Promise.all(bookings.map(async (b) => {
            const ticketUrl = await ensureBookingTicketUrl(b);
            return {
                ...b.toObject(),
                ticketUrl,
                trainName: b.train?.name || '',
                date: b.journeyDate,
                status: b.status
            };
        }));
        res.json(bookingsWithExtras);
    } catch (error) {
        console.error('[ERROR][GET_MY_BOOKINGS] Get bookings error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get booking by ID
// @route   GET /api/bookings/:id
// @access  Private
const getBookingById = async (req, res) => {
    try {
        console.log('[DEBUG][GET_BOOKING_BY_ID] Booking ID:', req.params.id);
        const booking = await Booking.findById(req.params.id).populate('user', 'name email').populate('train', 'name trainNumber source destination');
        console.log('[DEBUG][GET_BOOKING_BY_ID] Booking:', booking);

        if (booking) {
            const ticketUrl = await ensureBookingTicketUrl(booking);
            const bookingData = booking.toObject();
            bookingData.ticketUrl = ticketUrl;
            res.json(bookingData);
        } else {
            res.status(404).json({ message: 'Booking not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// @desc    Cancel booking
// @route   PUT /api/bookings/:id/cancel
// @access  Private
const cancelBooking = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        if (booking.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(401).json({ message: 'Not authorized to cancel this booking' });
        }

        if (booking.status === 'Cancelled' || booking.paymentStatus === 'Refunded') {
            return res.status(400).json({ message: 'Booking is already cancelled or refunded' });
        }

        const user = await User.findById(booking.user);
        const hasWalletDebit = user && (
            booking.paymentMethod === 'Wallet' ||
            !booking.paymentMethod ||
            (user.walletTransactions || []).some(t => t.booking_ref && t.booking_ref.toString() === booking._id.toString() && t.transaction_type === 'DEBIT')
        );

        let refundAmount = 0;
        if (hasWalletDebit) {
            refundAmount = booking.totalFare * 0.8;
        }

        booking.status = 'Cancelled';
        if (hasWalletDebit) {
            booking.paymentStatus = 'Refunded';
            booking.refundDetails = {
                refundAmount,
                refundReason: 'Booking cancellation',
                refundDate: new Date(),
                refundStatus: 'Processed'
            };
        }
        const updatedBooking = await booking.save();

        if (hasWalletDebit && user && refundAmount > 0) {
            user.walletBalance += refundAmount;
            user.walletTransactions.push({
                amount: refundAmount,
                transaction_type: 'CREDIT',
                description: `Refund for cancelled booking PNR: ${booking.pnr}`,
                booking_ref: booking._id,
                date: new Date()
            });
            user.notifications.push({
                type: 'REFUND_PROCESSED',
                title: 'Refund Processed',
                message: `Refund of Rs.${refundAmount} credited for cancelled booking PNR ${booking.pnr}`,
                read: false
            });
            await user.save();
        }

        try {
            const sendEmail = require('../utils/sendEmail');
            await sendEmail(
                req.user.email,
                'Booking Cancelled - RailConnect',
                `Your booking (PNR: ${booking.pnr}) has been cancelled.\n${hasWalletDebit ? `Refund Amount: Rs.${refundAmount} has been credited to your wallet.` : 'Booking cancelled.'}`
            );
        } catch (emailErr) {
            console.error('Cancellation email error:', emailErr);
        }

        res.json({ message: 'Booking Cancelled', refundAmount, updatedBooking });
    } catch (error) {
        console.error('Cancel booking error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Calculate Fare
// @route   GET /api/bookings/calculate-fare
// @access  Public
const calculateFareEndpoint = async (req, res) => {
    const { trainId, travelClass, passengerCount } = req.query;
    try {
        if (!trainId || !travelClass || !passengerCount) {
            return res.status(400).json({ success: false, message: 'Missing parameters' });
        }

        const count = parseInt(passengerCount, 10);
        if (isNaN(count) || count < 1) {
            return res.status(400).json({ success: false, message: 'Passenger count must be at least 1' });
        }

        const validClasses = ['1A', '2A', '3A', 'AC2', 'CC', 'SL', '2S', 'EC'];
        if (!validClasses.includes(travelClass)) {
            return res.status(400).json({ success: false, message: 'Invalid travel class' });
        }

        let train;
        if (require('mongoose').Types.ObjectId.isValid(trainId)) {
            train = await Train.findById(trainId);
        } else {
            return res.status(400).json({ success: false, message: 'Invalid train ID format' });
        }

        if (!train) {
            return res.status(404).json({ success: false, message: 'Train not found' });
        }

        const classAvailable = train.coachComposition.some(c => c.classType === travelClass);
        if (!classAvailable) {
            return res.status(400).json({ success: false, message: 'Travel class not available for this train' });
        }

        const fare = calculateBookingFare(train, travelClass, count);

        res.status(200).json({
            success: true,
            fare: {
                baseFare: fare.baseFare,
                passengerCount: fare.passengerCount,
                subtotal: fare.subtotal,
                gst: fare.gst,
                discount: fare.discount,
                totalFare: fare.totalFare,
                currency: 'INR',
                baseFarePerPassenger: fare.baseFarePerPassenger
            }
        });
    } catch (error) {
        console.error("[CALCULATE_FARE]", {
            trainId,
            travelClass,
            passengerCount,
            error: error.message
        });
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all bookings (Admin only)
// @route   GET /api/bookings/all
// @access  Private/Admin
const getAllBookings = async (req, res) => {
    try {
        const bookings = await Booking.find({})
            .populate('user', 'name email')
            .populate('train', 'name trainNumber source destination')
            .sort({ createdAt: -1 });

        res.json(bookings);
    } catch (error) {
        console.error('Error fetching all bookings:', error);
        res.status(500).json({
            message: 'Failed to fetch bookings',
            error: error.message,
            stack: error.stack
        });
    }
};

module.exports = { createBooking, getMyBookings, getBookingById, cancelBooking, getAllBookings, calculateFareEndpoint };
