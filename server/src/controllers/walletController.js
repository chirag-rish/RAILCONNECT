const User = require('../models/User');

// @desc    Get Wallet Balance & Transactions
// @route   GET /api/wallet
// @access  Private
const getWallet = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const user = await User.findById(req.user._id).select('walletBalance walletTransactions');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const totalSpent = (user.walletTransactions || [])
            .filter((t) => t.transaction_type === 'DEBIT')
            .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
        const totalAdded = (user.walletTransactions || [])
            .filter((t) => t.transaction_type === 'CREDIT')
            .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

        const mappedTransactions = (user.walletTransactions || []).map(t => ({
            _id: t._id,
            type: t.transaction_type ? t.transaction_type.toLowerCase() : 'credit',
            amount: t.amount,
            description: t.description,
            createdAt: t.date || t.createdAt || new Date()
        }));

        res.json({
            balance: user.walletBalance || 0,
            walletBalance: user.walletBalance || 0,
            totalSpent,
            totalAdded,
            transactions: mappedTransactions
        });
    } catch (error) {
        console.error('Wallet error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Add Money to Wallet
// @route   POST /api/wallet/add
// @access  Private
const addMoney = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const { amount } = req.body;
        const value = Number(amount);

        if (!value || value <= 0) {
            return res.status(400).json({ message: 'Invalid amount' });
        }

        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.walletBalance += value;
        user.walletTransactions.push({
            amount: value,
            transaction_type: 'CREDIT',
            description: 'Added money to wallet'
        });

        const mappedTransactions = (user.walletTransactions || []).map(t => ({
            _id: t._id,
            type: t.transaction_type ? t.transaction_type.toLowerCase() : 'credit',
            amount: t.amount,
            description: t.description,
            createdAt: t.date || t.createdAt || new Date()
        }));

        await user.save();
        res.json({ message: 'Money Added', balance: user.walletBalance, transactions: mappedTransactions });
    } catch (error) {
        console.error('Add money error:', error);
        res.status(500).json({ message: error.message });
    }
};

const getTransactions = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const user = await User.findById(req.user._id).select('walletTransactions');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const mappedTransactions = (user.walletTransactions || []).map(t => ({
            _id: t._id,
            type: t.transaction_type ? t.transaction_type.toLowerCase() : 'credit',
            amount: t.amount,
            description: t.description,
            createdAt: t.date || t.createdAt || new Date()
        }));

        res.json({ transactions: mappedTransactions });
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ message: error.message });
    }
};

const processPayment = async (req, res) => {
    res.json({ message: 'Payment processed stub' });
};

const requestRefund = async (req, res) => {
    res.json({ message: 'Refund requested stub' });
};

module.exports = { getWallet, addMoney, getTransactions, processPayment, requestRefund };
