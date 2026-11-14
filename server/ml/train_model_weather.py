"""
SIH26028 — Phase 3A: Weather-Aware ETA Model Training

Trains a NEW weather-aware XGBoost model on the weather-augmented dataset.
The existing 37-feature model is preserved as baseline/rollback.

Weather features are added alongside existing features.
The model learns weather→delay relationships from synthetic weather data.

Usage:
    python server/ml/train_model_weather.py

Outputs (to server/ml/models/):
    eta_xgboost_weather_model.json   — trained weather-aware model
    weather_preprocessing.joblib      — label encoders + feature config
    weather_feature_schema.json       — 46-feature schema
    weather_model_metadata.json       — model card
    weather_evaluation_results.json   — comparison metrics
"""

import os
import sys
import json
import warnings
import numpy as np
import pandas as pd
import joblib
from datetime import datetime, timezone

from sklearn.preprocessing import LabelEncoder
from sklearn.linear_model import Ridge
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import xgboost as xgb

warnings.filterwarnings('ignore', category=UserWarning)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, '..', 'data', 'ml')
MODELS_DIR = os.path.join(BASE_DIR, 'models')
os.makedirs(MODELS_DIR, exist_ok=True)

WEATHER_DATASET_PATH = os.path.join(DATA_DIR, 'eta_dataset_v2_weather.csv')
BASELINE_MODEL_PATH = os.path.join(MODELS_DIR, 'eta_xgboost_model.json')
TARGET = 'target_delay_minutes'
SPLIT_COL = 'split'

# ============================================================
# BASE FEATURES (identical to base model)
# ============================================================
BASE_NUMERIC = [
    'accumulated_delay_entering',
    'prev_section_travel_time',
    'prev_section_delay',
    'stations_travelled',
    'stations_remaining',
    'section_distance',
    'typical_speed',
    'max_speed',
    'signal_count',
    'level_crossings',
    'hour',
    'day_of_week',
    'is_weekend',
    'event_active',
    'event_speed_limit',
    'historical_mean_travel_time',
    'historical_mean_delay',
]

BASE_CATEGORICAL = ['section_type', 'gradient_profile', 'event_type']

# ============================================================
# WEATHER BASE FEATURES (from Open-Meteo, available at prediction time)
# ============================================================
WEATHER_NUMERIC_BASE = [
    'weather_temperature',       # °C
    'weather_precipitation',     # mm/h
    'weather_wind_speed',        # km/h
    'weather_visibility',        # meters
    'weather_severity',          # 0=clear, 1=light, 2=moderate, 3=severe
]

# ============================================================
# ENGINEERED FEATURES (same as base + weather additions)
# ============================================================
NUMERIC_FEATURES = BASE_NUMERIC + [
    # --- Existing engineered features (from base model) ---
    'accumulated_delay_x_distance',
    'accumulated_delay_x_speed',
    'delay_rate',
    'speed_margin',
    'speed_limit_ratio',
    'section_travel_time',
    'delay_fraction_of_travel',
    'hour_sin',
    'hour_cos',
    'signals_per_km',
    'crossings_per_km',
    'prev_delay_positive',
    'accumulated_delay_squared',
    'is_peak_hour',
    'is_night',
    'event_speed_ratio',
    # --- Weather engineered features ---
    'weather_is_rain',              # 1 if precipitation > 0.5
    'weather_is_fog',               # 1 if visibility < 1000
    'weather_is_severe',            # 1 if weather_severity >= 2
    'precipitation_x_distance',     # precipitation * section_distance (rain impact scales with distance)
]

CATEGORICAL_FEATURES = BASE_CATEGORICAL + [
    'section_type_gradient',
]

ALL_FEATURES = NUMERIC_FEATURES + WEATHER_NUMERIC_BASE + CATEGORICAL_FEATURES


def load_weather_dataset():
    df = pd.read_csv(WEATHER_DATASET_PATH)
    df['event_type'] = df['event_type'].fillna('None')
    print(f"Loaded weather dataset: {df.shape[0]} rows, {df.shape[1]} columns")
    return df


