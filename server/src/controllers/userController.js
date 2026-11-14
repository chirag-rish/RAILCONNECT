const User = require('../models/User');
const Booking = require('../models/Booking');

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
const getUsers = async (req, res) => {
    try {
        const users = await User.find({}).select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
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

// @desc    Get user notifications
// @route   GET /api/notifications or GET /api/users/notifications
// @access  Private
const getNotifications = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ success: true, notifications: user.notifications || [] });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Mark notification as read
// @route   POST /api/users/notifications/:notificationId/read
// @access  Private
const markNotificationRead = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        const notif = user.notifications.id(req.params.notificationId);
        if (notif) {
            notif.read = true;
            await user.save();
        }
        res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get passenger dashboard
// @route   GET /api/users/dashboard
// @access  Private
const getPassengerDashboard = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const bookings = await Booking.find({ user: userId }).populate('train', 'name trainNumber source destination').sort({ createdAt: -1 });

        const totalBookings = bookings.length;
        const completedBookings = bookings.filter(b => b.status === 'Completed' || b.status === 'Confirmed').length;
        const upcomingBookings = bookings.filter(b => b.status === 'Confirmed' || b.status === 'Pending').length;

        let acCount = 0, sleeperCount = 0, generalCount = 0;
        bookings.forEach(b => {
            if (b.classType?.includes('1A') || b.classType?.includes('2A') || b.classType?.includes('3A') || b.classType?.includes('CC')) {
                acCount++;
            } else if (b.classType?.includes('SL') || b.classType?.includes('Sleeper')) {
                sleeperCount++;
            } else {
                generalCount++;
            }
        });
        const totalCl = acCount + sleeperCount + generalCount || 1;
        const yieldData = {
            ac: Math.round((acCount / totalCl) * 100) || 25,
            sleeper: Math.round((sleeperCount / totalCl) * 100) || 55,
            general: Math.round((generalCount / totalCl) * 100) || 20
        };

        const recentBookings = bookings.slice(0, 5);

        res.json({
            success: true,
            data: {
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    mobile: user.mobile
                },
                walletBalance: user.walletBalance || 0,
                statistics: {
                    totalBookings,
                    completedBookings,
                    upcomingBookings
                },
                yield: yieldData,
                utilization: [60, 70, 80, 75, 90],
                recentBookings
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getUsers, deleteUser, getNotifications, markNotificationRead, getPassengerDashboard };
