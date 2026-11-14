const express = require('express');
const router = express.Router();
const {
  chat,
  streamChat,
  getRecommendations,
  predictPrice,
  findOptimalRoute,
  getProviderStatus,
  getWebStatus,
  getWeatherData
} = require('../controllers/aiController');
const { protect } = require('../middleware/authMiddleware');

// Main chat endpoint (standard JSON response)
router.post('/chat', protect, chat);

// SSE streaming endpoint
router.post('/stream', protect, streamChat);

// Utility endpoints
router.get('/web-status', getWebStatus);
router.get('/recommendations', protect, getRecommendations);
router.post('/predict-price', predictPrice);
router.post('/optimal-route', findOptimalRoute);
router.get('/optimal-route', findOptimalRoute);
router.get('/provider-status', protect, getProviderStatus);
router.get('/weather', protect, getWeatherData);

module.exports = router;
