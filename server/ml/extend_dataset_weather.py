"""
SIH26028 — Phase 3A: Weather-Augmented Dataset Generation

Extends the base synthetic dataset with realistic weather features.
Weather is generated deterministically per route/location/season/hour
so the model can learn weather→delay relationships.

NO DATA LEAKAGE:
  - Weather is generated based on location, season, and time of day
  - Weather does NOT use actual delay information
  - Weather causally affects delay through an explicit mechanism
  - Historical weather features correspond to the train's position at entry time

Usage:
    python server/ml/extend_dataset_weather.py

Output:
    server/data/ml/eta_dataset_v2_weather.csv
    server/data/ml/eta_dataset_v2_weather_metadata.json
"""

import csv
import json
import os
import math
import random
from datetime import datetime, timedelta, timezone
from collections import defaultdict

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'ml')
OUTPUT_CSV = os.path.join(DATA_DIR, 'eta_dataset_v2_weather.csv')
OUTPUT_META = os.path.join(DATA_DIR, 'eta_dataset_v2_weather_metadata.json')

TARGET_DAYS = 240
RANDOM_SEED = 42

# ============================================================
# ROUTE DEFINITIONS (same as extend_dataset.py)
# Each route gets a latitude_proxy for weather generation
# ============================================================

ROUTES = {
    'Rajdhani_12301': {
        'latitude_proxy': 26.0,   # Delhi-Mumbai corridor (~26°N)
        'sections': [
            ('NDLS', 'KOTA',  262, 95, 130, 'Quadruple',  8, 1, 'Flat'),
            ('KOTA', 'RTM',  313, 80, 110, 'TripleLine',  7, 2, 'Mild'),
            ('RTM', 'BRC',   163, 75, 110, 'DoubleLine',  5, 1, 'Flat'),
            ('BRC', 'ST',    130, 70, 100, 'DoubleLine',  4, 1, 'Flat'),
            ('ST',  'BCT',   306, 85, 120, 'TripleLine',  9, 2, 'Flat'),
        ],
    },
    'Shatabdi_12002': {
        'latitude_proxy': 25.5,   # Delhi-Howrah corridor (~25.5°N)
        'sections': [
            ('NDLS', 'CNB',  253, 100, 130, 'Quadruple',  7, 0, 'Flat'),
            ('CNB', 'ALD',  298,  90, 120, 'TripleLine',  8, 1, 'Mild'),
            ('ALD', 'MGS',  191,  85, 110, 'DoubleLine',  5, 2, 'Flat'),
            ('MGS', 'PNBE', 294,  80, 110, 'TripleLine',  9, 2, 'Mild'),
            ('PNBE','ASN',  330,  85, 115, 'DoubleLine', 10, 3, 'Flat'),
            ('ASN', 'HWH',  185,  90, 120, 'TripleLine',  6, 1, 'Flat'),
        ],
    },
    'VandeBharat_22436': {
        'latitude_proxy': 18.5,   # Mumbai-Pune corridor (~18.5°N)
        'sections': [
            ('CST', 'KJT',  124,  80, 110, 'DoubleLine',  4, 1, 'Flat'),
            ('KJT', 'LNL',   72,  75, 100, 'DoubleLine',  3, 1, 'Mild'),
            ('LNL', 'PUNE',  64,  70,  95, 'SingleLine',  3, 2, 'Steep'),
            ('PUNE','MMR',  118,  80, 105, 'DoubleLine',  4, 1, 'Mild'),
            ('MMR', 'KYN',   95,  85, 110, 'DoubleLine',  4, 1, 'Flat'),
            ('KYN', 'CST',  135,  75, 100, 'TripleLine',  5, 1, 'Flat'),
        ],
    },
    'GaribRath_12909': {
        'latitude_proxy': 13.0,   # Chennai-Bangalore (~13°N)
        'sections': [
            ('MAS', 'KPD',  130,  80, 110, 'DoubleLine',  4, 1, 'Mild'),
            ('KPD', 'SBC',  108,  85, 115, 'TripleLine',  4, 1, 'Flat'),
        ],
    },
    'Duronto_12269': {
        'latitude_proxy': 19.0,   # Nanded-MMR (~19°N)
        'sections': [
            ('NED', 'PVR',  312,  85, 115, 'DoubleLine',  8, 2, 'Flat'),
            ('PVR', 'MMR',  195,  80, 105, 'DoubleLine',  5, 1, 'Mild'),
        ],
    },
    'Humsafar_19091': {
        'latitude_proxy': 17.5,   # Secunderabad-Warangal (~17.5°N)
        'sections': [
            ('SC',  'NED',  265,  80, 110, 'DoubleLine',  7, 2, 'Flat'),
            ('NED', 'WL',   290,  85, 115, 'TripleLine',  8, 1, 'Flat'),
            ('WL',  'SC',   140,  75, 100, 'DoubleLine',  4, 2, 'Mild'),
        ],
    },
}

