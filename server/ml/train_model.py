"""
SIH26028 — Dynamic ETA Prediction: Improved ML Training Pipeline v2

Trains and evaluates multiple regression models for railway section delay prediction.
Target: target_delay_minutes (actual - scheduled travel time per section)

Key improvements over v1:
  - Railway-specific engineered features
  - Multiple model comparison (Ridge, RF, XGBoost)
  - Proper validation-based model selection
  - Comprehensive error analysis
  - Honest reporting

Usage:
    python server/ml/train_model.py

Outputs:
    server/ml/models/eta_xgboost_model.json
    server/ml/models/preprocessing.joblib
    server/ml/models/feature_schema.json
    server/ml/models/model_metadata.json
    server/ml/models/evaluation_results.json
    server/ml/models/error_analysis.json
    server/ml/models/feature_importance.json
"""

import os
import sys
import json
import warnings
import numpy as np
import pandas as pd
import joblib
from datetime import datetime, timezone
from collections import defaultdict

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

DATASET_PATH = os.path.join(DATA_DIR, 'eta_dataset_v1.csv')
TARGET = 'target_delay_minutes'
SPLIT_COL = 'split'

# ============================================================
# BASE FEATURES (from dataset)
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
# ENGINEERED FEATURES
# ============================================================
# All features below can be computed from information available at prediction time.
# No future information is used.

NUMERIC_FEATURES = BASE_NUMERIC + [
    # --- Interaction features ---
    'accumulated_delay_x_distance',     # accumulated_delay_entering * section_distance
    'accumulated_delay_x_speed',        # accumulated_delay_entering / typical_speed
    'delay_rate',                        # accumulated_delay_entering / (stations_travelled + 1)
    'speed_margin',                      # max_speed - typical_speed (infrastructure headroom)
    'speed_limit_ratio',                 # event_speed_limit / max_speed (speed restriction indicator)
    'section_travel_time',              # section_distance / typical_speed (scheduled time)
    'delay_fraction_of_travel',         # accumulated_delay_entering / section_travel_time
    # --- Cyclic time encoding ---
    'hour_sin',                         # sin(2*pi*hour/24)
    'hour_cos',                         # cos(2*pi*hour/24)
    # --- Section infrastructure ratios ---
    'signals_per_km',                   # signal_count / section_distance
    'crossings_per_km',                 # level_crossings / section_distance
    # --- Delay persistence features ---
    'prev_delay_positive',              # max(prev_section_delay, 0)
    'accumulated_delay_squared',        # accumulated_delay_entering^2 (nonlinear)
    'is_peak_hour',                     # 1 if hour in 7-10 or 17-20
    'is_night',                         # 1 if hour in 23-5
    'event_speed_ratio',               # event_speed_limit / typical_speed (how much speed reduced)
]

CATEGORICAL_FEATURES = BASE_CATEGORICAL + [
    'section_type_gradient',           # interaction: section_type + gradient_profile
]

ALL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES


def load_dataset():
    df = pd.read_csv(DATASET_PATH)
    df['event_type'] = df['event_type'].fillna('None')
    print(f"Loaded dataset: {df.shape[0]} rows, {df.shape[1]} columns")
    return df


