const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { importKaggleData } = require('../services/historical');
const logger = require('../utils/logger');

async function run() {
    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');
    const isRebuild = args.includes('--rebuild');
    const isImport = args.includes('--import') || (!isDryRun && !isRebuild);

    const csvPath = path.join(__dirname, '../../data/kaggle/ir_train.csv');

    console.log('==================================================');
    console.log('KAGGLE HISTORICAL RAILWAY DATA IMPORTER');
    console.log('==================================================');
    console.log(`Source CSV: ${csvPath}`);
    console.log(`Mode: ${isDryRun ? 'DRY-RUN' : isRebuild ? 'REBUILD & IMPORT' : 'IMPORT'}`);

    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/railconnect';
    
    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB successfully.');

        const result = await importKaggleData(csvPath, {
            dryRun: isDryRun,
            rebuild: isRebuild
        });

        console.log('\n--------------------------------------------------');
        console.log('IMPORT EXECUTION RESULTS');
        console.log('--------------------------------------------------');
        console.log(JSON.stringify(result, null, 2));
        console.log('==================================================');

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Error during import execution:', err);
        try {
            await mongoose.disconnect();
        } catch (e) {}
        process.exit(1);
    }
}

run();
