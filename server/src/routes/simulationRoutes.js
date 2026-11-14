const express = require('express');
const router = express.Router();
const { getStatus, startSim, stopSim, injectEvent, clearEvents } = require('../controllers/simulationController');
const { protect, admin } = require('../middleware/authMiddleware');

router.get('/status', getStatus);
router.post('/start', protect, admin, startSim);
router.post('/stop', protect, admin, stopSim);
router.post('/event', protect, admin, injectEvent);
router.post('/clear-events', protect, admin, clearEvents);

module.exports = router;
