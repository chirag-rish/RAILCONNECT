"""
SIH26028 — Synthetic Dataset Generation for ETA Prediction

Regenerates eta_dataset_v1.csv from scratch with realistic railway delay patterns.

Key improvements over the original:
  - Delay persistence between consecutive sections (congestion cascade)
  - Infrastructure-correlated delay magnitudes (SingleLine/Steep gradient)
  - Operational events with severity levels affecting travel time
  - Time-of-day patterns (peak congestion, overnight recovery)
  - Speed restrictions that actually affect travel time
  - Recovery behavior proportional to running-time margin
  - Rolling historical averages computed chronologically (no leakage)

Usage:
    python server/ml/extend_dataset.py

Output:
    server/data/ml/eta_dataset_v1.csv
    server/data/ml/eta_dataset_v1_metadata.json
"""

import csv
import json
import os
import math
import random
from datetime import datetime, timedelta, timezone
from collections import defaultdict

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'ml')
OUTPUT_CSV = os.path.join(DATA_DIR, 'eta_dataset_v1.csv')
OUTPUT_META = os.path.join(DATA_DIR, 'eta_dataset_v1_metadata.json')

TARGET_DAYS = 240
RANDOM_SEED = 42

# Route definitions: (from, to, distance_km, typical_speed, max_speed, section_type, signals, crossings, gradient)
ROUTES = {
    'Rajdhani_12301': [
        ('NDLS', 'KOTA',  262, 95, 130, 'Quadruple',  8, 1, 'Flat'),
        ('KOTA', 'RTM',  313, 80, 110, 'TripleLine',  7, 2, 'Mild'),
        ('RTM', 'BRC',   163, 75, 110, 'DoubleLine',  5, 1, 'Flat'),
        ('BRC', 'ST',    130, 70, 100, 'DoubleLine',  4, 1, 'Flat'),
        ('ST',  'BCT',   306, 85, 120, 'TripleLine',  9, 2, 'Flat'),
    ],
    'Shatabdi_12002': [
        ('NDLS', 'CNB',  253, 100, 130, 'Quadruple',  7, 0, 'Flat'),
        ('CNB', 'ALD',  298,  90, 120, 'TripleLine',  8, 1, 'Mild'),
        ('ALD', 'MGS',  191,  85, 110, 'DoubleLine',  5, 2, 'Flat'),
        ('MGS', 'PNBE', 294,  80, 110, 'TripleLine',  9, 2, 'Mild'),
        ('PNBE','ASN',  330,  85, 115, 'DoubleLine', 10, 3, 'Flat'),
        ('ASN', 'HWH',  185,  90, 120, 'TripleLine',  6, 1, 'Flat'),
    ],
    'VandeBharat_22436': [
        ('CST', 'KJT',  124,  80, 110, 'DoubleLine',  4, 1, 'Flat'),
        ('KJT', 'LNL',   72,  75, 100, 'DoubleLine',  3, 1, 'Mild'),
        ('LNL', 'PUNE',  64,  70,  95, 'SingleLine',  3, 2, 'Steep'),
        ('PUNE','MMR',  118,  80, 105, 'DoubleLine',  4, 1, 'Mild'),
        ('MMR', 'KYN',   95,  85, 110, 'DoubleLine',  4, 1, 'Flat'),
        ('KYN', 'CST',  135,  75, 100, 'TripleLine',  5, 1, 'Flat'),
    ],
    'GaribRath_12909': [
        ('MAS', 'KPD',  130,  80, 110, 'DoubleLine',  4, 1, 'Mild'),
        ('KPD', 'SBC',  108,  85, 115, 'TripleLine',  4, 1, 'Flat'),
    ],
    'Duronto_12269': [
        ('NED', 'PVR',  312,  85, 115, 'DoubleLine',  8, 2, 'Flat'),
        ('PVR', 'MMR',  195,  80, 105, 'DoubleLine',  5, 1, 'Mild'),
    ],
    'Humsafar_19091': [
        ('SC',  'NED',  265,  80, 110, 'DoubleLine',  7, 2, 'Flat'),
        ('NED', 'WL',   290,  85, 115, 'TripleLine',  8, 1, 'Flat'),
        ('WL',  'SC',   140,  75, 100, 'DoubleLine',  4, 2, 'Mild'),
    ],
}

