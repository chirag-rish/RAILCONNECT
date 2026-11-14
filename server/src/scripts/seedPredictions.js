const mongoose = require('mongoose');
require('dotenv').config();
const ETAPrediction = require('../models/ETAPrediction');
const Train = require('../models/Train');

const seedPredictions = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/rtms_db');
        console.log('MongoDB Connected for ETAPrediction seeding');

        // Clear existing predictions
        await ETAPrediction.deleteMany({});
        console.log('Cleared existing ETAPredictions');

        const trains = await Train.find({});
        if (trains.length === 0) {
            console.log('No trains found. Please run seed script first.');
            process.exit(1);
        }

        const predictions = [];
        const stations = ['NDLS', 'BCT', 'HWH', 'MAS', 'SBC', 'CST', 'PUNE', 'BZA', 'LKO', 'JAI'];

        for (let i = 0; i < 50; i++) {
            const train = trains[i % trains.length];
            const targetStation = stations[Math.floor(Math.random() * stations.length)];
            const predictionTime = new Date();
            predictionTime.setHours(predictionTime.getHours() - Math.floor(Math.random() * 24));
            
            const predictedDelay = Math.floor(Math.random() * 30); // 0-30 min delay
            const actualDelay = predictedDelay + (Math.floor(Math.random() * 10) - 5); // delay +/- 5 mins
            const error = actualDelay - predictedDelay;
            const absoluteError = Math.abs(error);

            const predictedArrival = new Date(predictionTime);
            predictedArrival.setMinutes(predictedArrival.getMinutes() + 120 + predictedDelay);

            const actualArrival = new Date(predictionTime);
            actualArrival.setMinutes(actualArrival.getMinutes() + 120 + actualDelay);

            predictions.push({
                train: train._id,
                trainNumber: train.trainNumber,
                predictionTime,
                targetStation,
                predictedArrival,
                actualArrival,
                predictedDelay,
                actualDelay,
                error,
                absoluteError,
                stationsAway: Math.floor(Math.random() * 5) + 1,
                confidence: parseFloat((0.8 + Math.random() * 0.18).toFixed(2))
            });
        }

        await ETAPrediction.insertMany(predictions);
        console.log(`Seeded ${predictions.length} ETAPredictions successfully!`);
        process.exit(0);
    } catch (error) {
        console.error('Error seeding predictions:', error);
        process.exit(1);
    }
};

seedPredictions();
