const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');
const Staff = require('../models/Staff');
const bcrypt = require('bcryptjs');

(async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/rtms_db');
        console.log('--- DB INSPECTION START ---');

        const emails = [
            'passenger@example.com',
            'admin@example.com',
            'tte1@example.com'
        ];

        for (const email of emails) {
            let record = await User.findOne({ email }).select('+password');
            let collection = 'users';
            if (!record) {
                record = await Staff.findOne({ email }).select('+password');
                collection = 'staff';
            }

            if (!record) {
                console.log({ email, found: false });
                continue;
            }

            const pwd = record.password || '';
            const isBcrypt = pwd.startsWith('$2a$') || pwd.startsWith('$2b$');
            
            let defaultPass = '';
            if (email === 'passenger@example.com') defaultPass = 'password123';
            else if (email === 'admin@example.com') defaultPass = 'admin123';
            else if (email === 'tte1@example.com') defaultPass = 'tte12345';

            let matchesDefault = false;
            if (defaultPass && pwd) {
                try {
                    matchesDefault = await bcrypt.compare(defaultPass, pwd);
                } catch (e) {
                    matchesDefault = false;
                }
            }

            let matchesHashOfDefault = false;
            if (defaultPass && pwd) {
                try {
                    const singleHash = await bcrypt.hash(defaultPass, 10);
                    matchesHashOfDefault = await bcrypt.compare(singleHash, pwd);
                } catch (e) {
                    matchesHashOfDefault = false;
                }
            }

            console.log({
                email,
                collection,
                role: record.role || record.staffRole,
                passwordFieldPresent: !!pwd,
                passwordLength: pwd.length,
                isBcryptFormat: isBcrypt,
                matchesDefaultPlaintext: matchesDefault,
                matchesBcryptHashOfPlaintext: matchesHashOfDefault,
                status: matchesDefault ? 'Valid single hash' : (matchesHashOfDefault ? 'Double-hashed' : 'Incompatible / unknown hash')
            });
        }

        console.log('--- DB INSPECTION END ---');
        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Inspection error:', err);
        process.exit(1);
    }
})();
