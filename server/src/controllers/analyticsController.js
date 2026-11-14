const Booking = require('../models/Booking');
const User = require('../models/User');
const Train = require('../models/Train');
const ETAPrediction = require('../models/ETAPrediction');
const TrainRun = require('../models/TrainRun');
const OperationalEvent = require('../models/OperationalEvent');
const { sourceManager } = require('../live');
const axios = require('axios');

// @desc    Get Admin Dashboard Stats
// @route   GET /api/analytics/dashboard
// @access  Private/Admin
const getDashboardStats = async (req, res) => {
    try {
        const totalBookings = await Booking.countDocuments();
        const totalUsers = await User.countDocuments();
        const totalTrains = await Train.countDocuments();

        // Calculate Revenue
        const revenueAgg = await Booking.aggregate([
            { $match: { status: 'Confirmed' } }, // Only count confirmed bookings for revenue
            { $group: { _id: null, total: { $sum: "$totalFare" } } }
        ]);

        const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].total : 0;

        // Yield Distribution (by Class)
        const yieldAgg = await Booking.aggregate([
            {
                $group: {
                    _id: "$travelClass",
                    count: { $sum: 1 }
                }
            }
        ]);

        const yieldData = {
            ac: 0,
            sleeper: 0,
            general: 0
        };

        yieldAgg.forEach(item => {
            if (['1A', '2A', '3A', 'AC2', 'CC', 'EC'].includes(item._id)) {
                yieldData.ac += item.count;
            } else if (['SL'].includes(item._id)) {
                yieldData.sleeper += item.count;
            } else {
                yieldData.general += item.count;
            }
        });

        // Asset Utilization (Bookings per month for last 5 months in IST)
        const { nowIST } = require('../utils/istTime');
        const istNow = nowIST();
        const fiveMonthsAgo = new Date(istNow);
        fiveMonthsAgo.setMonth(fiveMonthsAgo.getMonth() - 4);
        fiveMonthsAgo.setDate(1); // Start from the 1st of that month
        fiveMonthsAgo.setHours(0, 0, 0, 0);

        const utilizationAgg = await Booking.aggregate([
            {
                $match: {
                    createdAt: { $gte: fiveMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        month: { $month: { date: "$createdAt", timezone: "Asia/Kolkata" } },
                        year: { $year: { date: "$createdAt", timezone: "Asia/Kolkata" } }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const utilizationLabels = [];
        const utilizationValues = [];

        // Fill in the last 5 months (including current)
        for (let i = 4; i >= 0; i--) {
            const d = new Date(istNow);
            d.setMonth(d.getMonth() - i);
            const m = d.getMonth();
            const y = d.getFullYear();
            const monthName = months[m];
            utilizationLabels.push(monthName);

            const found = utilizationAgg.find(u => u._id.month === (m + 1) && u._id.year === y);
            utilizationValues.push(found ? found.count : 0);
        }

        // Recent Bookings
        const recentBookings = await Booking.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('user', 'name email')
            .populate('train', 'trainNumber name');

        res.json({
            totalBookings,
            totalUsers,
            totalTrains,
            totalRevenue,
            recentBookings,
            yield: yieldData,
            utilization: utilizationValues,
            utilizationLabels: utilizationLabels
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getEtaAnalytics = async (req, res) => {
    try {
        const stats = await ETAPrediction.aggregate([
            { $match: { actualArrival: { $ne: null } } },
            {
                $group: {
                    _id: null,
                    count: { $sum: 1 },
                    avgAbsoluteError: { $avg: "$absoluteError" },
                    mse: { $avg: { $multiply: ["$error", "$error"] } }
                }
            },
            {
                $project: {
                    _id: 0,
                    count: 1,
                    mae: "$avgAbsoluteError",
                    rmse: { $sqrt: "$mse" }
                }
            }
        ]);

        res.json(stats.length > 0 ? stats[0] : { count: 0, mae: 0, rmse: 0 });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getOpsDashboardStats = async (req, res) => {
    try {
        const activeTrains = await Train.countDocuments({ "currentState.isRunning": true });
        const activeEvents = await OperationalEvent.countDocuments({ isActive: true });
        const delayedTrains = await Train.countDocuments({ status: 'Delayed' });
        
        res.json({
            activeTrains,
            activeEvents,
            delayedTrains
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 1. ETA Accuracy Dashboard
const getEtaAccuracyDashboard = async (req, res) => {
    try {
        const matchStage = { $match: { actualArrival: { $ne: null } } };
        
        const summaryAgg = await ETAPrediction.aggregate([
            matchStage,
            {
                $group: {
                    _id: null,
                    predictionCount: { $sum: 1 },
                    mae: { $avg: "$absoluteError" },
                    mse: { $avg: { $multiply: ["$error", "$error"] } }
                }
            },
            {
                $project: {
                    _id: 0,
                    predictionCount: 1,
                    mae: { $ifNull: ["$mae", 0] },
                    rmse: { $sqrt: { $ifNull: ["$mse", 0] } },
                    averageAbsoluteError: { $ifNull: ["$mae", 0] }
                }
            }
        ]);

        const summary = summaryAgg.length > 0 ? summaryAgg[0] : { predictionCount: 0, mae: 0, rmse: 0, averageAbsoluteError: 0 };

        // Performance by station
        const byStation = await ETAPrediction.aggregate([
            matchStage,
            {
                $group: {
                    _id: "$targetStation",
                    count: { $sum: 1 },
                    mae: { $avg: "$absoluteError" }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        // Performance by train
        const byTrain = await ETAPrediction.aggregate([
            matchStage,
            {
                $group: {
                    _id: "$trainNumber",
                    count: { $sum: 1 },
                    mae: { $avg: "$absoluteError" }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        // Recent predictions for Scheduled vs Actual vs AI Predicted comparison
        const recentPredictions = await ETAPrediction.find({ actualArrival: { $ne: null } })
            .sort({ predictionTime: -1 })
            .limit(20)
            .select('trainNumber targetStation predictionTime predictedArrival actualArrival error absoluteError');

        res.json({
            summary,
            byStation,
            byTrain,
            recentPredictions,
            hasData: summary.predictionCount > 0
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 3. Bottleneck Leaderboard
const getBottleneckLeaderboard = async (req, res) => {
    try {
        // Aggregate section delays from TrainRun
        const sectionDelays = await TrainRun.aggregate([
            { $unwind: "$sectionLogs" },
            {
                $group: {
                    _id: {
                        from: "$sectionLogs.fromStation",
                        to: "$sectionLogs.toStation"
                    },
                    totalDelay: { $sum: { $ifNull: ["$sectionLogs.actualTravelTime", 0] } },
                    avgDelay: { $avg: { $subtract: ["$sectionLogs.actualTravelTime", "$sectionLogs.scheduledTravelTime"] } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { avgDelay: -1 } },
            { $limit: 10 }
        ]);

        // Active operational events
        const activeEvents = await OperationalEvent.find({ isActive: true })
            .select('eventType affectedSection severity description startTime');

        res.json({
            sections: sectionDelays,
            activeEvents
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 4. Delay Analytics
const getDelayAnalytics = async (req, res) => {
    try {
        const delaySummary = await TrainRun.aggregate([
            {
                $group: {
                    _id: null,
                    avgDelay: { $avg: "$overallDelay" },
                    maxDelay: { $max: "$overallDelay" }
                }
            }
        ]);

        const delayCauses = await TrainRun.aggregate([
            { $unwind: "$sectionLogs" },
            { $unwind: "$sectionLogs.delays" },
            {
                $group: {
                    _id: "$sectionLogs.delays.cause",
                    totalDuration: { $sum: "$sectionLogs.delays.duration" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { totalDuration: -1 } }
        ]);

        res.json({
            summary: delaySummary.length > 0 ? delaySummary[0] : { avgDelay: 0, maxDelay: 0 },
            causes: delayCauses
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 5. Full Operations Dashboard
const getOperationsDashboard = async (req, res) => {
    try {
        const activeTrainsList = await Train.find({ "currentState.isRunning": true })
            .select('trainNumber name type currentState status delayMinutes');
        
        const activeEventsList = await OperationalEvent.find({ isActive: true });
        const delayedTrainsCount = await Train.countDocuments({ status: 'Delayed' });
        const atRiskTrains = await Train.find({ delayMinutes: { $gt: 15 }, "currentState.isRunning": true })
            .select('trainNumber name delayMinutes currentState');

        let etaPredictionHealth = {
            status: 'Optimal',
            confidence: 0.94,
            latencyMs: 42
        };
        try {
            const start = Date.now();
            const infRes = await axios.get(`${process.env.ETA_INFERENCE_URL || 'http://127.0.0.1:8001'}/health`, { timeout: 2000 });
            const latencyMs = Date.now() - start;
            etaPredictionHealth = {
                status: infRes.data.modelLoaded ? 'Optimal' : 'Degraded',
                confidence: 0.94,
                latencyMs
            };
        } catch (err) {
            etaPredictionHealth = {
                status: 'Degraded / Unavailable',
                confidence: 0.0,
                latencyMs: 0
            };
        }

        const sourceStatuses = sourceManager ? sourceManager.getSourceStatus() : {};
        const dataSourceHealth = {
            simulator: sourceStatuses.SIMULATOR?.available ? 'Connected' : 'Disconnected',
            rtis: sourceStatuses.OFFICIAL_RAILWAY?.configured ? 'Connected' : 'Standby',
            ntes: sourceStatuses.OFFICIAL_RAILWAY?.configured ? 'Connected' : 'Unavailable',
            activeSource: sourceManager ? sourceManager.getActiveSourceLabel() : 'Simulator Mode'
        };

        res.json({
            activeTrainsCount: activeTrainsList.length,
            activeTrains: activeTrainsList,
            activeEvents: activeEventsList,
            delayedTrainsCount,
            atRiskTrains,
            etaPredictionHealth,
            dataSourceHealth
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { 
    getDashboardStats, 
    getEtaAnalytics, 
    getOpsDashboardStats,
    getEtaAccuracyDashboard,
    getBottleneckLeaderboard,
    getDelayAnalytics,
    getOperationsDashboard
};
