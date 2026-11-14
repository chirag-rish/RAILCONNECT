const express = require('express');
const router = express.Router();
const { getHealth, getSummary, getTrainProfile } = require('../controllers/historicalController');

router.get('/health', getHealth);
router.get('/summary', getSummary);
router.get('/train/:trainNumber', getTrainProfile);

module.exports = router;