SECTION_TYPES = ['SingleLine', 'DoubleLine', 'TripleLine', 'Quadruple']
GRADIENT_PROFILES = ['Flat', 'Mild', 'Steep']
EVENT_TYPES = [
    'SpeedRestriction', 'MaintenanceBlock', 'SignalFailure', 'TrackWork',
    'WeatherAlert', 'Fog', 'Flood', 'CongestionZone', 'LevelCrossingDelay',
    'CrewShortage', 'LocoFailure', 'Derailment', 'SecurityAlert'
]

EVENT_SEVERITY = {
    'SpeedRestriction':    (0.3, 0.8, 1.5),
    'MaintenanceBlock':    (0.5, 1.0, 2.0),
    'SignalFailure':       (0.4, 0.9, 1.8),
    'TrackWork':           (0.2, 0.7, 1.3),
    'WeatherAlert':        (0.3, 0.8, 1.6),
    'Fog':                 (0.4, 0.9, 1.7),
    'Flood':               (0.6, 1.0, 2.5),
    'CongestionZone':      (0.3, 0.7, 1.4),
    'LevelCrossingDelay':  (0.2, 0.6, 1.2),
    'CrewShortage':        (0.3, 0.8, 1.5),
    'LocoFailure':         (0.5, 1.0, 2.2),
    'Derailment':          (0.7, 1.0, 3.0),
    'SecurityAlert':       (0.3, 0.8, 1.5),
}

# ============================================================
# WEATHER GENERATION
# ============================================================

def _month_to_day_of_year(month, day):
    """Approximate day-of-year from month and day."""
    days_in_month = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    doy = sum(days_in_month[:month]) + day
    return doy