SECTION_TYPES = ['SingleLine', 'DoubleLine', 'TripleLine', 'Quadruple']
GRADIENT_PROFILES = ['Flat', 'Mild', 'Steep']
EVENT_TYPES = [
    'SpeedRestriction', 'MaintenanceBlock', 'SignalFailure', 'TrackWork',
    'WeatherAlert', 'Fog', 'Flood', 'CongestionZone', 'LevelCrossingDelay',
    'CrewShortage', 'LocoFailure', 'Derailment', 'SecurityAlert'
]

# Event severity mapping: (min_severity, max_severity, delay_multiplier)
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


def get_infrastructure_delay_factor(section_type, gradient, signal_count, crossings):
    """Compute infrastructure-based delay probability modifier."""
    factor = 1.0
    # Section type: single line = more delays (trains must wait for opposing traffic)
    if section_type == 'SingleLine':
        factor *= 1.5
    elif section_type == 'DoubleLine':
        factor *= 1.1
    elif section_type == 'TripleLine':
        factor *= 0.9
    elif section_type == 'Quadruple':
        factor *= 0.7
    # Gradient: steeper = more delays (speed restrictions, braking)
    if gradient == 'Steep':
        factor *= 1.4
    elif gradient == 'Mild':
        factor *= 1.15
    # Signals: each signal adds a chance of signal halt
    factor *= (1.0 + signal_count * 0.03)
    # Level crossings: each crossing adds chance of delay
    factor *= (1.0 + crossings * 0.05)
    return factor


def get_time_of_day_factor(hour):
    """Compute time-of-day delay modifier."""
    # Peak hours: heavy traffic, more congestion
    if hour in (7, 8, 9, 10):       # Morning peak
        return 1.3
    elif hour in (17, 18, 19, 20):  # Evening peak
        return 1.25
    elif hour in (11, 12, 13, 14, 15, 16):  # Midday
        return 1.0
    elif hour in (21, 22):          # Late evening
        return 0.9
    elif hour in (23, 0, 1, 2):     # Night: less traffic, more recovery
        return 0.6
    else:                           # Early morning (3-6)
        return 0.7


def generate_section_delay(scheduled_travel_min, section_type, gradient, signal_count,
                            crossings, accumulated_delay, entry_hour, event_active,
                            event_severity, prev_delay, has_prev):
    """
    Generate a realistic section delay.

    Returns: (section_delay_minutes, delay_causes)
    """
    random_factor = random.random

    # --- Base noise (always present) ---
    # Base noise follows a slightly right-skewed distribution
    base_noise = random.gauss(0.5, 1.5)  # Small positive bias (trains tend to be slightly late)

    # --- Delay probability ---
    base_prob = 0.15  # 15% base chance of significant delay event

    # Infrastructure modifier
    infra_factor = get_infrastructure_delay_factor(section_type, gradient, signal_count, crossings)
    base_prob *= infra_factor

    # Time-of-day modifier
    time_factor = get_time_of_day_factor(entry_hour)
    base_prob *= time_factor

    # Delay persistence: if already delayed, higher chance of continued delay
    if accumulated_delay > 15:
        base_prob *= 1.8
    elif accumulated_delay > 8:
        base_prob *= 1.4
    elif accumulated_delay > 3:
        base_prob *= 1.15

    # Previous section delay effect: delay tends to propagate
    if has_prev:
        base_prob *= (1.0 + abs(prev_delay) * 0.03)

    base_prob = max(0.03, min(0.55, base_prob))

    # --- Generate delay if triggered ---
    section_delay = base_noise
    delay_causes = []

    if random_factor() < base_prob:
        # Delay magnitude depends on infrastructure
        base_duration = random.gauss(8, 4)
        base_duration = max(2, base_duration)

        # Gradient multiplier
        if gradient == 'Steep':
            base_duration *= 1.4
        elif gradient == 'Mild':
            base_duration *= 1.15

        # Section type multiplier
        if section_type == 'SingleLine':
            base_duration *= 1.3
        elif section_type == 'DoubleLine':
            base_duration *= 1.1

        # Accumulated delay amplifier (congestion cascade)
        if accumulated_delay > 15:
            base_duration *= 1.5
        elif accumulated_delay > 8:
            base_duration *= 1.2

        section_delay += base_duration

    # --- Operational event ---
    if event_active:
        event_type = random.choice(EVENT_TYPES)
        severity = random.uniform(*EVENT_SEVERITY[event_type][:2])
        multiplier = EVENT_SEVERITY[event_type][2]

        event_delay = severity * multiplier * random.gauss(5, 3)
        event_delay = max(0, event_delay)

        # Speed restriction events also reduce speed
        if event_type == 'SpeedRestriction':
            event_delay *= 1.2  # Speed restriction adds extra delay

        section_delay += event_delay
    else:
        event_type = 'None'

    # --- Recovery mechanism ---
    # If running late and there's recovery margin, reduce delay
    recovery_margin = scheduled_travel_min * 0.15  # 15% recovery margin
    if accumulated_delay > 10 and section_delay < base_noise:
        recovery = min(accumulated_delay * 0.08, recovery_margin)
        section_delay -= recovery

    return round(section_delay, 2), event_type


