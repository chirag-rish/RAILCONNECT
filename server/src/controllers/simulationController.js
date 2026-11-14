const { startSimulation, stopSimulation } = require('../utils/trainSimulator');
const OperationalEvent = require('../models/OperationalEvent');

const getStatus = (req, res) => {
    res.json({
        status: 'Simulation API running',
        multiplier: Number(process.env.SIMULATION_SPEED) || 1
    });
};

const startSim = (req, res) => {
    startSimulation();
    res.json({ message: 'Simulation started' });
};

const stopSim = (req, res) => {
    stopSimulation();
    res.json({ message: 'Simulation stopped' });
};

const injectEvent = async (req, res) => {
    try {
        const { eventType, fromStation, toStation, speedLimit, estimatedDuration, severity, description } = req.body;
        const event = await OperationalEvent.create({
            eventType,
            affectedSection: { fromStation, toStation },
            affectedStations: [fromStation, toStation].filter(Boolean),
            speedLimit,
            estimatedDuration,
            severity,
            description,
            startTime: new Date(),
            isActive: true
        });
        res.status(201).json({ message: 'Operational event injected', event });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const clearEvents = async (req, res) => {
    try {
        await OperationalEvent.updateMany({ isActive: true }, { $set: { isActive: false, endTime: new Date() } });
        res.json({ message: 'All operational events cleared' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getStatus,
    startSim,
    stopSim,
    injectEvent,
    clearEvents
};
