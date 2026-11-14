/**
 * SIH26028 — ETA Prediction Routes
 *
 * Endpoints:
 *   POST /api/eta/predict         — Direct feature-based prediction
 *   POST /api/eta/predict/section — Predict for a known section
 *   GET  /api/eta/train/:trainId  — Train-based prediction
 *   GET  /api/eta/health          — Inference service health check
 */

const express = require('express');
const router = express.Router();
const {
    predictSectionDelay,
    predictSection,
    predictForTrain,
    predictTrainStations,
    healthCheck,
} = require('../controllers/etaController');
const { protect } = require('../middleware/authMiddleware');

// Health check — public (no auth required)
router.get('/health', healthCheck);

// Direct feature prediction — requires auth
router.post('/predict', protect, predictSectionDelay);

// Section-based prediction — requires auth
router.post('/predict/section', protect, predictSection);

// Train-based prediction (supports both ObjectId and train number) — requires auth
router.get('/train/:trainId', protect, predictForTrain);

// Station-by-station ETA prediction for a train — requires auth
router.get('/train/:trainId/stations', protect, predictTrainStations);

module.exports = router;
