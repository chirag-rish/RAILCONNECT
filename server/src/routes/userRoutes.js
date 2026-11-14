const express = require('express');
const router = express.Router();
const { getUsers, deleteUser, getNotifications, markNotificationRead, getPassengerDashboard } = require('../controllers/userController');
const { protect, admin } = require('../middleware/authMiddleware');

router.route('/notifications').get(protect, getNotifications);
router.route('/notifications/:notificationId/read').post(protect, markNotificationRead);
router.route('/dashboard').get(protect, getPassengerDashboard);

router.route('/').get(protect, admin, getUsers);
router.route('/:id').delete(protect, admin, deleteUser);

module.exports = router;