def generate_dataset():
    """Generate the full synthetic dataset."""
    random.seed(RANDOM_SEED)

    all_rows = []

    for run_day in range(TARGET_DAYS):
        current_date = datetime(2026, 8, 5) + timedelta(days=run_day)
        day_of_week = current_date.weekday()

        for train_name, sections in ROUTES.items():
            # Departure time varies by train (deterministic based on train name)
            base_hour = hash(train_name) % 16 + 4  # 4:00 to 19:59
            departure_minute = (hash(train_name + str(run_day)) % 60)
            departure_time = current_date.replace(hour=base_hour, minute=departure_minute, second=0, microsecond=0)

            accumulated_delay = 0
            current_time = departure_time

            for section_idx, (from_st, to_st, dist, typ_spd, max_spd,
                              sec_type, signals, crossings, gradient) in enumerate(sections):
                scheduled_travel_min = round(dist / typ_spd * 60, 2)

                entry_time = current_time
                entry_hour = entry_time.hour

                # Previous section info
                has_prev = section_idx > 0
                prev_delay = 0
                prev_travel_time = 0
                if has_prev:
                    prev_dist, prev_typ = sections[section_idx - 1][2], sections[section_idx - 1][3]
                    prev_sched = round(prev_dist / prev_typ * 60, 2)
                    prev_noise = random.gauss(0, 2)
                    prev_travel_time = round(prev_sched + prev_noise, 2)
                    prev_delay = round(prev_noise, 2)

                # Event probability
                event_prob = 0.08
                if gradient == 'Steep':
                    event_prob += 0.06
                if sec_type == 'SingleLine':
                    event_prob += 0.04
                event_prob *= get_time_of_day_factor(entry_hour)
                event_active = 1 if random.random() < event_prob else 0

                # Generate section delay
                section_delay, event_type = generate_section_delay(
                    scheduled_travel_min, sec_type, gradient, signals, crossings,
                    accumulated_delay, entry_hour, event_active,
                    0.5 if event_active else 0,  # placeholder severity
                    prev_delay, has_prev
                )

                # Actual travel time
                actual_travel_min = scheduled_travel_min + section_delay
                accumulated_delay += section_delay

                # Event speed limit
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
                    'historical_mean_travel_time': 0.0,  # placeholder
                    'historical_mean_delay': 0.0,         # placeholder
                    'split': '',
                }
                all_rows.append(row)

                # Advance time
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
        'dataset_version': 'eta_dataset_v1',
        'generation_timestamp': datetime.now(timezone.utc).isoformat(),
        'source_train_runs': len(train_runs),
        'source_section_logs': len(rows),
        'feature_count': len([k for k in rows[0].keys()
                              if k not in ('target_delay_minutes', 'split')]),
        'target_definition': 'target_delay_minutes = actualTravelTime - scheduledTravelTime',
        'baseline_strategy': "Use 'historical_mean_delay' feature as naive baseline predictor",
        'synthetic_data_disclaimer': 'The prototype is trained and validated on structurally realistic synthetic railway telemetry and historical simulation data, designed to be replaceable with authorized operational railway feeds.',
        'generation_changes': 'v2: Added delay persistence, infrastructure-correlated delays, time-of-day patterns, event severity, recovery mechanisms, and realistic congestion cascades.',
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
    print("SIH26028 — Synthetic Dataset Generation v2")
    print("=" * 60)

    print(f"\nGenerating synthetic railway telemetry...")
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

    # Quick sanity check
    import statistics
    targets = [float(r['target_delay_minutes']) for r in all_rows]
    print(f"\nTarget stats: mean={statistics.mean(targets):.3f}, "
          f"std={statistics.stdev(targets):.3f}, "
          f"min={min(targets):.2f}, max={max(targets):.2f}")

    write_dataset(all_rows, OUTPUT_CSV)
    write_metadata(all_rows, OUTPUT_META)

    print(f"\nDataset generation complete: {len(all_rows)} total rows")


if __name__ == '__main__':
    main()