def generate_weather(day_of_year, hour, latitude_proxy, route_rng):
    """
    Generate realistic weather based on location, season, and time of day.

    Climate model for Indian Railways:
      - Summer (Mar-Jun): hot, occasional pre-monsoon storms
      - Monsoon (Jun-Sep): heavy rain, high humidity
      - Post-monsoon (Oct-Nov): clearing, some residual rain
      - Winter (Dec-Feb): cool, fog in North India (>24°N), dry in South

    Returns dict with weather fields.
    """
    # Seasonal factors
    # day_of_year: 1=Jan1, ~180=Jun29, ~270=Sep27
    seasonal_temp_offset = 10 * math.sin(2 * math.pi * (day_of_year - 80) / 365)
    # Peak heat around day 140 (May), coolest around day 15 (Jan)

    # Base temperature by latitude (warmer in south)
    base_temp = 28.0 - (latitude_proxy - 10) * 0.4
    # Seasonal adjustment
    temp = base_temp + seasonal_temp_offset
    # Diurnal variation (warmer afternoon, cooler night)
    diurnal = 5.0 * math.sin(2 * math.pi * (hour - 6) / 24)
    temp += diurnal
    # Add route-specific noise
    temp += route_rng.gauss(0, 2.5)
    temp = max(2.0, min(48.0, temp))

    # Precipitation: monsoon season (day 150-270 = Jun-Sep) has high rain probability
    is_monsoon = 150 <= day_of_year <= 270
    is_pre_monsoon = 120 <= day_of_year <= 150
    is_post_monsoon = 270 < day_of_year <= 310

    rain_prob = 0.05  # baseline
    if is_monsoon:
        rain_prob = 0.45
        if latitude_proxy > 22:
            rain_prob += 0.10  # heavier monsoon in north/east
    elif is_pre_monsoon:
        rain_prob = 0.15  # pre-monsoon storms
    elif is_post_monsoon:
        rain_prob = 0.10

    # Night slightly higher fog/rain probability in winter
    is_winter = day_of_year < 60 or day_of_year > 320
    if is_winter and hour < 8:
        rain_prob *= 0.7  # less rain in winter mornings, more fog

    precipitation = 0.0
    if route_rng.random() < rain_prob:
        # Exponential distribution for rain intensity
        intensity = route_rng.expovariate(1.0 / 5.0)
        if is_monsoon and route_rng.random() < 0.15:
            intensity *= 3.0  # occasional heavy monsoon downpour
        precipitation = round(min(80.0, intensity), 2)

    # Wind speed
    base_wind = 10.0 + route_rng.gauss(0, 5)
    if precipitation > 10:
        base_wind += route_rng.uniform(5, 15)  # storm winds
    wind_speed = round(max(0.0, min(80.0, base_wind)), 1)

    # Visibility
    visibility = 10000.0  # default clear
    if is_winter and hour < 9 and latitude_proxy > 23:
        # Winter fog in North India (lat > 23°N, morning)
        fog_prob = 0.30 if latitude_proxy > 26 else 0.15
        if route_rng.random() < fog_prob:
            visibility = round(route_rng.uniform(50, 800), 0)
    if precipitation > 20:
        visibility = min(visibility, route_rng.uniform(500, 3000))
    elif precipitation > 5:
        visibility = min(visibility, route_rng.uniform(2000, 6000))
    visibility = max(50.0, min(10000.0, visibility))

    # Weather code (simplified WMO mapping)
    if visibility < 200:
        weather_code = 48  # Fog with rime
    elif visibility < 1000:
        weather_code = 45  # Fog
    elif precipitation > 30:
        weather_code = 65  # Heavy rain
    elif precipitation > 10:
        weather_code = 63  # Moderate rain
    elif precipitation > 2:
        weather_code = 61  # Slight rain
    elif precipitation > 0.5:
        weather_code = 53  # Moderate drizzle
    elif precipitation > 0:
        weather_code = 51  # Light drizzle
    elif wind_speed > 40:
        weather_code = 0   # Clear but windy
    else:
        weather_code = 0   # Clear sky

    # Weather severity (0=clear, 1=light, 2=moderate, 3=severe)
    severe_codes = [55, 65, 67, 75, 82, 86, 95, 96, 99]
    caution_codes = [45, 48, 53, 57, 63, 66, 73, 77, 81, 85]

    if weather_code in severe_codes or wind_speed > 60 or visibility < 200 or temp > 46 or temp < -2:
        weather_severity = 3
    elif weather_code in caution_codes or wind_speed > 40 or visibility < 1000 or temp > 42 or temp < 2:
        weather_severity = 2
    elif precipitation > 0 or wind_speed > 25:
        weather_severity = 1
    else:
        weather_severity = 0

    return {
        'weather_temperature': round(temp, 1),
        'weather_precipitation': precipitation,
        'weather_wind_speed': wind_speed,
        'weather_visibility': visibility,
        'weather_severity': weather_severity,
    }


