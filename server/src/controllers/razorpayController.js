const Razorpay = require('razorpay');
const crypto = require('crypto');
const Booking = require('../models/Booking');
const Wallet = require('../models/Wallet');

const getRazorpay = () => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        throw new Error('Razorpay API keys not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env');
    }

    return new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
    });
};

// @desc    Create Razorpay order for booking payment
// @route   POST /api/payment/create-order
// @access  Private
const createOrder = async (req, res) => {
    try {
        const razorpay = getRazorpay();
        const { amount, bookingId, currency = 'INR' } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Invalid amount' });
        }

        const options = {
            amount: Math.round(amount * 100), // Razorpay expects paise
            currency,
            receipt: `booking_${bookingId}_${Date.now()}`,
            notes: {
                bookingId,
                userId: req.user._id.toString(),
            },
        };

        const order = await razorpay.orders.create(options);

        res.json({
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: process.env.RAZORPAY_KEY_ID,
        });
    } catch (error) {
        console.error('Razorpay create order error:', error);
        res.status(500).json({ message: 'Payment initiation failed' });
    }
};

// @desc    Verify payment signature after Razorpay callback
// @route   POST /api/payment/verify
// @access  Private
const verifyPayment = async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            bookingId,
        } = req.body;

        // Step 1: Verify HMAC signature
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ message: 'Payment verification failed: invalid signature' });
        }

        // Step 2: Mark booking as paid
        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        booking.paymentStatus = 'Completed';
        booking.status = 'Booked';
        booking.razorpayOrderId = razorpay_order_id;
        booking.razorpayPaymentId = razorpay_payment_id;
        await booking.save();

        res.json({ success: true, bookingId, message: 'Payment verified and booking confirmed' });
    } catch (error) {
        console.error('Razorpay verify error:', error);
        res.status(500).json({ message: 'Payment verification error' });
    }
};

// @desc    Process Razorpay refund
// @route   POST /api/payment/refund
// @access  Private
const processRefund = async (req, res) => {
    try {
        const razorpay = getRazorpay();
        const { bookingId } = req.body;

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        if (!booking.razorpayPaymentId) {
            return res.status(400).json({ message: 'No payment found for this booking' });
        }

        if (booking.status !== 'Cancelled') {
            return res.status(400).json({ message: 'Booking must be cancelled before refund' });
        }

        // 80% refund policy
        const refundAmount = Math.round(booking.totalFare * 0.8 * 100); // in paise

        const refund = await razorpay.payments.refund(booking.razorpayPaymentId, {
            amount: refundAmount,
            notes: { bookingId, reason: 'Cancellation refund' },
        });

        // Also credit wallet with refund
        await Wallet.findOneAndUpdate(
            { user: booking.user },
            {
                $inc: { balance: refundAmount / 100 },
                $push: {
                    transactions: {
                        type: 'refund',
                        amount: refundAmount / 100,
                        description: `Refund for booking PNR: ${booking.pnr}`,
                        date: new Date(),
                    },
                },
            },
            { upsert: true }
        );

        res.json({
            success: true,
            refundId: refund.id,
            refundAmount: refundAmount / 100,
            message: 'Refund processed successfully',
        });
    } catch (error) {
        console.error('Razorpay refund error:', error);
        res.status(500).json({ message: 'Refund processing failed' });
    }
};

// @desc    Wallet top-up via Razorpay
// @route   POST /api/payment/wallet-topup
// @access  Private
const walletTopup = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ message: 'Payment verification failed' });
        }

        await Wallet.findOneAndUpdate(
            { user: req.user._id },
            {
                $inc: { balance: amount },
                $push: {
                    transactions: {
                        type: 'credit',
                        amount,
                        description: `Wallet top-up via Razorpay`,
                        date: new Date(),
                    },
                },
            },
            { upsert: true, new: true }
        );

        res.json({ success: true, message: `₹${amount} added to wallet` });
    } catch (error) {
        res.status(500).json({ message: 'Wallet top-up failed' });
    }
};

module.exports = { createOrder, verifyPayment, processRefund, walletTopup };