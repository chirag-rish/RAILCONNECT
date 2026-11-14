const express = require('express');
const router = express.Router();
const { loginUser, registerUser, getUserProfile, forgotPassword, resetPassword } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/profile', protect, getUserProfile);
router.post('/forgotpassword', forgotPassword);
router.post('/forgot-password', forgotPassword);
router.get('/forgotpassword', (req, res) => res.json({ message: 'Forgot password endpoint found! Note: Actual reset requires a POST request with your email.' }));
router.get('/forgot-password', (req, res) => res.json({ message: 'Forgot password endpoint found! Note: Actual reset requires a POST request with your email.' }));
router.put('/resetpassword/:resettoken', resetPassword);
router.get('/ping', (req, res) => res.json({ message: 'Auth routes active' }));

module.exports = router;