def get_weather_delay_impact(weather, section_type, gradient, max_speed, scheduled_travel_min):
    """
    Compute the delay impact of weather on this section.

    Returns additional delay in minutes due to weather conditions.
    This creates a CAUSAL relationship between weather features and target delay.
    """
    impact = 0.0

    # Temperature extremes
    if weather['weather_temperature'] > 44:
        impact += random.uniform(1.0, 3.0)  # Heat: track buckling risk, speed restrictions
    elif weather['weather_temperature'] < 3:
        impact += random.uniform(0.5, 2.0)  # Cold: fog, frost

    # Precipitation impact
    precip = weather['weather_precipitation']
    if precip > 30:
        # Heavy rain: speed restrictions, flooding risk
        impact += random.uniform(3.0, 8.0) * (scheduled_travel_min / 60)
        if gradient == 'Steep':
            impact *= 1.4  # Steep gradient + heavy rain = landslides/flooding
    elif precip > 10:
        impact += random.uniform(1.0, 4.0) * (scheduled_travel_min / 60)
    elif precip > 2:
        impact += random.uniform(0.3, 1.5) * (scheduled_travel_min / 60)

    # Fog impact
    vis = weather['weather_visibility']
    if vis < 200:
        # Dense fog: severe speed restrictions
        impact += random.uniform(4.0, 12.0) * (scheduled_travel_min / 60)
    elif vis < 500:
        impact += random.uniform(2.0, 6.0) * (scheduled_travel_min / 60)
    elif vis < 1000:
        impact += random.uniform(0.5, 2.0) * (scheduled_travel_min / 60)

    # Wind impact on exposed sections
    wind = weather['weather_wind_speed']
    if wind > 50:
        impact += random.uniform(1.0, 4.0)
    elif wind > 35:
        impact += random.uniform(0.3, 1.5)

    # Section vulnerability: SingleLine + Steep = most weather-vulnerable
    if section_type == 'SingleLine':
        impact *= 1.3
    if gradient == 'Steep':
        impact *= 1.2

    return round(impact, 2)


def get_infrastructure_delay_factor(section_type, gradient, signal_count, crossings):
    """Compute infrastructure-based delay probability modifier."""
    factor = 1.0
    if section_type == 'SingleLine':
        factor *= 1.5
    elif section_type == 'DoubleLine':
        factor *= 1.1
    elif section_type == 'TripleLine':
        factor *= 0.9
    elif section_type == 'Quadruple':
        factor *= 0.7
    if gradient == 'Steep':
        factor *= 1.4
    elif gradient == 'Mild':
        factor *= 1.15
    factor *= (1.0 + signal_count * 0.03)
    factor *= (1.0 + crossings * 0.05)
    return factor


def get_time_of_day_factor(hour):
    """Compute time-of-day delay modifier."""
    if hour in (7, 8, 9, 10):
        return 1.3
    elif hour in (17, 18, 19, 20):
        return 1.25
    elif hour in (11, 12, 13, 14, 15, 16):
        return 1.0
    elif hour in (21, 22):
        return 0.9
    elif hour in (23, 0, 1, 2):
        return 0.6
    else:
        return 0.7


def generate_section_delay(scheduled_travel_min, section_type, gradient, signal_count,
                            crossings, accumulated_delay, entry_hour, event_active,
                            event_severity, prev_delay, has_prev, weather_delay_impact):
    """Generate a realistic section delay including weather effects."""
    base_noise = random.gauss(0.5, 1.5)

    base_prob = 0.15
    infra_factor = get_infrastructure_delay_factor(section_type, gradient, signal_count, crossings)
    base_prob *= infra_factor
    time_factor = get_time_of_day_factor(entry_hour)
    base_prob *= time_factor

    if accumulated_delay > 15:
        base_prob *= 1.8
    elif accumulated_delay > 8:
        base_prob *= 1.4
    elif accumulated_delay > 3:
        base_prob *= 1.15

    if has_prev:
        base_prob *= (1.0 + abs(prev_delay) * 0.03)

    # Weather increases delay probability
    if weather_delay_impact > 3:
        base_prob *= 1.5
    elif weather_delay_impact > 1:
        base_prob *= 1.2

    base_prob = max(0.03, min(0.60, base_prob))

    section_delay = base_noise
    if random.random() < base_prob:
        base_duration = random.gauss(8, 4)
        base_duration = max(2, base_duration)
        if gradient == 'Steep':
            base_duration *= 1.4
        elif gradient == 'Mild':
            base_duration *= 1.15
        if section_type == 'SingleLine':
            base_duration *= 1.3
        elif section_type == 'DoubleLine':
            base_duration *= 1.1
        if accumulated_delay > 15:
            base_duration *= 1.5
        elif accumulated_delay > 8:
            base_duration *= 1.2
        section_delay += base_duration

    if event_active:
        event_type = random.choice(EVENT_TYPES)
        severity = random.uniform(*EVENT_SEVERITY[event_type][:2])
        multiplier = EVENT_SEVERITY[event_type][2]
        event_delay = severity * multiplier * random.gauss(5, 3)
        event_delay = max(0, event_delay)
        if event_type == 'SpeedRestriction':
            event_delay *= 1.2
        section_delay += event_delay
    else:
        event_type = 'None'

    # Add weather delay impact
    section_delay += weather_delay_impact

    recovery_margin = scheduled_travel_min * 0.15
    if accumulated_delay > 10 and section_delay < base_noise:
        recovery = min(accumulated_delay * 0.08, recovery_margin)
        section_delay -= recovery

    return round(section_delay, 2), event_type


