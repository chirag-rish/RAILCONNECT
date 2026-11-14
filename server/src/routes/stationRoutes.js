const express = require('express');
const router = express.Router();
const { 
  addStation, 
  getStations, 
  getLiveStation,
  getStationStatus,
  searchTrains,
  autocompleteStations
} = require('../controllers/stationController');
const { protect, admin } = require('../middleware/authMiddleware');

// Existing routes
router.route('/').post(protect, admin, addStation).get(getStations);
router.get('/live/:code', getLiveStation);

// Phase 3 routes (Live status and search)
router.get('/autocomplete', autocompleteStations);
router.get('/search', searchTrains);
router.get('/:stationCode/status', protect, getStationStatus);

module.exports = router;
