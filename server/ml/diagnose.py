"""
Phase 3A — Comprehensive Diagnostic Script
Reads dataset, diagnoses why baseline beats XGBoost, tests multiple models.
All operations are read-only except for diagnostic output.
"""

import os
import sys
import json
import warnings
import numpy as np
import pandas as pd
import joblib
from collections import defaultdict

from sklearn.preprocessing import LabelEncoder
from sklearn.linear_model import Ridge
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import xgboost as xgb

warnings.filterwarnings('ignore', category=UserWarning)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, '..', 'data', 'ml')
DATASET_PATH = os.path.join(DATA_DIR, 'eta_dataset_v1.csv')

TARGET = 'target_delay_minutes'
SPLIT_COL = 'split'

NUMERIC_FEATURES = [
    'accumulated_delay_entering', 'prev_section_travel_time', 'prev_section_delay',
    'stations_travelled', 'stations_remaining', 'section_distance', 'typical_speed',
    'max_speed', 'signal_count', 'level_crossings', 'hour', 'day_of_week',
    'is_weekend', 'event_active', 'event_speed_limit', 'historical_mean_travel_time',
    'historical_mean_delay',
]
CATEGORICAL_FEATURES = ['section_type', 'gradient_profile', 'event_type']
ALL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES


def load_data():
    df = pd.read_csv(DATASET_PATH)
    df['event_type'] = df['event_type'].fillna('None')
    return df


def prepare_features(df, encoders=None):
    X = df[ALL_FEATURES].copy()
    y = df[TARGET].values

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

    return X.values, y, encoders_used


def compute_metrics(y_true, y_pred):
    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    r2 = r2_score(y_true, y_pred)
    errors = y_true - y_pred
    within_5 = np.mean(np.abs(errors) <= 5.0) * 100
    within_10 = np.mean(np.abs(errors) <= 10.0) * 100
    return {
        'mae': round(float(mae), 4),
        'rmse': round(float(rmse), 4),
        'r2': round(float(r2), 4),
        'pct_within_5min': round(float(within_5), 2),
        'pct_within_10min': round(float(within_10), 2),
        'mean_error': round(float(np.mean(errors)), 4),
        'std_error': round(float(np.std(errors)), 4),
    }


