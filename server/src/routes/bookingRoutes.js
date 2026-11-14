const express = require('express');
const router = express.Router();
const { createBooking, getMyBookings, getBookingById, cancelBooking } = require('../controllers/bookingController');
const { protect } = require('../middleware/authMiddleware');
const { getAllBookings, calculateFareEndpoint } = require('../controllers/bookingController');
const { admin } = require('../middleware/authMiddleware');

// POST routes
router.post('/', protect, createBooking);
router.post('/:id/cancel', protect, cancelBooking);
router.put('/:id/cancel', protect, cancelBooking);

// GET routes - specific paths BEFORE /:id
router.get('/my', protect, getMyBookings);
router.get('/mybookings', protect, getMyBookings);
router.get('/calculate-fare', protect, calculateFareEndpoint);
router.get('/all', protect, admin, getAllBookings);

// GET by ID route - LAST because it catches everything
router.get('/:id', protect, getBookingById);

module.exports = router;