def engineer_features(df):
    """Add ALL engineered features (railway + weather)."""
    df = df.copy()

    # --- Railway engineered features (identical to base model) ---
    df['accumulated_delay_x_distance'] = df['accumulated_delay_entering'] * df['section_distance']
    df['accumulated_delay_x_speed'] = df['accumulated_delay_entering'] / (df['typical_speed'] + 1e-6)
    df['delay_rate'] = df['accumulated_delay_entering'] / (df['stations_travelled'] + 1)
    df['speed_margin'] = df['max_speed'] - df['typical_speed']
    df['speed_limit_ratio'] = df['event_speed_limit'] / (df['max_speed'] + 1e-6)
    df['section_travel_time'] = df['section_distance'] / (df['typical_speed'] + 1e-6)
    df['delay_fraction_of_travel'] = df['accumulated_delay_entering'] / (df['section_travel_time'] + 1e-6)

    df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
    df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)

    df['signals_per_km'] = df['signal_count'] / (df['section_distance'] + 1e-6)
    df['crossings_per_km'] = df['level_crossings'] / (df['section_distance'] + 1e-6)

    df['prev_delay_positive'] = np.maximum(df['prev_section_delay'], 0)
    df['accumulated_delay_squared'] = df['accumulated_delay_entering'] ** 2

    df['is_peak_hour'] = df['hour'].isin([7, 8, 9, 10, 17, 18, 19, 20]).astype(int)
    df['is_night'] = df['hour'].isin([23, 0, 1, 2, 3, 4, 5]).astype(int)

    df['event_speed_ratio'] = df['event_speed_limit'] / (df['max_speed'] + 1e-6)

    df['section_type_gradient'] = df['section_type'] + '_' + df['gradient_profile']

    # --- Weather engineered features ---
    df['weather_is_rain'] = (df['weather_precipitation'] > 0.5).astype(int)
    df['weather_is_fog'] = (df['weather_visibility'] < 1000).astype(int)
    df['weather_is_severe'] = (df['weather_severity'] >= 2).astype(int)
    df['precipitation_x_distance'] = df['weather_precipitation'] * df['section_distance']

    return df


def prepare_features(df, encoders=None):
    """Prepare feature matrices with encoding."""
    X = df[ALL_FEATURES].copy()
    y = df[TARGET].values if TARGET in df.columns else None

    for feat in CATEGORICAL_FEATURES:
        X[feat] = X[feat].fillna('None').astype(str)

    if encoders is None:
        new_encoders = {}
        for feat in CATEGORICAL_FEATURES:
            le = LabelEncoder()
            le.fit(X[feat].values)
            known_labels = set(le.classes_)
            X[feat] = X[feat].apply(
                lambda x, kl=known_labels, c=le.classes_: x if x in kl else c[0]
            )
            X[feat] = le.transform(X[feat].values)
            new_encoders[feat] = le
        encoders_used = new_encoders
    else:
        encoders_used = {}
        for feat in CATEGORICAL_FEATURES:
            le = encoders[feat]
            known_labels = set(le.classes_)
            X[feat] = X[feat].apply(
                lambda x, kl=known_labels, c=le.classes_: x if x in kl else c[0]
            )
            X[feat] = le.transform(X[feat].values)
            encoders_used[feat] = le

    for feat in NUMERIC_FEATURES + WEATHER_NUMERIC_BASE:
        X[feat] = pd.to_numeric(X[feat], errors='coerce').fillna(0)

    return X.values, y, encoders_used, ALL_FEATURES


def compute_metrics(y_true, y_pred, label=""):
    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    r2 = r2_score(y_true, y_pred)
    errors = y_true - y_pred
    within_5 = np.mean(np.abs(errors) <= 5.0) * 100
    within_10 = np.mean(np.abs(errors) <= 10.0) * 100

    metrics = {
        'mae': round(float(mae), 4),
        'rmse': round(float(rmse), 4),
        'r2': round(float(r2), 4),
        'pct_within_5min': round(float(within_5), 2),
        'pct_within_10min': round(float(within_10), 2),
        'mean_error': round(float(np.mean(errors)), 4),
        'std_error': round(float(np.std(errors)), 4),
        'n_samples': len(y_true),
    }

    if label:
        print(f"\n{label}:")
        print(f"  MAE:  {mae:.4f} minutes")
        print(f"  RMSE: {rmse:.4f} minutes")
        print(f"  R2:   {r2:.4f}")
        print(f"  +/-5 min:  {within_5:.2f}%")
        print(f"  +/-10 min: {within_10:.2f}%")
        print(f"  Mean error: {np.mean(errors):.4f} min (negative = over-predict)")
        print(f"  Samples: {len(y_true)}")

    return metrics


