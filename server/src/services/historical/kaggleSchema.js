const EXPECTED_COLUMNS = [
    'journey_id', 'train_number', 'train_type', 'departure_date', 'year', 'month',
    'day_of_week', 'departure_hour', 'is_weekend', 'is_night_departure', 'is_peak_hour',
    'is_festival_season', 'season', 'zone', 'zone_abbr', 'source_station_category',
    'destination_station_category', 'distance_km', 'num_scheduled_stops', 'scheduled_travel_hours',
    'track_doubled', 'is_hdn_route', 'traction_type', 'is_electrified', 'psr_count',
    'is_circular_route', 'is_monsoon_season', 'is_fog_risk', 'fog_risk_score',
    'zone_fog_index', 'zone_congestion_index', 'season_severity_score', 'loco_age_years',
    'coach_age_years', 'has_lhb_coaches', 'is_rake_shared', 'maintenance_score',
    'seat_utilisation_pct', 'is_overloaded', 'late_incoming_rake', 'is_special_train',
    'route_historical_ontime_pct', 'primary_delay_cause', 'delay_minutes', 'is_delayed'
];

const LEAKAGE_COLUMNS = ['primary_delay_cause', 'delay_minutes', 'journey_id'];

function validateHeader(headerArray) {
    if (!Array.isArray(headerArray)) return { valid: false, error: 'Header must be an array' };
    if (headerArray.length !== EXPECTED_COLUMNS.length) {
        return { valid: false, error: `Expected ${EXPECTED_COLUMNS.length} columns, got ${headerArray.length}` };
    }
    for (let i = 0; i < EXPECTED_COLUMNS.length; i++) {
        if (headerArray[i].trim() !== EXPECTED_COLUMNS[i]) {
            return { valid: false, error: `Column mismatch at index ${i}: expected ${EXPECTED_COLUMNS[i]}, got ${headerArray[i]}` };
        }
    }
    return { valid: true };
}

function validateRow(rowObj) {
    if (!rowObj || typeof rowObj !== 'object') return { valid: false, error: 'Row is not a valid object' };

    for (const leakageCol of LEAKAGE_COLUMNS) {
        if (rowObj[leakageCol] === undefined) {
        }
    }

    if (!rowObj.train_number || String(rowObj.train_number).trim() === '') {
        return { valid: false, error: 'Missing train_number' };
    }

    if (!rowObj.departure_date || isNaN(Date.parse(rowObj.departure_date))) {
        return { valid: false, error: 'Invalid or missing departure_date' };
    }

    const numericFields = [
        'year', 'month', 'day_of_week', 'departure_hour', 'is_weekend',
        'is_night_departure', 'is_peak_hour', 'is_festival_season', 'distance_km',
        'num_scheduled_stops', 'scheduled_travel_hours', 'track_doubled', 'is_hdn_route',
        'is_electrified', 'psr_count', 'is_circular_route', 'is_monsoon_season',
        'is_fog_risk', 'fog_risk_score', 'zone_fog_index', 'zone_congestion_index',
        'season_severity_score', 'loco_age_years', 'coach_age_years', 'has_lhb_coaches',
        'is_rake_shared', 'maintenance_score', 'seat_utilisation_pct', 'is_overloaded',
        'late_incoming_rake', 'is_special_train', 'route_historical_ontime_pct',
        'delay_minutes', 'is_delayed'
    ];

    for (const field of numericFields) {
        if (rowObj[field] !== undefined && rowObj[field] !== null && rowObj[field] !== '') {
            if (isNaN(Number(rowObj[field]))) {
                return { valid: false, error: `Invalid numeric value for field ${field}: ${rowObj[field]}` };
            }
        }
    }

    return { valid: true };
}

function checkLeakageProtection(featureList) {
    if (!Array.isArray(featureList)) return true;
    for (const f of featureList) {
        if (LEAKAGE_COLUMNS.includes(f)) {
            return false;
        }
    }
    return true;
}

module.exports = {
    EXPECTED_COLUMNS,
    LEAKAGE_COLUMNS,
    validateHeader,
    validateRow,
    checkLeakageProtection
};
