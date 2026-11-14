const express = require('express');
const router = express.Router();
const { createUser, getUsers, deleteUser } = require('../controllers/adminController');
const { protect, admin } = require('../middleware/authMiddleware');

// Admin-only endpoints
router.get('/users', protect, admin, getUsers);
router.post('/users', protect, admin, createUser);
router.delete('/users/:id', protect, admin, deleteUser);

module.exports = router;
