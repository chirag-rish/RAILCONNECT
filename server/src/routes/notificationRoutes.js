const express = require('express');
const router = express.Router();
const { getNotifications, markNotificationRead } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getNotifications);
router.get('/:notificationId/read', protect, markNotificationRead);
router.post('/:notificationId/read', protect, markNotificationRead);

module.exports = router;
