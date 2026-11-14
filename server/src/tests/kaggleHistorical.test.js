const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs');
const path = require('path');
const { 
    kaggleSchema, 
    importKaggleData, 
    getTrainHistoricalProfile, 
    getRouteHistoricalProfile, 
    getHistoricalDelayContext,
    getHistoricalEtaContext,
    getHistoricalSummary,
    getHistoricalHealth
} = require('../services/historical');
const HistoricalTrainProfile = require('../models/HistoricalTrainProfile');
const HistoricalRouteProfile = require('../models/HistoricalRouteProfile');

jest.setTimeout(30000);

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await HistoricalTrainProfile.deleteMany({});
    await HistoricalRouteProfile.deleteMany({});
});

describe('Kaggle Historical Data Layer Unit & Integration Tests', () => {

    it('1. schema validation - validates correct header and rejects incorrect header', () => {
        const validRes = kaggleSchema.validateHeader(kaggleSchema.EXPECTED_COLUMNS);
        expect(validRes.valid).toBe(true);

        const invalidRes = kaggleSchema.validateHeader(['journey_id', 'train_number']);
        expect(invalidRes.valid).toBe(false);
    });

    it('2. leakage columns rejected - checkLeakageProtection identifies leakage columns', () => {
        const safeList = ['train_number', 'train_type', 'departure_hour', 'distance_km', 'is_delayed'];
        expect(kaggleSchema.checkLeakageProtection(safeList)).toBe(true);

        const leakageList1 = ['train_number', 'primary_delay_cause'];
        expect(kaggleSchema.checkLeakageProtection(leakageList1)).toBe(false);

        const leakageList2 = ['train_number', 'delay_minutes'];
        expect(kaggleSchema.checkLeakageProtection(leakageList2)).toBe(false);

        const leakageList3 = ['journey_id', 'train_number'];
        expect(kaggleSchema.checkLeakageProtection(leakageList3)).toBe(false);
    });

    it('3. valid row normalization - validateRow accepts valid row object', () => {
        const validRow = {
            journey_id: 'IR000001',
            train_number: '12951',
            train_type: 'Rajdhani',
            departure_date: '2023-01-01',
            year: '2023',
            month: '1',
            day_of_week: '0',
            departure_hour: '16',
            is_weekend: '0',
            is_night_departure: '0',
            is_peak_hour: '1',
            is_festival_season: '0',
            season: 'Winter',
            zone: 'Western Railway',
            zone_abbr: 'WR',
            source_station_category: 'A1',
            destination_station_category: 'A1',
            distance_km: '1384',
            num_scheduled_stops: '6',
            scheduled_travel_hours: '15.5',
            track_doubled: '1',
            is_hdn_route: '1',
            traction_type: 'Electric',
            is_electrified: '1',
            psr_count: '2',
            is_circular_route: '0',
            is_monsoon_season: '0',
            is_fog_risk: '1',
            fog_risk_score: '0.8',
            zone_fog_index: '0.7',
            zone_congestion_index: '0.6',
            season_severity_score: '0.5',
            loco_age_years: '5',
            coach_age_years: '4',
            has_lhb_coaches: '1',
            is_rake_shared: '0',
            maintenance_score: '8.5',
            seat_utilisation_pct: '95.0',
            is_overloaded: '0',
            late_incoming_rake: '0',
            is_special_train: '0',
            route_historical_ontime_pct: '85.0',
            primary_delay_cause: 'On Time',
            delay_minutes: '5',
            is_delayed: '0'
        };

        const res = kaggleSchema.validateRow(validRow);
        expect(res.valid).toBe(true);
    });

    it('4. malformed row handling - validateRow rejects invalid rows', () => {
        const missingTrain = { departure_date: '2023-01-01', train_number: '' };
        expect(kaggleSchema.validateRow(missingTrain).valid).toBe(false);

        const invalidDate = { train_number: '12951', departure_date: 'not-a-date' };
        expect(kaggleSchema.validateRow(invalidDate).valid).toBe(false);

        const invalidNumeric = { train_number: '12951', departure_date: '2023-01-01', distance_km: 'abc' };
        expect(kaggleSchema.validateRow(invalidNumeric).valid).toBe(false);
    });

    it('5. aggregation correctness - imports fixture CSV and calculates correct aggregates', async () => {
        const fixturePath = path.join(__dirname, 'temp_fixture.csv');
        const csvContent = kaggleSchema.EXPECTED_COLUMNS.join(',') + '\n' +
            'IR001,12951,Rajdhani,2023-01-01,2023,1,0,16,0,0,1,0,Winter,Western Railway (WR),WR,A1,A1,1384,6,15.5,1,1,Electric,1,2,0,0,1,0.8,0.7,0.6,0.5,5,4,1,0,8.5,95.0,0,0,0,85.0,On Time,10,0\n' +
            'IR002,12951,Rajdhani,2023-01-02,2023,1,1,16,1,0,1,0,Winter,Western Railway (WR),WR,A1,A1,1384,6,15.5,1,1,Electric,1,2,0,0,1,0.8,0.7,0.6,0.5,5,4,1,0,8.5,95.0,0,0,0,85.0,Signal Delay,50,1\n';

        fs.writeFileSync(fixturePath, csvContent, 'utf-8');

        const result = await importKaggleData(fixturePath, { dryRun: false });
        fs.unlinkSync(fixturePath);

        expect(result.success).toBe(true);
        expect(result.stats.validRows).toBe(2);
        expect(result.stats.trainProfilesCount).toBe(1);

        const profile = await HistoricalTrainProfile.findOne({ trainNumber: '12951' });
        expect(profile).not.toBeNull();
        expect(profile.sampleCount).toBe(2);
        expect(profile.historicalOnTimeRate).toBe(0.5);
        expect(profile.averageDelayMinutes).toBe(30);
    });

    it('6. train historical profile - retrieves aggregated train profile correctly', async () => {
        await HistoricalTrainProfile.create({
            trainNumber: '12301',
            trainType: 'Rajdhani',
            sampleCount: 100,
            historicalOnTimeRate: 0.8,
            averageDelayMinutes: 12.5,
            zone: 'Eastern Railway',
            dataSource: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
            sourceType: 'HISTORICAL_EDUCATIONAL',
            live: false
        });

        const profile = await getTrainHistoricalProfile('12301');
        expect(profile).not.toBeNull();
        expect(profile.trainNumber).toBe('12301');
        expect(profile.averageDelayMinutes).toBe(12.5);
        expect(profile.source).toBe('KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET');
    });

    it('7. route historical profile - retrieves route profile correctly', async () => {
        await HistoricalRouteProfile.create({
            routeKey: 'A1->A1_EASTERN RAILWAY',
            zone: 'Eastern Railway',
            sourceCategory: 'A1',
            destinationCategory: 'A1',
            distance: 1450,
            sampleCount: 50,
            historicalOnTimeRate: 0.75,
            averageDelayMinutes: 18.2
        });

        const rProfile = await getRouteHistoricalProfile({ routeKey: 'A1->A1_EASTERN RAILWAY' });
        expect(rProfile).not.toBeNull();
        expect(rProfile.distance).toBe(1450);
        expect(rProfile.historicalOnTimeRate).toBe(0.75);
    });

    it('8. idempotent import - running importer twice does not duplicate profiles', async () => {
        const fixturePath = path.join(__dirname, 'temp_fixture2.csv');
        const csvContent = kaggleSchema.EXPECTED_COLUMNS.join(',') + '\n' +
            'IR003,12952,Rajdhani,2023-01-01,2023,1,0,16,0,0,1,0,Winter,Western Railway (WR),WR,A1,A1,1384,6,15.5,1,1,Electric,1,2,0,0,1,0.8,0.7,0.6,0.5,5,4,1,0,8.5,95.0,0,0,0,85.0,On Time,5,0\n';

        fs.writeFileSync(fixturePath, csvContent, 'utf-8');

        await importKaggleData(fixturePath, { dryRun: false });
        await importKaggleData(fixturePath, { dryRun: false });
        fs.unlinkSync(fixturePath);

        const count = await HistoricalTrainProfile.countDocuments({ trainNumber: '12952' });
        expect(count).toBe(1);
    });

    it('9. empty historical result - returns fallback or null gracefully', async () => {
        const missingProfile = await getTrainHistoricalProfile('99999');
        expect(missingProfile).toBeNull();

        const delayContext = await getHistoricalDelayContext({ trainNumber: '99999', departureHour: 10 });
        expect(delayContext).not.toBeNull();
        expect(delayContext.trainNumber).toBe('99999');
        expect(delayContext.source).toBe('KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET');
    });

    it('10. historical service failure does not break ETA - getHistoricalEtaContext handles exceptions safely', async () => {
        jest.spyOn(HistoricalTrainProfile, 'findOne').mockImplementationOnce(() => {
            throw new Error('Database connection timeout');
        });

        const etaCtx = await getHistoricalEtaContext('12951');
        expect(etaCtx).not.toBeNull();
        expect(etaCtx.available).toBe(false);
        expect(etaCtx.source).toBe('KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET');
        expect(etaCtx.live).toBe(false);
    });

});
