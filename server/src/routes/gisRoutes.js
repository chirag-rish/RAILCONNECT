const express = require('express');
const router = express.Router();
const {
  getStations,
  getActiveTrains,
  getRouteGeometry,
  getSectionCongestion,
  getOverview,
} = require('../controllers/gisController');

router.get('/stations', getStations);
router.get('/trains', getActiveTrains);
router.get('/routes', getRouteGeometry);
router.get('/congestion', getSectionCongestion);
router.get('/overview', getOverview);

module.exports = router;
