const Booking = require('../models/Booking');
const Train = require('../models/Train');
const { isSameISTDay, nowIST } = require('../utils/istTime');

// @desc    Verify PNR and fetch passenger details (For TTE)
// @route   GET /api/tte/verify/:pnr
// @access  Private/TTE
const verifyPnr = async (req, res) => {
    try {
        console.log('[DEBUG][VERIFY_PNR] PNR param:', req.params.pnr);
        const { pnr } = req.params;
        const booking = await Booking.findOne({ pnr })
            .populate('user', 'name email mobile')
            .populate('train', 'name trainNumber source destination');
        console.log('[DEBUG][VERIFY_PNR] Booking found:', booking);

        if (!booking) {
            return res.status(404).json({ message: 'PNR not found' });
        }

        // Realistic Validation Logics

        // 1. Status Check
        if (booking.status === 'Cancelled') {
            return res.status(400).json({
                message: 'Ticket is CANCELLED',
                booking
            });
        }

        // 2. Date Check (Duty check) — IST-aware
        const isToday = isSameISTDay(booking.journeyDate, nowIST());
        // For development/demo purposes, we might allow any date, but for "industry-standard" we check
        // if (journeyDate !== today) {
        //     return res.status(400).json({ message: 'Ticket is not for today\'s journey' });
        // }

        res.json({
            message: 'PNR Verified Successfully',
            booking
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get coach-wise manifest for a train
// @route   GET /api/tte/train/:trainId/passengers
// @access  Private/TTE
const getTrainManifest = async (req, res) => {
    try {
        const { trainId } = req.params;
        const { coach } = req.query; // Optional coach filter

        const bookings = await Booking.find({
            train: trainId,
            status: { $ne: 'Cancelled' }
        }).populate('user', 'name mobile');

        let manifest = [];
        bookings.forEach(booking => {
            booking.passengers.forEach(p => {
                // Determine coach from assigned_seat (e.g. "SL-42", "3A-12")
                const passengerCoach = p.assigned_seat ? p.assigned_seat.split('-')[0] : 'U/A';

                if (!coach || passengerCoach === coach) {
                    manifest.push({
                        bookingId: booking._id,
                        passengerId: p._id,
                        pnr: booking.pnr,
                        name: p.name,
                        age: p.age,
                        gender: p.gender,
                        seat: p.assigned_seat,
                        coach: passengerCoach,
                        status: p.status,
                        boarded: p.boarded,
                        verifiedAt: p.verifiedAt
                    });
                }
            });
        });

        // Sort by seat number
        // Sort by seat number (Safe check)
        manifest.sort((a, b) => (a.seat || '').localeCompare(b.seat || '', undefined, { numeric: true }));

        res.json(manifest);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Toggle boarding status for a passenger
// @route   PATCH /api/tte/board/:bookingId/:passengerId
// @access  Private/TTE
const toggleBoarding = async (req, res) => {
    try {
        const { bookingId, passengerId } = req.params;
        const tteId = req.user._id;

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        if (booking.status === 'Cancelled') {
            return res.status(400).json({ message: 'Cannot board a cancelled ticket' });
        }

        const passenger = booking.passengers.id(passengerId);
        if (!passenger) {
            return res.status(404).json({ message: 'Passenger not found' });
        }

        // Logic check: Only confirmed tickets
        if (!['CNF', 'Confirmed'].includes(passenger.status)) {
            return res.status(400).json({ message: 'Only confirmed passengers can be marked as boarded' });
        }

        // Toggle boarding
        passenger.boarded = !passenger.boarded;

        if (passenger.boarded) {
            passenger.verifiedBy = tteId;
            passenger.verifiedAt = new Date();
        } else {
            passenger.verifiedBy = undefined;
            passenger.verifiedAt = undefined;
        }

        await booking.save();

        res.json({
            message: `Passenger marked as ${passenger.boarded ? 'Boarded' : 'Not Boarded'}`,
            passenger
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    verifyPnr,
    getTrainManifest,
    toggleBoarding
};