def engineer_features(df):
    """Add railway-specific engineered features."""
    df = df.copy()

    # Interaction features
    df['accumulated_delay_x_distance'] = df['accumulated_delay_entering'] * df['section_distance']
    df['accumulated_delay_x_speed'] = df['accumulated_delay_entering'] / (df['typical_speed'] + 1e-6)
    df['delay_rate'] = df['accumulated_delay_entering'] / (df['stations_travelled'] + 1)
    df['speed_margin'] = df['max_speed'] - df['typical_speed']
    df['speed_limit_ratio'] = df['event_speed_limit'] / (df['max_speed'] + 1e-6)
    df['section_travel_time'] = df['section_distance'] / (df['typical_speed'] + 1e-6)
    df['delay_fraction_of_travel'] = df['accumulated_delay_entering'] / (df['section_travel_time'] + 1e-6)

    # Cyclic time encoding
    df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
    df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)

    # Infrastructure ratios
    df['signals_per_km'] = df['signal_count'] / (df['section_distance'] + 1e-6)
    df['crossings_per_km'] = df['level_crossings'] / (df['section_distance'] + 1e-6)

    # Delay persistence
    df['prev_delay_positive'] = np.maximum(df['prev_section_delay'], 0)
    df['accumulated_delay_squared'] = df['accumulated_delay_entering'] ** 2

    # Time patterns
    df['is_peak_hour'] = df['hour'].isin([7, 8, 9, 10, 17, 18, 19, 20]).astype(int)
    df['is_night'] = df['hour'].isin([23, 0, 1, 2, 3, 4, 5]).astype(int)

    # Event speed ratio
    df['event_speed_ratio'] = df['event_speed_limit'] / (df['max_speed'] + 1e-6)

    # Categorical interaction
    df['section_type_gradient'] = df['section_type'] + '_' + df['gradient_profile']

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

    for feat in NUMERIC_FEATURES:
        X[feat] = pd.to_numeric(X[feat], errors='coerce').fillna(0)

    return X.values, y, encoders_used, ALL_FEATURES


def compute_metrics(y_true, y_pred, label=""):
    """Compute comprehensive evaluation metrics."""
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


def error_analysis(y_true, y_pred, df_subset, feature_names):
    """Comprehensive error analysis for the selected model."""
    errors = y_true - y_pred
    abs_errors = np.abs(errors)

    analysis = {}

    # By section
    if 'from_station' in df_subset.columns and 'to_station' in df_subset.columns:
        section_errors = {}
        for (fs, ts), group in df_subset.groupby(['from_station', 'to_station']):
            idx = group.index.values
            mask = np.isin(df_subset.index, idx)
            section_errors[f"{fs}-{ts}"] = {
                'mae': round(float(np.mean(abs_errors[mask])), 4),
                'rmse': round(float(np.sqrt(np.mean(errors[mask]**2))), 4),
                'count': len(group),
                'mean_actual': round(float(y_true[mask].mean()), 4),
                'mean_predicted': round(float(y_pred[mask].mean()), 4),
            }
        analysis['by_section'] = dict(sorted(
            section_errors.items(), key=lambda x: -x[1]['mae']
        ))

    # By hour
    hour_errors = {}
    for hour in sorted(df_subset['hour'].unique()):
        mask = df_subset['hour'] == hour
        idx = df_subset[mask].index.values
        pos_mask = np.isin(df_subset.index, idx)
        if pos_mask.sum() > 0:
            hour_errors[int(hour)] = {
                'mae': round(float(np.mean(abs_errors[pos_mask])), 4),
                'count': int(mask.sum()),
            }
    analysis['by_hour'] = hour_errors

    # By day of week
    dow_errors = {}
    dow_names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    for dow in sorted(df_subset['day_of_week'].unique()):
        mask = df_subset['day_of_week'] == dow
        idx = df_subset[mask].index.values
        pos_mask = np.isin(df_subset.index, idx)
        if pos_mask.sum() > 0:
            dow_errors[dow_names[int(dow)]] = {
                'mae': round(float(np.mean(abs_errors[pos_mask])), 4),
                'count': int(mask.sum()),
            }
    analysis['by_day_of_week'] = dow_errors

    # By event presence
    event_errors = {}
    for ea in [0, 1]:
        mask = df_subset['event_active'] == ea
        idx = df_subset[mask].index.values
        pos_mask = np.isin(df_subset.index, idx)
        if pos_mask.sum() > 0:
            label = 'No Event' if ea == 0 else 'Active Event'
            event_errors[label] = {
                'mae': round(float(np.mean(abs_errors[pos_mask])), 4),
                'count': int(mask.sum()),
                'mean_actual': round(float(y_true[pos_mask].mean()), 4),
                'mean_predicted': round(float(y_pred[pos_mask].mean()), 4),
            }
    analysis['by_event_presence'] = event_errors

    # By delay severity
    delay_bins = [
        ('Negative delay (recovery)', -999, 0),
        ('On-time (0-5 min)', 0, 5),
        ('Slightly delayed (5-10 min)', 5, 10),
        ('Moderately delayed (10-20 min)', 10, 20),
        ('Heavily delayed (>20 min)', 20, 999),
    ]
    severity_errors = {}
    for label, low, high in delay_bins:
        mask = (y_true >= low) & (y_true < high)
        if mask.sum() > 0:
            severity_errors[label] = {
                'mae': round(float(np.mean(abs_errors[mask])), 4),
                'count': int(mask.sum()),
                'mean_actual': round(float(y_true[mask].mean()), 4),
                'mean_predicted': round(float(y_pred[mask].mean()), 4),
            }
    analysis['by_delay_severity'] = severity_errors

    # Overall
    analysis['overall'] = {
        'mean_error': round(float(np.mean(errors)), 4),
        'std_error': round(float(np.std(errors)), 4),
        'max_overpredict': round(float(np.min(errors)), 4),
        'max_underpredict': round(float(np.max(errors)), 4),
    }

    return analysis