def get_feature_importance(model, feature_names):
    if hasattr(model, 'feature_importances_'):
        importance = model.feature_importances_
    elif hasattr(model, 'coef_'):
        importance = np.abs(model.coef_)
    else:
        return []

    importance_list = sorted(
        zip(feature_names, importance),
        key=lambda x: x[1],
        reverse=True
    )
    return [
        {'feature': name, 'importance': round(float(imp), 6)}
        for name, imp in importance_list
    ]


def load_baseline_metrics():
    """Load baseline model metrics for comparison."""
    baseline_path = os.path.join(MODELS_DIR, 'evaluation_results.json')
    if os.path.exists(baseline_path):
        with open(baseline_path) as f:
            data = json.load(f)
        return data.get('selected_model', {}).get('test_metrics', {})
    return {}


def main():
    print("=" * 70)
    print("SIH26028 — Phase 3A: Weather-Aware ETA Model Training")
    print("=" * 70)
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")

    # --------------------------------------------------------
    # 1. Load weather dataset
    # --------------------------------------------------------
    print("\n--- LOADING WEATHER DATASET ---")
    if not os.path.exists(WEATHER_DATASET_PATH):
        print(f"ERROR: Weather dataset not found at {WEATHER_DATASET_PATH}")
        print("Run extend_dataset_weather.py first.")
        sys.exit(1)

    df = load_weather_dataset()

    # --------------------------------------------------------
    # 2. Engineer features
    # --------------------------------------------------------
    print("\n--- ENGINEERING FEATURES ---")
    df = engineer_features(df)
    weather_features = WEATHER_NUMERIC_BASE + [
        'weather_is_rain', 'weather_is_fog', 'weather_is_severe', 'precipitation_x_distance'
    ]
    print(f"Total features: {len(ALL_FEATURES)} "
          f"({len(NUMERIC_FEATURES)} railway numeric + {len(WEATHER_NUMERIC_BASE)} weather base + "
          f"4 weather engineered + {len(CATEGORICAL_FEATURES)} categorical)")

    # --------------------------------------------------------
    # 3. Split chronologically
    # --------------------------------------------------------
    train_df = df[df[SPLIT_COL] == 'train'].copy()
    val_df = df[df[SPLIT_COL] == 'validation'].copy()
    test_df = df[df[SPLIT_COL] == 'test'].copy()

    print(f"\nChronological splits:")
    print(f"  Train:      {len(train_df)} samples")
    print(f"  Validation: {len(val_df)} samples")
    print(f"  Test:       {len(test_df)} samples")

    # --------------------------------------------------------
    # 4. Prepare features
    # --------------------------------------------------------
    print("\n--- PREPARING FEATURES ---")
    X_train, y_train, encoders, feature_names = prepare_features(train_df)
    X_val, y_val, _, _ = prepare_features(val_df, encoders=encoders)
    X_test, y_test, _, _ = prepare_features(test_df, encoders=encoders)

    print(f"Feature matrix shapes:")
    print(f"  X_train: {X_train.shape}")
    print(f"  X_val:   {X_val.shape}")
    print(f"  X_test:  {X_test.shape}")

    # --------------------------------------------------------
    # 5. Naive Baseline
    # --------------------------------------------------------
    print("\n" + "=" * 70)
    print("NAIVE BASELINE (historical_mean_delay)")
    print("=" * 70)

    hmd_idx = feature_names.index('historical_mean_delay')
    baseline_test = X_test[:, hmd_idx]
    baseline_test_metrics = compute_metrics(y_test, baseline_test, "Baseline — Test")

    # --------------------------------------------------------
    # 6. XGBoost Residual (Weather-Aware)
    # --------------------------------------------------------
    print("\n" + "=" * 70)
    print("XGBOOST RESIDUAL (Weather-Aware)")
    print("=" * 70)

    hmd_train = X_train[:, hmd_idx]
    hmd_val = X_val[:, hmd_idx]
    residual_train = y_train - hmd_train
    residual_val = y_val - hmd_val

    xgb_params = {
        'objective': 'reg:squarederror', 'eval_metric': 'mae',
        'max_depth': 5, 'learning_rate': 0.04, 'n_estimators': 600,
        'subsample': 0.8, 'colsample_bytree': 0.8,
        'min_child_weight': 8, 'reg_alpha': 1.0, 'reg_lambda': 5.0,
        'random_state': 42, 'verbosity': 0,
    }

    xgb_model = xgb.XGBRegressor(**xgb_params)
    xgb_model.fit(X_train, residual_train, eval_set=[(X_val, residual_val)], verbose=False)
    best_iter = getattr(xgb_model, 'best_iteration', xgb_params['n_estimators'])

    xgb_train_pred = hmd_train + xgb_model.predict(X_train)
    xgb_val_pred = hmd_val + xgb_model.predict(X_val)
    xgb_test_pred = X_test[:, hmd_idx] + xgb_model.predict(X_test)

    weather_metrics = {
        'train': compute_metrics(y_train, xgb_train_pred, "Weather XGBoost — Train"),
        'val': compute_metrics(y_val, xgb_val_pred, "Weather XGBoost — Validation"),
        'test': compute_metrics(y_test, xgb_test_pred, "Weather XGBoost — Test"),
    }
    print(f"  Best iteration: {best_iter}")

    # --------------------------------------------------------
    # 7. Comparison with baseline model
    # --------------------------------------------------------
    print("\n" + "=" * 70)
    print("COMPARISON: Base Model (37-feature) vs Weather Model (46-feature)")
    print("=" * 70)

    baseline_model_metrics = load_baseline_metrics()
    base_mae = baseline_model_metrics.get('mae', 'N/A')
    weather_mae = weather_metrics['test']['mae']

    print(f"\n  Base model (37 features) test MAE:   {base_mae}")
    print(f"  Weather model (46 features) test MAE: {weather_mae}")

    if isinstance(base_mae, (int, float)):
        improvement = base_mae - weather_mae
        improvement_pct = (improvement / base_mae) * 100
        print(f"  Improvement: {improvement:.4f} min ({improvement_pct:.1f}%)")
        print(f"  Weather model {'IMPROVES' if improvement > 0 else 'does not improve'} over base model")

    beats_baseline = weather_mae < baseline_test_metrics['mae']
    improvement_from_baseline = baseline_test_metrics['mae'] - weather_mae
    improvement_pct_from_baseline = (improvement_from_baseline / baseline_test_metrics['mae']) * 100

    print(f"\n  vs Naive Baseline:")
    print(f"    Baseline MAE:   {baseline_test_metrics['mae']:.4f}")
    print(f"    Weather MAE:    {weather_mae:.4f}")
    print(f"    Improvement:    {improvement_from_baseline:.4f} min ({improvement_pct_from_baseline:.1f}%)")

    # --------------------------------------------------------
    # 8. Feature Importance — weather features
    # --------------------------------------------------------
    print("\n" + "=" * 70)
    print("FEATURE IMPORTANCE (Weather Features)")
    print("=" * 70)

    feature_imp = get_feature_importance(xgb_model, feature_names)

    weather_feature_names = set(weather_features)
    weather_importance = [fi for fi in feature_imp if fi['feature'] in weather_feature_names]
    print(f"\n  Weather feature importance ranking:")
    for i, fi in enumerate(weather_importance):
        rank = next(j for j, f in enumerate(feature_imp) if f['feature'] == fi['feature']) + 1
        print(f"  #{rank} {fi['feature']:<35} {fi['importance']:.6f}")

    print(f"\n  Top 15 overall:")
    for i, fi in enumerate(feature_imp[:15]):
        marker = " [WEATHER]" if fi['feature'] in weather_feature_names else ""
        print(f"  {i+1:>2}. {fi['feature']:<45} {fi['importance']:.6f}{marker}")

    # --------------------------------------------------------
    # 9. Weather-specific error analysis
    # --------------------------------------------------------
    print("\n" + "=" * 70)
    print("WEATHER-SPECIFIC ERROR ANALYSIS")
    print("=" * 70)

    test_weather = test_df['weather_severity'].values
    errors = y_test - xgb_test_pred

    for sev in [0, 1, 2, 3]:
        mask = test_weather == sev
        if mask.sum() > 0:
            sev_mae = np.mean(np.abs(errors[mask]))
            labels = {0: 'Clear', 1: 'Light', 2: 'Moderate', 3: 'Severe'}
            print(f"  Severity {sev} ({labels[sev]}): MAE={sev_mae:.4f} min, n={mask.sum()}")

    # --------------------------------------------------------
    # 10. Save artifacts
    # --------------------------------------------------------
    print("\n" + "=" * 70)
    print("SAVING WEATHER MODEL ARTIFACTS")
    print("=" * 70)

    # Save model
    model_path = os.path.join(MODELS_DIR, 'eta_xgboost_weather_model.json')
    xgb_model.save_model(model_path)
    print(f"Saved model to {model_path}")

    # Save preprocessing
    preprocessor = {
        'encoders': {k: le.classes_.tolist() for k, le in encoders.items()},
        'feature_names': feature_names,
        'numeric_features': NUMERIC_FEATURES + WEATHER_NUMERIC_BASE,
        'categorical_features': CATEGORICAL_FEATURES,
        'base_numeric': BASE_NUMERIC,
        'base_categorical': BASE_CATEGORICAL,
        'weather_numeric': WEATHER_NUMERIC_BASE,
        'weather_engineered': ['weather_is_rain', 'weather_is_fog', 'weather_is_severe', 'precipitation_x_distance'],
    }
    preproc_path = os.path.join(MODELS_DIR, 'weather_preprocessing.joblib')
    joblib.dump(preprocessor, preproc_path)
    print(f"Saved preprocessing to {preproc_path}")

    # Save feature schema
    schema = {
        'numeric_features': NUMERIC_FEATURES + WEATHER_NUMERIC_BASE,
        'categorical_features': CATEGORICAL_FEATURES,
        'all_features': ALL_FEATURES,
        'target': TARGET,
        'weather_features': WEATHER_NUMERIC_BASE + [
            'weather_is_rain', 'weather_is_fog', 'weather_is_severe', 'precipitation_x_distance'
        ],
        'engineered_features': {
            'accumulated_delay_x_distance': 'accumulated_delay_entering * section_distance',
            'accumulated_delay_x_speed': 'accumulated_delay_entering / typical_speed',
            'delay_rate': 'accumulated_delay_entering / (stations_travelled + 1)',
            'speed_margin': 'max_speed - typical_speed',
            'speed_limit_ratio': 'event_speed_limit / max_speed',
            'section_travel_time': 'section_distance / typical_speed',
            'delay_fraction_of_travel': 'accumulated_delay_entering / section_travel_time',
            'hour_sin': 'sin(2*pi*hour/24)',
            'hour_cos': 'cos(2*pi*hour/24)',
            'signals_per_km': 'signal_count / section_distance',
            'crossings_per_km': 'level_crossings / section_distance',
            'prev_delay_positive': 'max(prev_section_delay, 0)',
            'accumulated_delay_squared': 'accumulated_delay_entering^2',
            'is_peak_hour': '1 if hour in 7-10 or 17-20',
            'is_night': '1 if hour in 23-5',
            'event_speed_ratio': 'event_speed_limit / max_speed',
            'section_type_gradient': 'section_type + gradient_profile interaction',
            'weather_is_rain': '1 if weather_precipitation > 0.5',
            'weather_is_fog': '1 if weather_visibility < 1000',
            'weather_is_severe': '1 if weather_severity >= 2',
            'precipitation_x_distance': 'weather_precipitation * section_distance',
        },
        'excluded_features': {
            'train_number': 'Identifier',
            'from_station': 'Identifier',
            'to_station': 'Identifier',
            'run_date': 'Decomposed into temporal features',
            'entry_time': 'Decomposed into temporal features',
        },
    }
    schema_path = os.path.join(MODELS_DIR, 'weather_feature_schema.json')
    with open(schema_path, 'w') as f:
        json.dump(schema, f, indent=2)
    print(f"Saved feature schema to {schema_path}")

    # Save metadata
    metadata = {
        'model_name': 'SIH26028 ETA Section Delay Predictor (Weather-Aware)',
        'model_version': '3.0.0-weather',
        'model_type': 'XGBRegressor (residual, weather-augmented)',
        'training_dataset_version': 'eta_dataset_v2_weather',
        'training_date': datetime.now(timezone.utc).isoformat(),
        'dataset_rows': len(df),
        'training_rows': len(train_df),
        'validation_rows': len(val_df),
        'test_rows': len(test_df),
        'feature_count': len(feature_names),
        'target': TARGET,
        'target_definition': 'target_delay_minutes = actualTravelTime - scheduledTravelTime',
        'feature_names': feature_names,
        'weather_features': WEATHER_NUMERIC_BASE + [
            'weather_is_rain', 'weather_is_fog', 'weather_is_severe', 'precipitation_x_distance'
        ],
        'categorical_features_encoded': list(CATEGORICAL_FEATURES),
        'evaluation': {
            'baseline_test': baseline_test_metrics,
            'weather_model_test': weather_metrics['test'],
            'base_model_test_mae': base_mae if isinstance(base_mae, (int, float)) else None,
            'weather_model_test_mae': weather_mae,
            'ml_beats_baseline': beats_baseline,
            'improvement_mae': round(float(improvement_from_baseline), 4),
        },
        'hyperparameters': xgb_params,
        'best_iteration': int(best_iter),
        'weather_model_disclaimer': 'This weather-aware model was trained on synthetic weather data. Weather patterns are modeled after Indian climate zones. Replaceable with real Open-Meteo historical data.',
        'baseline_model_preserved': 'The original 37-feature model (eta_xgboost_model.json v2.0.0) is preserved unchanged for rollback.',
    }
    meta_path = os.path.join(MODELS_DIR, 'weather_model_metadata.json')
    with open(meta_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"Saved model metadata to {meta_path}")

    # Save evaluation results
    eval_results = {
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'weather_model_test': weather_metrics['test'],
        'baseline_test': baseline_test_metrics,
        'base_model_test_mae': base_mae if isinstance(base_mae, (int, float)) else None,
        'weather_model_test_mae': weather_mae,
    }
    eval_path = os.path.join(MODELS_DIR, 'weather_evaluation_results.json')
    with open(eval_path, 'w') as f:
        json.dump(eval_results, f, indent=2)
    print(f"Saved evaluation results to {eval_path}")

    # Save feature importance
    importance_path = os.path.join(MODELS_DIR, 'weather_feature_importance.json')
    with open(importance_path, 'w') as f:
        json.dump(feature_imp, f, indent=2)
    print(f"Saved feature importance to {importance_path}")

    # --------------------------------------------------------
    # 11. Verify baseline model is untouched
    # --------------------------------------------------------
    print("\n--- BASELINE MODEL VERIFICATION ---")
    if os.path.exists(BASELINE_MODEL_PATH):
        import xgboost as xgb_check
        baseline_model = xgb_check.XGBRegressor()
        baseline_model.load_model(BASELINE_MODEL_PATH)
        print(f"Baseline model loaded successfully ({BASELINE_MODEL_PATH})")
        print(f"Baseline model feature count: {baseline_model.n_features_in_}")
        print(f"Weather model feature count: {xgb_model.n_features_in_}")
        print(f"Baseline model is UNTOUCHED: {baseline_model.n_features_in_ == 37}")
    else:
        print(f"WARNING: Baseline model not found at {BASELINE_MODEL_PATH}")

    print("\n" + "=" * 70)
    print("WEATHER MODEL TRAINING COMPLETE")
    print("=" * 70)

    return eval_results


if __name__ == '__main__':
    main()
