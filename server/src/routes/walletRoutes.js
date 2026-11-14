const express = require('express');
const router = express.Router();
const { 
  getWallet, 
  addMoney,
  getTransactions,
  processPayment,
  requestRefund
} = require('../controllers/walletController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getWallet);
router.post('/add', protect, addMoney);
router.get('/transactions', protect, getTransactions);
router.post('/pay', protect, processPayment);
router.post('/refund', protect, requestRefund);

module.exports = router;