def generate_dataset():
    """Generate the full weather-augmented synthetic dataset."""
    random.seed(RANDOM_SEED)

    all_rows = []

    for run_day in range(TARGET_DAYS):
        current_date = datetime(2026, 8, 5) + timedelta(days=run_day)
        day_of_week = current_date.weekday()
        day_of_year = (current_date - datetime(current_date.year, 1, 1)).days + 1

        for train_name, route_def in ROUTES.items():
            sections = route_def['sections']
            lat_proxy = route_def['latitude_proxy']

            # Deterministic per-route RNG for weather (independent of delay RNG)
            route_seed = RANDOM_SEED + hash(train_name) % 100000
            route_rng = random.Random(route_seed + run_day)

            base_hour = hash(train_name) % 16 + 4
            departure_minute = (hash(train_name + str(run_day)) % 60)
            departure_time = current_date.replace(hour=base_hour, minute=departure_minute, second=0, microsecond=0)

            accumulated_delay = 0
            current_time = departure_time

            for section_idx, (from_st, to_st, dist, typ_spd, max_spd,
                              sec_type, signals, crossings, gradient) in enumerate(sections):
                scheduled_travel_min = round(dist / typ_spd * 60, 2)
                entry_time = current_time
                entry_hour = entry_time.hour

                # Generate weather for this section/entry time
                weather = generate_weather(day_of_year, entry_hour, lat_proxy, route_rng)

                # Compute weather delay impact (causal, no leakage)
                weather_impact = get_weather_delay_impact(
                    weather, sec_type, gradient, max_spd, scheduled_travel_min
                )

                has_prev = section_idx > 0
                prev_delay = 0
                prev_travel_time = 0
                if has_prev:
                    prev_dist, prev_typ = sections[section_idx - 1][2], sections[section_idx - 1][3]
                    prev_sched = round(prev_dist / prev_typ * 60, 2)
                    prev_noise = random.gauss(0, 2)
                    prev_travel_time = round(prev_sched + prev_noise, 2)
                    prev_delay = round(prev_noise, 2)

                event_prob = 0.08
                if gradient == 'Steep':
                    event_prob += 0.06
                if sec_type == 'SingleLine':
                    event_prob += 0.04
                event_prob *= get_time_of_day_factor(entry_hour)

                # Weather increases event probability
                if weather['weather_severity'] >= 2:
                    event_prob *= 1.3

                event_active = 1 if random.random() < event_prob else 0

                section_delay, event_type = generate_section_delay(
                    scheduled_travel_min, sec_type, gradient, signals, crossings,
                    accumulated_delay, entry_hour, event_active,
                    0.5 if event_active else 0,
                    prev_delay, has_prev, weather_impact
                )

                actual_travel_min = scheduled_travel_min + section_delay
                accumulated_delay += section_delay

                if event_active and event_type == 'SpeedRestriction':
                    event_speed_limit = random.randint(30, typ_spd)
                elif event_active and event_type in ('Fog', 'WeatherAlert'):
                    event_speed_limit = int(typ_spd * random.uniform(0.5, 0.7))
                else:
                    event_speed_limit = max_spd

                row = {
                    'train_number': train_name,
                    'run_date': current_date.strftime('%Y-%m-%dT%H:%M:%S.000Z'),
                    'from_station': from_st,
                    'to_station': to_st,
                    'entry_time': entry_time.strftime('%Y-%m-%dT%H:%M:%S.000Z'),
                    'target_delay_minutes': section_delay,
                    'accumulated_delay_entering': round(accumulated_delay - section_delay, 2),
                    'prev_section_travel_time': prev_travel_time,
                    'prev_section_delay': prev_delay,
                    'stations_travelled': section_idx,
                    'stations_remaining': len(sections) - section_idx - 1,
                    'section_distance': dist,
                    'typical_speed': typ_spd,
                    'max_speed': max_spd,
                    'section_type': sec_type,
                    'signal_count': signals,
                    'level_crossings': crossings,
                    'gradient_profile': gradient,
                    'hour': entry_hour,
                    'day_of_week': day_of_week,
                    'is_weekend': 1 if day_of_week in (5, 6) else 0,
                    'event_active': event_active,
                    'event_type': event_type,
                    'event_speed_limit': event_speed_limit,
                    'historical_mean_travel_time': 0.0,
                    'historical_mean_delay': 0.0,
                    # Weather features (available at prediction time)
                    'weather_temperature': weather['weather_temperature'],
                    'weather_precipitation': weather['weather_precipitation'],
                    'weather_wind_speed': weather['weather_wind_speed'],
                    'weather_visibility': weather['weather_visibility'],
                    'weather_severity': weather['weather_severity'],
                    'split': '',
                }
                all_rows.append(row)

                current_time += timedelta(minutes=actual_travel_min)

    return all_rows


