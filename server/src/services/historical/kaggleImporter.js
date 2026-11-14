const fs = require('fs');
const readline = require('readline');
const { validateHeader, validateRow } = require('./kaggleSchema');
const HistoricalTrainProfile = require('../../models/HistoricalTrainProfile');
const HistoricalRouteProfile = require('../../models/HistoricalRouteProfile');
const HistoricalSummary = require('../../models/HistoricalSummary');
const logger = require('../../utils/logger');

async function importKaggleData(csvFilePath, options = {}) {
    const { dryRun = false, rebuild = false, batchSize = 10000 } = options;

    if (!fs.existsSync(csvFilePath)) {
        throw new Error(`CSV file not found at ${csvFilePath}`);
    }

    const fileStream = fs.createReadStream(csvFilePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let header = null;
    let totalRows = 0;
    let validRows = 0;
    let malformedRows = 0;
    let headerValidated = false;

    const trainAccumulator = new Map();
    const routeAccumulator = new Map();
    const zones = new Set();
    let minDate = null;
    let maxDate = null;
    let totalDelaySum = 0;
    let delayedCount = 0;

    for await (const line of rl) {
        if (!line.trim()) continue;

        const rowValues = parseCSVLine(line);

        if (!headerValidated) {
            header = rowValues;
            const hCheck = validateHeader(header);
            if (!hCheck.valid) {
                throw new Error(`Invalid CSV header: ${hCheck.error}`);
            }
            headerValidated = true;
            continue;
        }

        totalRows++;

        if (rowValues.length !== header.length) {
            malformedRows++;
            continue;
        }

        const rowObj = {};
        for (let i = 0; i < header.length; i++) {
            rowObj[header[i]] = rowValues[i];
        }

        const rCheck = validateRow(rowObj);
        if (!rCheck.valid) {
            malformedRows++;
            continue;
        }

        validRows++;

        const trainNumber = String(rowObj.train_number).trim();
        const trainType = String(rowObj.train_type || '').trim();
        const zone = String(rowObj.zone || '').trim();
        const sourceCat = String(rowObj.source_station_category || '').trim();
        const destCat = String(rowObj.destination_station_category || '').trim();
        const isDelayed = Number(rowObj.is_delayed) === 1 ? 1 : 0;
        const delayMinutes = Number(rowObj.delay_minutes || 0);
        const isPeak = Number(rowObj.is_peak_hour || 0) === 1;
        const isWeekend = Number(rowObj.is_weekend || 0) === 1;
        const isMonsoon = Number(rowObj.is_monsoon_season || 0) === 1;
        const isFogRisk = Number(rowObj.is_fog_risk || 0) === 1;
        const lateIncoming = Number(rowObj.late_incoming_rake || 0) === 1;

        if (zone) zones.add(zone);
        if (isDelayed) delayedCount++;
        totalDelaySum += delayMinutes;

        const depDate = new Date(rowObj.departure_date);
        if (!isNaN(depDate)) {
            if (!minDate || depDate < minDate) minDate = depDate;
            if (!maxDate || depDate > maxDate) maxDate = depDate;
        }

        if (!trainAccumulator.has(trainNumber)) {
            trainAccumulator.set(trainNumber, {
                trainNumber,
                trainType,
                zone,
                sampleCount: 0,
                onTimeCount: 0,
                delaySum: 0,
                delays: [],
                peakDelaySum: 0,
                peakCount: 0,
                weekendDelaySum: 0,
                weekendCount: 0,
                monsoonDelaySum: 0,
                monsoonCount: 0,
                fogDelaySum: 0,
                fogCount: 0,
                lateRakeDelaySum: 0,
                lateRakeCount: 0,
                years: new Set()
            });
        }

        const tAcc = trainAccumulator.get(trainNumber);
        tAcc.sampleCount++;
        if (!isDelayed) tAcc.onTimeCount++;
        tAcc.delaySum += delayMinutes;
        tAcc.delays.push(delayMinutes);
        if (rowObj.year) tAcc.years.add(Number(rowObj.year));
        if (isPeak) {
            tAcc.peakDelaySum += delayMinutes;
            tAcc.peakCount++;
        }
        if (isWeekend) {
            tAcc.weekendDelaySum += delayMinutes;
            tAcc.weekendCount++;
        }
        if (isMonsoon) {
            tAcc.monsoonDelaySum += delayMinutes;
            tAcc.monsoonCount++;
        }
        if (isFogRisk) {
            tAcc.fogDelaySum += delayMinutes;
            tAcc.fogCount++;
        }
        if (lateIncoming) {
            tAcc.lateRakeDelaySum += delayMinutes;
            tAcc.lateRakeCount++;
        }

        const routeKey = `${sourceCat}->${destCat}_${zone}`.toUpperCase();
        if (!routeAccumulator.has(routeKey)) {
            routeAccumulator.set(routeKey, {
                routeKey,
                zone,
                sourceCategory: sourceCat,
                destinationCategory: destCat,
                distance: Number(rowObj.distance_km || 0),
                scheduledTravelHours: Number(rowObj.scheduled_travel_hours || 0),
                scheduledStops: Number(rowObj.num_scheduled_stops || 0),
                sampleCount: 0,
                onTimeCount: 0,
                delaySum: 0,
                congestionSum: Number(rowObj.zone_congestion_index || 0)
            });
        }

        const rAcc = routeAccumulator.get(routeKey);
        rAcc.sampleCount++;
        if (!isDelayed) rAcc.onTimeCount++;
        rAcc.delaySum += delayMinutes;
        rAcc.congestionSum += Number(rowObj.zone_congestion_index || 0);
    }

    const overallDelayRate = validRows > 0 ? Number((delayedCount / validRows).toFixed(4)) : 0;

    const stats = {
        totalRows,
        validRows,
        malformedRows,
        trainProfilesCount: trainAccumulator.size,
        routeProfilesCount: routeAccumulator.size,
        zoneCount: zones.size,
        overallDelayRate,
        dateRange: minDate && maxDate ? `${minDate.toISOString().slice(0, 10)} to ${maxDate.toISOString().slice(0, 10)}` : '2018-2024'
    };

    if (dryRun) {
        return { dryRun: true, stats };
    }

    if (rebuild) {
        await HistoricalTrainProfile.deleteMany({});
        await HistoricalRouteProfile.deleteMany({});
        await HistoricalSummary.deleteMany({});
    }

    const trainBulkOps = [];
    for (const [trainNumber, t] of trainAccumulator.entries()) {
        const historicalOnTimeRate = t.sampleCount > 0 ? Number((t.onTimeCount / t.sampleCount).toFixed(4)) : 0;
        const averageDelayMinutes = t.sampleCount > 0 ? Number((t.delaySum / t.sampleCount).toFixed(2)) : 0;
        const peakHourAverageDelay = t.peakCount > 0 ? Number((t.peakDelaySum / t.peakCount).toFixed(2)) : averageDelayMinutes;
        const weekendAverageDelay = t.weekendCount > 0 ? Number((t.weekendDelaySum / t.weekendCount).toFixed(2)) : averageDelayMinutes;
        const monsoonAverageDelay = t.monsoonCount > 0 ? Number((t.monsoonDelaySum / t.monsoonCount).toFixed(2)) : averageDelayMinutes;
        const fogRiskAverageDelay = t.fogCount > 0 ? Number((t.fogDelaySum / t.fogCount).toFixed(2)) : averageDelayMinutes;
        const lateIncomingRakeDelay = t.lateRakeCount > 0 ? Number((t.lateRakeDelaySum / t.lateRakeCount).toFixed(2)) : averageDelayMinutes;
        const lastHistoricalYear = t.years.size > 0 ? Math.max(...t.years) : 2024;

        trainBulkOps.push({
            updateOne: {
                filter: { trainNumber },
                update: {
                    $set: {
                        trainNumber,
                        trainType: t.trainType,
                        zone: t.zone,
                        sampleCount: t.sampleCount,
                        historicalOnTimeRate,
                        averageDelayMinutes,
                        peakHourAverageDelay,
                        weekendAverageDelay,
                        monsoonAverageDelay,
                        fogRiskAverageDelay,
                        lateIncomingRakeDelay,
                        lastHistoricalYear,
                        dataSource: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
                        sourceType: 'HISTORICAL_EDUCATIONAL',
                        live: false
                    }
                },
                upsert: true
            }
        });

        if (trainBulkOps.length >= batchSize) {
            await HistoricalTrainProfile.bulkWrite(trainBulkOps);
            trainBulkOps.length = 0;
        }
    }

    if (trainBulkOps.length > 0) {
        await HistoricalTrainProfile.bulkWrite(trainBulkOps);
    }

    const routeBulkOps = [];
    for (const [routeKey, r] of routeAccumulator.entries()) {
        const historicalOnTimeRate = r.sampleCount > 0 ? Number((r.onTimeCount / r.sampleCount).toFixed(4)) : 0;
        const averageDelayMinutes = r.sampleCount > 0 ? Number((r.delaySum / r.sampleCount).toFixed(2)) : 0;
        const congestionIndex = r.sampleCount > 0 ? Number((r.congestionSum / r.sampleCount).toFixed(4)) : 0;

        routeBulkOps.push({
            updateOne: {
                filter: { routeKey },
                update: {
                    $set: {
                        routeKey,
                        zone: r.zone,
                        sourceCategory: r.sourceCategory,
                        destinationCategory: r.destinationCategory,
                        distance: r.distance,
                        scheduledTravelHours: r.scheduledTravelHours,
                        scheduledStops: r.scheduledStops,
                        historicalOnTimeRate,
                        averageDelayMinutes,
                        congestionIndex,
                        sampleCount: r.sampleCount,
                        dataSource: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
                        sourceType: 'HISTORICAL_EDUCATIONAL',
                        live: false
                    }
                },
                upsert: true
            }
        });

        if (routeBulkOps.length >= batchSize) {
            await HistoricalRouteProfile.bulkWrite(routeBulkOps);
            routeBulkOps.length = 0;
        }
    }

    if (routeBulkOps.length > 0) {
        await HistoricalRouteProfile.bulkWrite(routeBulkOps);
    }

    await HistoricalSummary.updateOne(
        { summaryKey: 'GLOBAL_SUMMARY' },
        {
            $set: {
                summaryKey: 'GLOBAL_SUMMARY',
                totalRecords: validRows,
                dateRange: stats.dateRange,
                overallDelayRate,
                trainCount: trainAccumulator.size,
                routeCount: routeAccumulator.size,
                zoneCount: zones.size,
                lastImportedAt: new Date(),
                dataSource: 'KAGGLE_INDIAN_RAILWAYS_DELAY_DATASET',
                sourceType: 'HISTORICAL_EDUCATIONAL',
                live: false
            }
        },
        { upsert: true }
    );

    return { success: true, stats };
}

function parseCSVLine(text) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            inQuotes = !inQuotes;
        } else if (c === ',' && !inQuotes) {
            result.push(cur.trim());
            cur = '';
        } else {
            cur += c;
        }
    }
    result.push(cur.trim());
    return result;
}

module.exports = {
    importKaggleData
};
