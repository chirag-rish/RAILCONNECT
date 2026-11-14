const express = require('express');
const router = express.Router();
const { 
    getDashboardStats, 
    getEtaAnalytics, 
    getOpsDashboardStats,
    getEtaAccuracyDashboard,
    getBottleneckLeaderboard,
    getDelayAnalytics,
    getOperationsDashboard
} = require('../controllers/analyticsController');
const { protect, admin } = require('../middleware/authMiddleware');

router.get('/dashboard', protect, admin, getDashboardStats);
router.get('/eta-analytics', protect, admin, getEtaAnalytics);
router.get('/ops-dashboard', protect, admin, getOpsDashboardStats);
router.get('/eta-accuracy', protect, admin, getEtaAccuracyDashboard);
router.get('/bottlenecks', protect, admin, getBottleneckLeaderboard);
router.get('/delays', protect, admin, getDelayAnalytics);
router.get('/operations', protect, admin, getOperationsDashboard);

module.exports = router;
