const express = require('express');
const router = express.Router();
const {
    verifyPnr,
    getTrainManifest,
    toggleBoarding
} = require('../controllers/tteController');
const { protect, staff } = require('../middleware/authMiddleware');

// All TTE routes are protected and require TTE/Admin role
router.use(protect);
router.use(staff);

router.get('/verify/:pnr', verifyPnr);
router.get('/train/:trainId/passengers', getTrainManifest);
router.patch('/board/:bookingId/:passengerId', toggleBoarding);

module.exports = router;