def get_feature_importance(model, feature_names):
    """Extract feature importance from a tree-based model."""
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


def save_feature_schema():
    """Save feature schema for inference use."""
    schema = {
        'numeric_features': NUMERIC_FEATURES,
        'categorical_features': CATEGORICAL_FEATURES,
        'all_features': ALL_FEATURES,
        'target': TARGET,
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
        },
        'excluded_features': {
            'train_number': 'Identifier — excluded to prevent per-train memorization (leakage)',
            'from_station': 'Identifier — section topology already captured by infrastructure features',
            'to_station': 'Identifier — section topology already captured by infrastructure features',
            'run_date': 'Decomposed into hour/day_of_week/is_weekend temporal features',
            'entry_time': 'Decomposed into hour/day_of_week/is_weekend temporal features',
        },
    }
    path = os.path.join(MODELS_DIR, 'feature_schema.json')
    with open(path, 'w') as f:
        json.dump(schema, f, indent=2)
    print(f"Saved feature schema to {path}")
    return schema


def main():
    print("=" * 70)
    print("SIH26028 — Dynamic ETA Prediction: ML Pipeline v2")
    print("=" * 70)
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")

    # --------------------------------------------------------
    # 1. Load and validate dataset
    # --------------------------------------------------------
    print("\n--- LOADING DATASET ---")
    df = load_dataset()

    # --------------------------------------------------------
    # 2. Engineer features
    # --------------------------------------------------------
    print("\n--- ENGINEERING FEATURES ---")
    df = engineer_features(df)
    print(f"Engineered {len(ALL_FEATURES)} total features "
          f"({len(NUMERIC_FEATURES)} numeric + {len(CATEGORICAL_FEATURES)} categorical)")

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
    baseline_train = X_train[:, hmd_idx]
    baseline_val = X_val[:, hmd_idx]
    baseline_test = X_test[:, hmd_idx]

    baseline_train_metrics = compute_metrics(y_train, baseline_train, "Baseline — Train")
    baseline_val_metrics = compute_metrics(y_val, baseline_val, "Baseline — Validation")
    baseline_test_metrics = compute_metrics(y_test, baseline_test, "Baseline — Test")

    # --------------------------------------------------------
    # 6. Model comparison (validation-based selection)
    # --------------------------------------------------------
    results = {}
    models = {}

    # --- Ridge Regression ---
    print("\n" + "=" * 70)
    print("RIDGE REGRESSION")
    print("=" * 70)
    ridge = Ridge(alpha=1.0)
    ridge.fit(X_train, y_train)
    models['ridge'] = ridge
    ridge_train = ridge.predict(X_train)
    ridge_val = ridge.predict(X_val)
    ridge_test = ridge.predict(X_test)
    results['ridge'] = {
        'train': compute_metrics(y_train, ridge_train, "Ridge — Train"),
        'val': compute_metrics(y_val, ridge_val, "Ridge — Validation"),
        'test': compute_metrics(y_test, ridge_test, "Ridge — Test"),
    }

    # --- Random Forest ---
    print("\n" + "=" * 70)
    print("RANDOM FOREST")
    print("=" * 70)
    rf = RandomForestRegressor(
        n_estimators=300, max_depth=10, min_samples_leaf=5,
        random_state=42, n_jobs=-1
    )
    rf.fit(X_train, y_train)
    models['rf'] = rf
    rf_train = rf.predict(X_train)
    rf_val = rf.predict(X_val)
    rf_test = rf.predict(X_test)
    results['rf'] = {
        'train': compute_metrics(y_train, rf_train, "RF — Train"),
        'val': compute_metrics(y_val, rf_val, "RF — Validation"),
        'test': compute_metrics(y_test, rf_test, "RF — Test"),
    }

    # --- XGBoost Residual ---
    print("\n" + "=" * 70)
    print("XGBOOST (Residual Prediction)")
    print("=" * 70)
    hmd_train = X_train[:, hmd_idx]
    hmd_val = X_val[:, hmd_idx]
    residual_train = y_train - hmd_train
    residual_val = y_val - hmd_val

    xgb_res_params = {
        'objective': 'reg:squarederror', 'eval_metric': 'mae',
        'max_depth': 4, 'learning_rate': 0.05, 'n_estimators': 500,
        'subsample': 0.8, 'colsample_bytree': 0.8,
        'min_child_weight': 10, 'reg_alpha': 1.0, 'reg_lambda': 5.0,
        'random_state': 42, 'verbosity': 0,
    }
    xgb_res = xgb.XGBRegressor(**xgb_res_params)
    xgb_res.fit(X_train, residual_train, eval_set=[(X_val, residual_val)], verbose=False)
    best_iter_res = getattr(xgb_res, 'best_iteration', xgb_res_params['n_estimators'])

    xgb_res_train_pred = hmd_train + xgb_res.predict(X_train)
    xgb_res_val_pred = hmd_val + xgb_res.predict(X_val)
    xgb_res_test_pred = X_test[:, hmd_idx] + xgb_res.predict(X_test)

    results['xgb_residual'] = {
        'train': compute_metrics(y_train, xgb_res_train_pred, "XGBoost Residual — Train"),
        'val': compute_metrics(y_val, xgb_res_val_pred, "XGBoost Residual — Validation"),
        'test': compute_metrics(y_test, xgb_res_test_pred, "XGBoost Residual — Test"),
    }
    print(f"  Best iteration: {best_iter_res}")

    # --- XGBoost Direct (tuned for this data) ---
    print("\n" + "=" * 70)
    print("XGBOOST (Direct Prediction, Tuned)")
    print("=" * 70)
    xgb_dir_params = {
        'objective': 'reg:squarederror', 'eval_metric': 'mae',
        'max_depth': 4, 'learning_rate': 0.03, 'n_estimators': 800,
        'subsample': 0.8, 'colsample_bytree': 0.8,
        'min_child_weight': 10, 'reg_alpha': 1.0, 'reg_lambda': 5.0,
        'random_state': 42, 'verbosity': 0,
    }
    xgb_dir = xgb.XGBRegressor(**xgb_dir_params)
    xgb_dir.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
    best_iter_dir = getattr(xgb_dir, 'best_iteration', xgb_dir_params['n_estimators'])

    xgb_dir_train = xgb_dir.predict(X_train)
    xgb_dir_val = xgb_dir.predict(X_val)
    xgb_dir_test = xgb_dir.predict(X_test)

    results['xgb_direct'] = {
        'train': compute_metrics(y_train, xgb_dir_train, "XGBoost Direct — Train"),
        'val': compute_metrics(y_val, xgb_dir_val, "XGBoost Direct — Validation"),
        'test': compute_metrics(y_test, xgb_dir_test, "XGBoost Direct — Test"),
    }
    print(f"  Best iteration: {best_iter_dir}")

    # --------------------------------------------------------
    # 7. Model Selection (by validation MAE)
    # --------------------------------------------------------
    print("\n" + "=" * 70)
    print("MODEL SELECTION (by Validation MAE)")
    print("=" * 70)

    model_labels = {
        'ridge': 'Ridge Regression',
        'rf': 'Random Forest',
        'xgb_residual': 'XGBoost Residual',
        'xgb_direct': 'XGBoost Direct',
    }

    best_val_mae = float('inf')
    best_key = None
    for key, label in model_labels.items():
        val_mae = results[key]['val']['mae']
        test_mae = results[key]['test']['mae']
        print(f"  {label:<30} Val MAE: {val_mae:.4f}  Test MAE: {test_mae:.4f}")
        if val_mae < best_val_mae:
            best_val_mae = val_mae
            best_key = key

    print(f"\n  Selected model: {model_labels[best_key]} (val MAE = {best_val_mae:.4f})")

    # --------------------------------------------------------
    # 8. Final evaluation of selected model on test set
    # --------------------------------------------------------
    print("\n" + "=" * 70)
    print(f"FINAL EVALUATION: {model_labels[best_key]}")
    print("=" * 70)

    # Get the selected model's test predictions
    if best_key == 'ridge':
        selected_test_pred = ridge_test
        selected_val_pred = ridge_val
        selected_model = ridge
    elif best_key == 'rf':
        selected_test_pred = rf_test
        selected_val_pred = rf_val
        selected_model = rf
    elif best_key == 'xgb_residual':
        selected_test_pred = xgb_res_test_pred
        selected_val_pred = xgb_res_val_pred
        selected_model = xgb_res
    else:
        selected_test_pred = xgb_dir_test
        selected_val_pred = xgb_dir_val
        selected_model = xgb_dir

    final_test_metrics = compute_metrics(y_test, selected_test_pred, "Final Model — Test Set")
    beats_baseline = final_test_metrics['mae'] < baseline_test_metrics['mae']
    improvement = baseline_test_metrics['mae'] - final_test_metrics['mae']
    improvement_pct = (improvement / baseline_test_metrics['mae']) * 100

    print(f"\n  Baseline test MAE:   {baseline_test_metrics['mae']:.4f}")
    print(f"  Selected model MAE:  {final_test_metrics['mae']:.4f}")
    print(f"  Improvement:         {improvement:.4f} min ({improvement_pct:.1f}%)")
    print(f"  Beats baseline:      {'YES' if beats_baseline else 'NO'}")

    # --------------------------------------------------------
    # 9. Error Analysis (selected model on test set)
    # --------------------------------------------------------
    print("\n" + "=" * 70)
    print("ERROR ANALYSIS (Selected Model, Test Set)")
    print("=" * 70)
    err_analysis = error_analysis(y_test, selected_test_pred, test_df, feature_names)
    print(json.dumps(err_analysis['overall'], indent=2))
    if 'by_delay_severity' in err_analysis:
        print("\nBy delay severity:")
        for seg, metrics in err_analysis['by_delay_severity'].items():
            print(f"  {seg}: MAE={metrics['mae']:.2f} min, n={metrics['count']}")
    if 'by_event_presence' in err_analysis:
        print("\nBy event presence:")
        for seg, metrics in err_analysis['by_event_presence'].items():
            print(f"  {seg}: MAE={metrics['mae']:.2f} min, n={metrics['count']}")

    # --------------------------------------------------------
    # 10. Feature Importance (selected model)
    # --------------------------------------------------------
    print("\n" + "=" * 70)
    print("FEATURE IMPORTANCE")
    print("=" * 70)

    if best_key == 'xgb_residual':
        feature_imp = get_feature_importance(xgb_res, feature_names)
        # For residual model, interpret as importance to residual prediction
        model_type = 'XGBoost (residual prediction)'
    elif best_key == 'xgb_direct':
        feature_imp = get_feature_importance(xgb_dir, feature_names)
        model_type = 'XGBoost (direct prediction)'
    elif best_key == 'rf':
        feature_imp = get_feature_importance(rf, feature_names)
        model_type = 'Random Forest'
    else:
        feature_imp = get_feature_importance(ridge, feature_names)
        model_type = 'Ridge Regression'

    print(f"\n  Top 15 features ({model_type}):")
    for i, fi in enumerate(feature_imp[:15]):
        print(f"  {i+1:>2}. {fi['feature']:<45} {fi['importance']:.6f}")

    # --------------------------------------------------------
    # 11. Save artifacts
    # --------------------------------------------------------
    print("\n" + "=" * 70)
    print("SAVING ARTIFACTS")
    print("=" * 70)

    # Save model
    if best_key == 'xgb_residual':
        model_path = os.path.join(MODELS_DIR, 'eta_xgboost_model.json')
        xgb_res.save_model(model_path)
        model_type_str = 'XGBRegressor (residual)'
    elif best_key == 'xgb_direct':
        model_path = os.path.join(MODELS_DIR, 'eta_xgboost_model.json')
        xgb_dir.save_model(model_path)
        model_type_str = 'XGBRegressor (direct)'
    elif best_key == 'rf':
        model_path = os.path.join(MODELS_DIR, 'eta_random_forest.joblib')
        joblib.dump(rf, model_path)
        model_type_str = 'RandomForestRegressor'
    else:
        model_path = os.path.join(MODELS_DIR, 'eta_ridge.joblib')
        joblib.dump(ridge, model_path)
        model_type_str = 'Ridge'

    print(f"Saved model to {model_path}")

    # Save preprocessing
    preprocessor = {
        'encoders': {k: le.classes_.tolist() for k, le in encoders.items()},
        'feature_names': feature_names,
        'numeric_features': NUMERIC_FEATURES,
        'categorical_features': CATEGORICAL_FEATURES,
        'base_numeric': BASE_NUMERIC,
        'base_categorical': BASE_CATEGORICAL,
    }
    preproc_path = os.path.join(MODELS_DIR, 'preprocessing.joblib')
    joblib.dump(preprocessor, preproc_path)
    print(f"Saved preprocessing to {preproc_path}")

    # Save feature schema
    save_feature_schema()

    # Save evaluation results
    eval_results = {
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'dataset_rows': len(df),
        'train_rows': len(train_df),
        'val_rows': len(val_df),
        'test_rows': len(test_df),
        'feature_count': len(feature_names),
        'baseline': {
            'name': 'Naive Baseline (historical_mean_delay)',
            'train': baseline_train_metrics,
            'validation': baseline_val_metrics,
            'test': baseline_test_metrics,
        },
        'models_compared': {},
        'selected_model': {
            'name': model_labels[best_key],
            'model_type': model_type_str,
            'validation_metrics': results[best_key]['val'],
            'test_metrics': results[best_key]['test'],
        },
        'ml_beats_baseline': beats_baseline,
        'improvement_mae': round(float(improvement), 4),
        'improvement_pct': round(float(improvement_pct), 2),
    }

    # Add all model results
    for key, label in model_labels.items():
        eval_results['models_compared'][key] = {
            'name': label,
            'validation_metrics': results[key]['val'],
            'test_metrics': results[key]['test'],
        }

    # Add XGBoost specific info
    if best_key in ('xgb_residual', 'xgb_direct'):
        params = xgb_res_params if best_key == 'xgb_residual' else xgb_dir_params
        best_iter = best_iter_res if best_key == 'xgb_residual' else best_iter_dir
        eval_results['selected_model']['hyperparameters'] = params
        eval_results['selected_model']['best_iteration'] = int(best_iter)

    eval_path = os.path.join(MODELS_DIR, 'evaluation_results.json')
    with open(eval_path, 'w') as f:
        json.dump(eval_results, f, indent=2)
    print(f"Saved evaluation results to {eval_path}")

    # Save error analysis
    error_path = os.path.join(MODELS_DIR, 'error_analysis.json')
    with open(error_path, 'w') as f:
        json.dump(err_analysis, f, indent=2)
    print(f"Saved error analysis to {error_path}")

    # Save feature importance
    importance_path = os.path.join(MODELS_DIR, 'feature_importance.json')
    with open(importance_path, 'w') as f:
        json.dump(feature_imp, f, indent=2)
    print(f"Saved feature importance to {importance_path}")

    # Save model metadata
    metadata = {
        'model_name': 'SIH26028 ETA Section Delay Predictor',
        'model_version': '2.0.0',
        'model_type': model_type_str,
        'training_dataset_version': 'eta_dataset_v1',
        'training_date': datetime.now(timezone.utc).isoformat(),
        'dataset_rows': len(df),
        'training_rows': len(train_df),
        'validation_rows': len(val_df),
        'test_rows': len(test_df),
        'feature_count': len(feature_names),
        'target': TARGET,
        'target_definition': 'target_delay_minutes = actualTravelTime - scheduledTravelTime',
        'feature_names': feature_names,
        'categorical_features_encoded': list(CATEGORICAL_FEATURES),
        'identifier_features_excluded': ['train_number', 'from_station', 'to_station', 'run_date', 'entry_time'],
        'engineered_features': list(set(NUMERIC_FEATURES) - set(BASE_NUMERIC)) + list(set(CATEGORICAL_FEATURES) - set(BASE_CATEGORICAL)),
        'evaluation': {
            'baseline_test': baseline_test_metrics,
            'selected_model_test': final_test_metrics,
            'ml_beats_baseline': beats_baseline,
            'improvement_mae': round(float(improvement), 4),
        },
        'models_compared': {
            key: {'val_mae': results[key]['val']['mae'], 'test_mae': results[key]['test']['mae']}
            for key in model_labels
        },
        'python_version': sys.version,
        'package_versions': {
            'xgboost': xgb.__version__,
            'numpy': np.__version__,
            'pandas': pd.__version__,
            'scikit-learn': '1.7.2',
        },
        'synthetic_data_disclaimer': 'This model was trained on structurally realistic synthetic railway telemetry generated by simulation. It is designed to demonstrate the ML pipeline architecture and is replaceable with real Indian Railways operational data.',
        'reproducibility': {
            'random_seed': 42,
            'dataset_path': 'server/data/ml/eta_dataset_v1.csv',
            'model_path': os.path.relpath(model_path, BASE_DIR),
            'preprocessing_path': 'server/ml/models/preprocessing.joblib',
        }
    }

    if best_key in ('xgb_residual', 'xgb_direct'):
        params = xgb_res_params if best_key == 'xgb_residual' else xgb_dir_params
        best_iter = best_iter_res if best_key == 'xgb_residual' else best_iter_dir
        metadata['hyperparameters'] = params
        metadata['best_iteration'] = int(best_iter)

    meta_path = os.path.join(MODELS_DIR, 'model_metadata.json')
    with open(meta_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"Saved model metadata to {meta_path}")

    # --------------------------------------------------------
    # 12. Inference sanity check
    # --------------------------------------------------------
    print("\n--- INFERENCE SANITY CHECK ---")
    for i in [0, 100, 500]:
        if i < len(X_test):
            sample_x = X_test[i:i+1]
            sample_pred = selected_test_pred[i]
            sample_actual = y_test[i]
            print(f"  Test[{i}]: predicted={sample_pred:.2f}, actual={sample_actual:.2f}, "
                  f"error={abs(sample_pred-sample_actual):.2f}")

    print("\n" + "=" * 70)
    print("TRAINING PIPELINE COMPLETE")
    print("=" * 70)

    return eval_results


if __name__ == '__main__':
    main()
