const User = require('../models/User');

// Create a user (admin or staff) - only accessible by admin
const createUser = async (req, res) => {
    try {
        const { name, email, password, mobile, role } = req.body;

        // Only allow admin/staff roles via this endpoint
        const allowedRoles = ['admin', 'tte'];
        if (!allowedRoles.includes(role)) {
            return res.status(400).json({ message: 'Invalid role. Allowed: admin, tte.' });
        }

        if (!name || !email || !password || !mobile) {
            return res.status(400).json({ message: 'Please provide all required fields' });
        }

        const userExists = await User.findOne({ $or: [{ email }, { mobile }] });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists with this email or mobile' });
        }

        const user = await User.create({ name, email, password, mobile, role });

        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Get all users
const getUsers = async (req, res) => {
    try {
        const users = await User.find({}).select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Delete a user
const deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (user) {
            await user.deleteOne();
            res.json({ message: 'User removed' });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { createUser, getUsers, deleteUser };
