const dotenv = require('dotenv');
// Load env vars FIRST before importing anything else
dotenv.config({ override: true });

const connectDB = require('./src/config/db');
const { startSimulation, setIo: setSimulatorIo } = require('./src/utils/trainSimulator');
const { app, server, io } = require('./src/app');
const { initLiveCore } = require('./src/live');
const logger = require('./src/utils/logger');

// Start listening immediately to keep the event loop alive,
// then sequence DB connection and simulator startup.
if (require.main === module) {
    const PORT = process.env.PORT || 5000;

    server.listen(PORT, () => {
        logger.info('Server started', { port: PORT });
    });

    server.on('error', (err) => {
        console.error('Server listen error:', err);
        process.exit(1);
    });

    (async () => {
        try {
            await connectDB();

            // Initialize Phase 5A live-data core (tracker + source manager + Socket.io)
            await initLiveCore(io);

            // Initialize simulator with Socket.io (simulator emits through tracker)
            setSimulatorIo(io);
            await startSimulation();
        } catch (err) {
            console.error('Startup error:', err);
            process.exit(1);
        }
    })();
}

module.exports = app;