def recompute_historical_means(rows):
    """Recompute rolling historical averages chronologically per section."""
    rows.sort(key=lambda r: r['entry_time'])
    historical_stats = defaultdict(lambda: {'travel_times': [], 'delays': []})

    for row in rows:
        row['section_distance'] = float(row['section_distance'])
        row['typical_speed'] = float(row['typical_speed'])
        row['target_delay_minutes'] = float(row['target_delay_minutes'])

        section_key = f"{row['from_station']}-{row['to_station']}"
        stats = historical_stats[section_key]

        past_tt = stats['travel_times']
        past_del = stats['delays']

        if len(past_tt) > 0:
            row['historical_mean_travel_time'] = round(sum(past_tt) / len(past_tt), 2)
        else:
            dist = float(row['section_distance'])
            spd = float(row['typical_speed'])
            row['historical_mean_travel_time'] = round(dist / spd * 60, 2)

        if len(past_del) > 0:
            row['historical_mean_delay'] = round(sum(past_del) / len(past_del), 2)
        else:
            row['historical_mean_delay'] = 0.0

        dist = float(row['section_distance'])
        spd = float(row['typical_speed'])
        tgt = float(row['target_delay_minutes'])
        actual_travel_time = dist / spd * 60 + tgt
        stats['travel_times'].append(actual_travel_time)
        stats['delays'].append(tgt)

    return rows


def assign_splits(rows):
    """Assign chronological 70/15/15 split."""
    rows.sort(key=lambda r: r['entry_time'])
    n = len(rows)
    train_end = int(n * 0.70)
    val_end = int(n * 0.85)

    for i, row in enumerate(rows):
        if i < train_end:
            row['split'] = 'train'
        elif i < val_end:
            row['split'] = 'validation'
        else:
            row['split'] = 'test'
    return rows


def write_dataset(rows, output_path):
    if not rows:
        return
    headers = list(rows[0].keys())
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} rows to {output_path}")