def main():
    print("=" * 70)
    print("PHASE 3A COMPREHENSIVE DIAGNOSTIC")
    print("=" * 70)

    df = load_data()
    print(f"\nDataset: {len(df)} rows, {len(df.columns)} columns")

    train_df = df[df[SPLIT_COL] == 'train'].copy()
    val_df = df[df[SPLIT_COL] == 'validation'].copy()
    test_df = df[df[SPLIT_COL] == 'test'].copy()
    print(f"Train: {len(train_df)}, Val: {len(val_df)}, Test: {len(test_df)}")

    # -----------------------------------------------------------
    # SECTION A: TARGET DISTRIBUTION
    # -----------------------------------------------------------
    print("\n" + "=" * 70)
    print("A. TARGET DISTRIBUTION")
    print("=" * 70)
    for split_name, sdf in [('train', train_df), ('validation', val_df), ('test', test_df)]:
        t = sdf[TARGET]
        print(f"\n  {split_name}: n={len(t)}")
        print(f"    mean={t.mean():.4f}, std={t.std():.4f}, min={t.min():.2f}, max={t.max():.2f}")
        print(f"    median={t.median():.2f}, skew={t.skew():.4f}")
        print(f"    quartiles: 25%={t.quantile(0.25):.2f}, 50%={t.quantile(0.50):.2f}, 75%={t.quantile(0.75):.2f}")
        pct_neg = (t < 0).mean() * 100
        pct_zero = (t == 0).mean() * 100
        pct_gt10 = (t > 10).mean() * 100
        pct_gt20 = (t > 20).mean() * 100
        print(f"    % negative: {pct_neg:.1f}%, % zero: {pct_zero:.1f}%, % >10min: {pct_gt10:.1f}%, % >20min: {pct_gt20:.1f}%")

    # -----------------------------------------------------------
    # SECTION B: FEATURE-TARGET CORRELATIONS
    # -----------------------------------------------------------
    print("\n" + "=" * 70)
    print("B. FEATURE-TARGET CORRELATIONS (on train set)")
    print("=" * 70)

    for feat in NUMERIC_FEATURES + ['target_delay_minutes']:
        corr = train_df[feat].corr(train_df[TARGET])
        print(f"  {feat:<40} r = {corr:+.4f}")

    # -----------------------------------------------------------
    # SECTION C: HISTORICAL_MEAN_DELAY ANALYSIS (THE KEY QUESTION)
    # -----------------------------------------------------------
    print("\n" + "=" * 70)
    print("C. WHY BASELINE WINS — historical_mean_delay analysis")
    print("=" * 70)

    for split_name, sdf in [('train', train_df), ('validation', val_df), ('test', test_df)]:
        hmd = sdf['historical_mean_delay']
        target = sdf[TARGET]
        corr = hmd.corr(target)
        residuals_from_hmd = target - hmd
        mae_hmd = mean_absolute_error(target, hmd)
        print(f"\n  {split_name}:")
        print(f"    hmd mean={hmd.mean():.4f}, std={hmd.std():.4f}")
        print(f"    correlation(hmd, target) = {corr:.4f}")
        print(f"    MAE of hmd baseline: {mae_hmd:.4f}")
        print(f"    Residual std (target - hmd): {residuals_from_hmd.std():.4f}")
        print(f"    Target std: {target.std():.4f}")
        variance_explained = 1 - (residuals_from_hmd.var() / target.var())
        print(f"    Variance explained by hmd: {variance_explained:.4f}")

    # Check: is hmd basically equal to the section's average delay?
    print("\n  Per-section analysis (train set):")
    for (fs, ts), grp in train_df.groupby(['from_station', 'to_station']):
        section_mean_target = grp[TARGET].mean()
        section_mean_hmd = grp['historical_mean_delay'].mean()
        n = len(grp)
        corr = grp['historical_mean_delay'].corr(grp[TARGET])
        print(f"    {fs}-{ts}: n={n}, mean_target={section_mean_target:.3f}, "
              f"mean_hmd={section_mean_hmd:.3f}, corr={corr:.4f}")

    # -----------------------------------------------------------
    # SECTION D: EXTEND_DATASET BUG CHECK
    # -----------------------------------------------------------
    print("\n" + "=" * 70)
    print("D. EXTEND_DATASET.PY BUG CHECK")
    print("=" * 70)
    # The extend_dataset.py references entry_hour at lines 170,174 before
    # it's defined at line 248. This would cause a NameError.
    print("  extend_dataset.py bug: 'entry_hour' used at lines 170,174 before definition at line 248")
    print("  This script CANNOT run as-is. The existing dataset was likely generated")
    print("  by a previous version of extend_dataset.py or manually.")

    # -----------------------------------------------------------
    # SECTION E: TRAIN/VAL/TEST DISTRIBUTION COMPARISON
    # -----------------------------------------------------------
    print("\n" + "=" * 70)
    print("E. TRAIN/VAL/TEST DISTRIBUTION COMPARISON")
    print("=" * 70)
    for feat in NUMERIC_FEATURES + [TARGET]:
        train_stats = train_df[feat].describe()
        val_stats = val_df[feat].describe()
        test_stats = test_df[feat].describe()
        print(f"\n  {feat}:")
        print(f"    Train: mean={train_stats['mean']:.4f}, std={train_stats['std']:.4f}")
        print(f"    Val:   mean={val_stats['mean']:.4f}, std={val_stats['std']:.4f}")
        print(f"    Test:  mean={test_stats['mean']:.4f}, std={test_stats['std']:.4f}")

    # Check distribution shift
    print("\n  Distribution shift (test mean - train mean):")
    for feat in NUMERIC_FEATURES + [TARGET]:
        shift = test_df[feat].mean() - train_df[feat].mean()
        pct_shift = (shift / (train_df[feat].std() + 1e-10)) * 100
        print(f"    {feat:<40} shift={shift:+.4f} ({pct_shift:+.1f}% std)")

    # -----------------------------------------------------------
    # SECTION F: EVENT EFFECT ON DELAY
    # -----------------------------------------------------------
    print("\n" + "=" * 70)
    print("F. EVENT EFFECT ON DELAY")
    print("=" * 70)
    for split_name, sdf in [('train', train_df), ('test', test_df)]:
        no_event = sdf[sdf['event_active'] == 0][TARGET]
        event = sdf[sdf['event_active'] == 1][TARGET]
        print(f"\n  {split_name}:")
        print(f"    No event:   n={len(no_event)}, mean={no_event.mean():.4f}, std={no_event.std():.4f}")
        print(f"    With event: n={len(event)}, mean={event.mean():.4f}, std={event.std():.4f}")
        if len(event) > 1 and len(no_event) > 1:
            from scipy import stats
            t_stat, p_val = stats.ttest_ind(no_event, event)
            print(f"    t-test p-value: {p_val:.6f}")

    # Check event_type effects
    print("\n  Event type effects (train set):")
    event_types = train_df[train_df['event_active'] == 1].groupby('event_type')[TARGET].agg(['mean', 'std', 'count'])
    for et, row in event_types.iterrows():
        print(f"    {et:<25} mean={row['mean']:.3f}, std={row['std']:.3f}, n={int(row['count'])}")

    # -----------------------------------------------------------
    # SECTION G: FEATURE IMPORTANCE — RAW CORRELATIONS
    # -----------------------------------------------------------
    print("\n" + "=" * 70)
    print("G. RAW FEATURE IMPORTANCE (correlation with target, train set)")
    print("=" * 70)
    corrs = {}
    for feat in NUMERIC_FEATURES:
        corr = train_df[feat].corr(train_df[TARGET])
        corrs[feat] = abs(corr)
    for feat, corr in sorted(corrs.items(), key=lambda x: -x[1]):
        print(f"  {feat:<40} |r| = {corr:.4f}")

    # -----------------------------------------------------------
    # SECTION H: HISTORICAL_MEAN_DELAY AS A FUNCTION OF SECTION
    # -----------------------------------------------------------
    print("\n" + "=" * 70)
    print("H. SECTION-LEVEL HMD ACCURACY")
    print("=" * 70)
    for split_name, sdf in [('train', train_df), ('test', test_df)]:
        section_mae = {}
        for (fs, ts), grp in sdf.groupby(['from_station', 'to_station']):
            hmd_pred = grp['historical_mean_delay'].values
            actual = grp[TARGET].values
            mae = mean_absolute_error(actual, hmd_pred)
            section_mae[f"{fs}-{ts}"] = mae
        overall = mean_absolute_error(sdf[TARGET], sdf['historical_mean_delay'])
        print(f"\n  {split_name} overall baseline MAE: {overall:.4f}")
        sorted_sections = sorted(section_mae.items(), key=lambda x: -x[1])
        for s, m in sorted_sections[:5]:
            print(f"    Worst:  {s} MAE={m:.4f}")
        for s, m in sorted_sections[-3:]:
            print(f"    Best:   {s} MAE={m:.4f}")

    # -----------------------------------------------------------
    # SECTION I: MODEL COMPARISON
    # -----------------------------------------------------------
    print("\n" + "=" * 70)
    print("I. MODEL COMPARISON (multiple models)")
    print("=" * 70)

    X_train, y_train, encoders = prepare_features(train_df)
    X_val, y_val, _ = prepare_features(val_df, encoders=encoders)
    X_test, y_test, _ = prepare_features(test_df, encoders=encoders)

    feature_names = ALL_FEATURES

    # 1. Naive Baseline
    hmd_idx = feature_names.index('historical_mean_delay')
    baseline_train = X_train[:, hmd_idx]
    baseline_val = X_val[:, hmd_idx]
    baseline_test = X_test[:, hmd_idx]

    results = {}

    # Baseline
    results['baseline_train'] = compute_metrics(y_train, baseline_train)
    results['baseline_val'] = compute_metrics(y_val, baseline_val)
    results['baseline_test'] = compute_metrics(y_test, baseline_test)
    print(f"\n  Baseline (historical_mean_delay):")
    print(f"    Train MAE: {results['baseline_train']['mae']}")
    print(f"    Val MAE:   {results['baseline_val']['mae']}")
    print(f"    Test MAE:  {results['baseline_test']['mae']}")

    # 2. Ridge Regression
    ridge = Ridge(alpha=1.0)
    ridge.fit(X_train, y_train)
    ridge_train_pred = ridge.predict(X_train)
    ridge_val_pred = ridge.predict(X_val)
    ridge_test_pred = ridge.predict(X_test)
    results['ridge_train'] = compute_metrics(y_train, ridge_train_pred)
    results['ridge_val'] = compute_metrics(y_val, ridge_val_pred)
    results['ridge_test'] = compute_metrics(y_test, ridge_test_pred)
    print(f"\n  Ridge Regression (alpha=1.0):")
    print(f"    Train MAE: {results['ridge_train']['mae']}")
    print(f"    Val MAE:   {results['ridge_val']['mae']}")
    print(f"    Test MAE:  {results['ridge_test']['mae']}")

    # 3. Random Forest
    rf = RandomForestRegressor(
        n_estimators=300, max_depth=10, min_samples_leaf=5,
        random_state=42, n_jobs=-1
    )
    rf.fit(X_train, y_train)
    rf_train_pred = rf.predict(X_train)
    rf_val_pred = rf.predict(X_val)
    rf_test_pred = rf.predict(X_test)
    results['rf_train'] = compute_metrics(y_train, rf_train_pred)
    results['rf_val'] = compute_metrics(y_val, rf_val_pred)
    results['rf_test'] = compute_metrics(y_test, rf_test_pred)
    print(f"\n  Random Forest (n=300, depth=10, min_leaf=5):")
    print(f"    Train MAE: {results['rf_train']['mae']}")
    print(f"    Val MAE:   {results['rf_val']['mae']}")
    print(f"    Test MAE:  {results['rf_test']['mae']}")

    # 4. XGBoost (original residual approach)
    hmd_train = X_train[:, hmd_idx]
    hmd_val = X_val[:, hmd_idx]
    residual_train = y_train - hmd_train
    residual_val = y_val - hmd_val

    xgb_params_orig = {
        'objective': 'reg:squarederror', 'eval_metric': 'mae',
        'max_depth': 3, 'learning_rate': 0.01, 'n_estimators': 2000,
        'subsample': 0.7, 'colsample_bytree': 0.6,
        'min_child_weight': 20, 'reg_alpha': 2.0, 'reg_lambda': 10.0,
        'random_state': 42, 'verbosity': 0,
    }
    xgb_orig = xgb.XGBRegressor(**xgb_params_orig)
    xgb_orig.fit(X_train, residual_train, eval_set=[(X_val, residual_val)], verbose=False)
    xgb_orig_train = hmd_train + xgb_orig.predict(X_train)
    xgb_orig_val = hmd_val + xgb_orig.predict(X_val)
    xgb_orig_test = X_test[:, hmd_idx] + xgb_orig.predict(X_test)
    results['xgb_orig_train'] = compute_metrics(y_train, xgb_orig_train)
    results['xgb_orig_val'] = compute_metrics(y_val, xgb_orig_val)
    results['xgb_orig_test'] = compute_metrics(y_test, xgb_orig_test)
    print(f"\n  XGBoost Residual (original hyperparams):")
    print(f"    Train MAE: {results['xgb_orig_train']['mae']}")
    print(f"    Val MAE:   {results['xgb_orig_val']['mae']}")
    print(f"    Test MAE:  {results['xgb_orig_test']['mae']}")

    # 5. XGBoost direct prediction (not residual)
    xgb_direct_params = {
        'objective': 'reg:squarederror', 'eval_metric': 'mae',
        'max_depth': 5, 'learning_rate': 0.05, 'n_estimators': 500,
        'subsample': 0.8, 'colsample_bytree': 0.8,
        'min_child_weight': 5, 'reg_alpha': 0.5, 'reg_lambda': 2.0,
        'random_state': 42, 'verbosity': 0,
    }
    xgb_direct = xgb.XGBRegressor(**xgb_direct_params)
    xgb_direct.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
    xgb_direct_train = xgb_direct.predict(X_train)
    xgb_direct_val = xgb_direct.predict(X_val)
    xgb_direct_test = xgb_direct.predict(X_test)
    results['xgb_direct_train'] = compute_metrics(y_train, xgb_direct_train)
    results['xgb_direct_val'] = compute_metrics(y_val, xgb_direct_val)
    results['xgb_direct_test'] = compute_metrics(y_test, xgb_direct_test)
    print(f"\n  XGBoost Direct (depth=5, lr=0.05, n=500):")
    print(f"    Train MAE: {results['xgb_direct_train']['mae']}")
    print(f"    Val MAE:   {results['xgb_direct_val']['mae']}")
    print(f"    Test MAE:  {results['xgb_direct_test']['mae']}")

    # 6. XGBoost with less regularization
    xgb_less_reg = {
        'objective': 'reg:squarederror', 'eval_metric': 'mae',
        'max_depth': 6, 'learning_rate': 0.03, 'n_estimators': 1000,
        'subsample': 0.8, 'colsample_bytree': 0.8,
        'min_child_weight': 3, 'reg_alpha': 0.1, 'reg_lambda': 1.0,
        'random_state': 42, 'verbosity': 0,
    }
    xgb_lr = xgb.XGBRegressor(**xgb_less_reg)
    xgb_lr.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
    xgb_lr_train = xgb_lr.predict(X_train)
    xgb_lr_val = xgb_lr.predict(X_val)
    xgb_lr_test = xgb_lr.predict(X_test)
    results['xgb_lr_train'] = compute_metrics(y_train, xgb_lr_train)
    results['xgb_lr_val'] = compute_metrics(y_val, xgb_lr_val)
    results['xgb_lr_test'] = compute_metrics(y_test, xgb_lr_test)
    print(f"\n  XGBoost Less Regularized (depth=6, lr=0.03, n=1000):")
    print(f"    Train MAE: {results['xgb_lr_train']['mae']}")
    print(f"    Val MAE:   {results['xgb_lr_val']['mae']}")
    print(f"    Test MAE:  {results['xgb_lr_test']['mae']}")

    # -----------------------------------------------------------
    # SECTION J: SUMMARY TABLE
    # -----------------------------------------------------------
    print("\n" + "=" * 70)
    print("J. SUMMARY TABLE")
    print("=" * 70)
    print(f"\n  {'Model':<40} {'Val MAE':>10} {'Test MAE':>10} {'Test RMSE':>10} {'Test R2':>10} {'±5min':>8} {'±10min':>8}")
    print("  " + "-" * 96)

    model_map = [
        ('Baseline (historical_mean_delay)', 'baseline'),
        ('Ridge Regression', 'ridge'),
        ('Random Forest', 'rf'),
        ('XGBoost Residual (original)', 'xgb_orig'),
        ('XGBoost Direct', 'xgb_direct'),
        ('XGBoost Less Regularized', 'xgb_lr'),
    ]

    best_val_mae = float('inf')
    best_model_name = None
    for name, prefix in model_map:
        val = results[f'{prefix}_val']
        test = results[f'{prefix}_test']
        marker = ""
        if val['mae'] < best_val_mae and prefix != 'baseline':
            best_val_mae = val['mae']
            best_model_name = name
        print(f"  {name:<40} {val['mae']:>10.4f} {test['mae']:>10.4f} {test['rmse']:>10.4f} {test['r2']:>10.4f} {val['pct_within_5min']:>7.2f}% {val['pct_within_10min']:>7.2f}%")

    print(f"\n  Best model by validation MAE: {best_model_name} (val MAE = {best_val_mae:.4f})")

    # -----------------------------------------------------------
    # SECTION K: PREDICTION DISTRIBUTION ANALYSIS
    # -----------------------------------------------------------
    print("\n" + "=" * 70)
    print("K. PREDICTION DISTRIBUTION ANALYSIS")
    print("=" * 70)

    # XGBoost direct on test set
    for name, preds, actuals in [
        ('Baseline', baseline_test, y_test),
        ('XGBoost Direct', xgb_direct_test, y_test),
    ]:
        errors = actuals - preds
        print(f"\n  {name} on test set:")
        print(f"    Pred mean={preds.mean():.4f}, std={preds.std():.4f}")
        print(f"    Error mean={errors.mean():.4f}, std={errors.std():.4f}")
        print(f"    Pred range: [{preds.min():.4f}, {preds.max():.4f}]")
        print(f"    Actual range: [{actuals.min():.4f}, {actuals.max():.4f}]")
        # How much variance does the model capture?
        pred_var = np.var(preds)
        actual_var = np.var(actuals)
        print(f"    Pred variance: {pred_var:.4f}, Actual variance: {actual_var:.4f}")
        print(f"    Variance ratio (pred/actual): {pred_var/actual_var:.4f}")

    # -----------------------------------------------------------
    # SECTION L: WHAT WOULD IT TAKE TO BEAT BASELINE?
    # -----------------------------------------------------------
    print("\n" + "=" * 70)
    print("L. ANALYSIS: WHY BASELINE WINS")
    print("=" * 70)

    # Compute the irreducible noise floor
    test_hmd = test_df['historical_mean_delay'].values
    test_target = test_df[TARGET].values
    test_residuals = test_target - test_hmd

    print(f"\n  Target std on test set: {test_target.std():.4f}")
    print(f"  hmd residual std on test set: {test_residuals.std():.4f}")
    print(f"  Ratio (residual_std / target_std): {test_residuals.std()/test_target.std():.4f}")

    # Theoretical best MAE given the residual distribution
    # If residuals are approximately normally distributed, the best MAE
    # is approximately std * sqrt(2/pi)
    theoretical_best_mae = test_residuals.std() * np.sqrt(2/np.pi)
    print(f"  Theoretical best MAE if predicting residuals perfectly: {theoretical_best_mae:.4f}")
    print(f"  Current baseline MAE: {results['baseline_test']['mae']:.4f}")
    print(f"  Theoretical best possible improvement over baseline: "
          f"{results['baseline_test']['mae'] - theoretical_best_mae:.4f} min")

    # How much of the residual is predictable?
    # Check correlations of residual with features
    print(f"\n  Residual (target - hmd) correlations with features on test set:")
    test_df_copy = test_df.copy()
    test_df_copy['residual'] = test_residuals
    for feat in NUMERIC_FEATURES:
        if feat != 'historical_mean_delay':
            corr = test_df_copy[feat].corr(test_df_copy['residual'])
            if abs(corr) > 0.01:
                print(f"    {feat:<40} r = {corr:+.4f}")

    # Save diagnostic results
    diag_path = os.path.join(BASE_DIR, 'models', 'diagnostic_results.json')
    with open(diag_path, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\n  Saved diagnostic results to {diag_path}")

    print("\n" + "=" * 70)
    print("DIAGNOSTIC COMPLETE")
    print("=" * 70)


if __name__ == '__main__':
    main()
