const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createOrder,
  verifyPayment,
  processRefund,
  walletTopup,
} = require('../controllers/razorpayController');

router.post('/create-order', protect, createOrder);
router.post('/verify', protect, verifyPayment);
router.post('/refund', protect, processRefund);
router.post('/wallet-topup', protect, walletTopup);

module.exports = router;