def write_metadata(rows, output_path):
    train_rows = [r for r in rows if r['split'] == 'train']
    val_rows = [r for r in rows if r['split'] == 'validation']
    test_rows = [r for r in rows if r['split'] == 'test']

    def get_range(split_rows):
        if not split_rows:
            return {'start': None, 'end': None}
        return {
            'start': split_rows[0]['entry_time'],
            'end': split_rows[-1]['entry_time']
        }

    train_runs = set()
    for r in rows:
        train_runs.add((r['train_number'], r['run_date']))

    metadata = {
        'dataset_version': 'eta_dataset_v2_weather',
        'generation_timestamp': datetime.now(timezone.utc).isoformat(),
        'source_train_runs': len(train_runs),
        'source_section_logs': len(rows),
        'feature_count': len([k for k in rows[0].keys()
                              if k not in ('target_delay_minutes', 'split')]),
        'target_definition': 'target_delay_minutes = actualTravelTime - scheduledTravelTime',
        'weather_features': [
            'weather_temperature', 'weather_precipitation', 'weather_wind_speed',
            'weather_visibility', 'weather_severity'
        ],
        'weather_causal_mechanism': 'Weather causally affects delays through get_weather_delay_impact(): heavy rain, fog, extreme temperatures, and wind add delay proportional to section distance and vulnerability.',
        'no_data_leakage': 'Weather is generated from deterministic location/season/time model. No actual delay or future information is used in weather generation.',
        'synthetic_data_disclaimer': 'This dataset extends eta_dataset_v1 with synthetic weather features. Weather patterns are modeled after Indian climate zones. Replaceable with real Open-Meteo historical data.',
        'split_details': {
            'train': {'count': len(train_rows), 'date_range': get_range(train_rows)},
            'validation': {'count': len(val_rows), 'date_range': get_range(val_rows)},
            'test': {'count': len(test_rows), 'date_range': get_range(test_rows)}
        },
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2)
    print(f"Wrote metadata to {output_path}")


def main():
    print("=" * 60)
    print("SIH26028 — Phase 3A: Weather-Augmented Dataset Generation")
    print("=" * 60)

    print(f"\nGenerating weather-augmented synthetic railway telemetry...")
    print(f"  Target days: {TARGET_DAYS}")
    print(f"  Routes: {len(ROUTES)}")
    print(f"  Random seed: {RANDOM_SEED}")

    all_rows = generate_dataset()
    print(f"\nGenerated {len(all_rows)} section observations")

    all_rows = recompute_historical_means(all_rows)
    print("Recomputed rolling historical means")

    all_rows = assign_splits(all_rows)

    train = [r for r in all_rows if r['split'] == 'train']
    val = [r for r in all_rows if r['split'] == 'validation']
    test = [r for r in all_rows if r['split'] == 'test']
    print(f"\nSplit: train={len(train)}, validation={len(val)}, test={len(test)}, total={len(all_rows)}")

    dates = [r['entry_time'] for r in all_rows]
    print(f"Date range: {min(dates)} to {max(dates)}")

    # Weather feature stats
    import statistics
    temps = [float(r['weather_temperature']) for r in all_rows]
    precips = [float(r['weather_precipitation']) for r in all_rows]
    vis = [float(r['weather_visibility']) for r in all_rows]
    sev = [int(r['weather_severity']) for r in all_rows]
    print(f"\nWeather stats:")
    print(f"  Temperature: mean={statistics.mean(temps):.1f}°C, min={min(temps):.1f}, max={max(temps):.1f}")
    print(f"  Precipitation: mean={statistics.mean(precips):.2f}mm/h, non-zero={sum(1 for p in precips if p > 0)}")
    print(f"  Visibility: mean={statistics.mean(vis):.0f}m, min={min(vis):.0f}")
    print(f"  Severity distribution: 0={sev.count(0)}, 1={sev.count(1)}, 2={sev.count(2)}, 3={sev.count(3)}")

    targets = [float(r['target_delay_minutes']) for r in all_rows]
    print(f"\nTarget stats: mean={statistics.mean(targets):.3f}, "
          f"std={statistics.stdev(targets):.3f}, "
          f"min={min(targets):.2f}, max={max(targets):.2f}")

    write_dataset(all_rows, OUTPUT_CSV)
    write_metadata(all_rows, OUTPUT_META)

    print(f"\nDataset generation complete: {len(all_rows)} total rows, "
          f"{len(all_rows[0])} columns (including 5 weather base features)")


if __name__ == '__main__':
    main()
