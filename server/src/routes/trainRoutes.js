const express = require('express');
const router = express.Router();
const { addTrain, searchTrains, getTrains, updateTrain, deleteTrain } = require('../controllers/trainController');
const {
  getTrainTracking,
  getTrainDetails,
  getTrainAvailability,
  getAllTrains
} = require('../controllers/trainControllerPhase3');
const { protect, admin } = require('../middleware/authMiddleware');

// Existing routes
router.route('/').post(protect, admin, addTrain).get(getTrains);
router.route('/:id').delete(protect, admin, deleteTrain).put(protect, admin, updateTrain);
router.get('/search', searchTrains);

// Phase 3 routes (Live tracking and availability)
router.get('/:trainNumber/tracking', protect, getTrainTracking);
router.get('/:trainNumber/details', protect, getTrainDetails);
router.get('/:trainNumber/availability', protect, getTrainAvailability);

module.exports = router;
