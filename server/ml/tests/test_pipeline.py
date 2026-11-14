"""
SIH26028 — ML Pipeline Test Suite

Tests for dataset loading, feature engineering, preprocessing,
model loading, prediction, and pipeline integrity.

Run with:
    python -m pytest server/ml/tests/ -v
"""

import os
import sys
import json
import math
import tempfile
import numpy as np
import pandas as pd
import joblib
import pytest

# Add parent directory to path for imports
ML_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ML_DIR)

DATA_DIR = os.path.join(ML_DIR, '..', 'data', 'ml')
MODELS_DIR = os.path.join(ML_DIR, 'models')

DATASET_PATH = os.path.join(DATA_DIR, 'eta_dataset_v1.csv')
MODEL_PATH = os.path.join(MODELS_DIR, 'eta_xgboost_model.json')
PREPROC_PATH = os.path.join(MODELS_DIR, 'preprocessing.joblib')
METADATA_PATH = os.path.join(MODELS_DIR, 'model_metadata.json')
EVAL_PATH = os.path.join(MODELS_DIR, 'evaluation_results.json')
SCHEMA_PATH = os.path.join(MODELS_DIR, 'feature_schema.json')
FEATURE_IMPORTANCE_PATH = os.path.join(MODELS_DIR, 'feature_importance.json')


# ============================================================
# FIXTURES
# ============================================================

@pytest.fixture(scope='module')
def dataset():
    """Load the dataset once for all tests."""
    df = pd.read_csv(DATASET_PATH)
    df['event_type'] = df['event_type'].fillna('None')
    return df


@pytest.fixture(scope='module')
def preprocessor():
    """Load the preprocessing pipeline."""
    return joblib.load(PREPROC_PATH)


@pytest.fixture(scope='module')
def model():
    """Load the trained XGBoost model."""
    import xgboost as xgb
    m = xgb.XGBRegressor()
    m.load_model(MODEL_PATH)
    return m


@pytest.fixture(scope='module')
def metadata():
    """Load model metadata."""
    with open(METADATA_PATH, 'r') as f:
        return json.load(f)


@pytest.fixture(scope='module')
def eval_results():
    """Load evaluation results."""
    with open(EVAL_PATH, 'r') as f:
        return json.load(f)


# ============================================================
# TESTS: Dataset Loading
# ============================================================

class TestDatasetLoading:
    def test_dataset_exists(self):
        assert os.path.exists(DATASET_PATH), f"Dataset not found at {DATASET_PATH}"

    def test_dataset_not_empty(self, dataset):
        assert len(dataset) > 0, "Dataset is empty"

    def test_dataset_row_count(self, dataset):
        assert len(dataset) >= 5000, f"Dataset has only {len(dataset)} rows, expected >= 5000"

    def test_dataset_columns(self, dataset):
        expected_cols = [
            'train_number', 'run_date', 'from_station', 'to_station', 'entry_time',
            'target_delay_minutes', 'accumulated_delay_entering', 'prev_section_travel_time',
            'prev_section_delay', 'stations_travelled', 'stations_remaining',
            'section_distance', 'typical_speed', 'max_speed', 'section_type',
            'signal_count', 'level_crossings', 'gradient_profile', 'hour',
            'day_of_week', 'is_weekend', 'event_active', 'event_type',
            'event_speed_limit', 'historical_mean_travel_time', 'historical_mean_delay',
            'split',
        ]
        for col in expected_cols:
            assert col in dataset.columns, f"Missing column: {col}"

    def test_no_null_target(self, dataset):
        assert dataset['target_delay_minutes'].isnull().sum() == 0, "Null values in target"

    def test_splits_present(self, dataset):
        splits = set(dataset['split'].unique())
        assert splits == {'train', 'validation', 'test'}, f"Unexpected splits: {splits}"

    def test_split_ratio(self, dataset):
        n = len(dataset)
        train_n = len(dataset[dataset['split'] == 'train'])
        val_n = len(dataset[dataset['split'] == 'validation'])
        test_n = len(dataset[dataset['split'] == 'test'])
        # Should be approximately 70/15/15
        assert 0.65 < train_n / n < 0.75, f"Train split ratio: {train_n/n:.3f}"
        assert 0.10 < val_n / n < 0.20, f"Val split ratio: {val_n/n:.3f}"
        assert 0.10 < test_n / n < 0.20, f"Test split ratio: {test_n/n:.3f}"

    def test_no_null_features(self, dataset):
        critical_features = [
            'accumulated_delay_entering', 'section_distance', 'typical_speed',
            'event_active', 'hour', 'day_of_week'
        ]
        for feat in critical_features:
            assert dataset[feat].isnull().sum() == 0, f"Null values in {feat}"


# ============================================================
# TESTS: Chronological Split Integrity
# ============================================================

class TestChronologicalSplits:
    def test_train_before_val(self, dataset):
        train_max = dataset[dataset['split'] == 'train']['entry_time'].max()
        val_min = dataset[dataset['split'] == 'validation']['entry_time'].min()
        assert train_max <= val_min, f"Train max ({train_max}) > Val min ({val_min})"

    def test_val_before_test(self, dataset):
        val_max = dataset[dataset['split'] == 'validation']['entry_time'].max()
        test_min = dataset[dataset['split'] == 'test']['entry_time'].min()
        assert val_max <= test_min, f"Val max ({val_max}) > Test min ({test_min})"

    def test_train_chronological(self, dataset):
        train_times = pd.to_datetime(dataset[dataset['split'] == 'train']['entry_time'])
        assert train_times.is_monotonic_increasing, "Train split not chronologically ordered"

    def test_val_chronological(self, dataset):
        val_times = pd.to_datetime(dataset[dataset['split'] == 'validation']['entry_time'])
        assert val_times.is_monotonic_increasing, "Validation split not chronologically ordered"

    def test_test_chronological(self, dataset):
        test_times = pd.to_datetime(dataset[dataset['split'] == 'test']['entry_time'])
        assert test_times.is_monotonic_increasing, "Test split not chronologically ordered"


# ============================================================
# TESTS: Feature Engineering
# ============================================================

class TestFeatureEngineering:
    def _engineer(self, df):
        """Apply feature engineering."""
        df = df.copy()
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
        return df

    def test_engineering_adds_features(self, dataset):
        engineered = self._engineer(dataset)
        assert 'accumulated_delay_x_distance' in engineered.columns
        assert 'hour_sin' in engineered.columns
        assert 'section_type_gradient' in engineered.columns

    def test_hour_sin_range(self, dataset):
        engineered = self._engineer(dataset)
        assert engineered['hour_sin'].min() >= -1.0
        assert engineered['hour_sin'].max() <= 1.0

    def test_hour_cos_range(self, dataset):
        engineered = self._engineer(dataset)
        assert engineered['hour_cos'].min() >= -1.0
        assert engineered['hour_cos'].max() <= 1.0

    def test_speed_limit_ratio_range(self, dataset):
        engineered = self._engineer(dataset)
        ratios = engineered['speed_limit_ratio']
        assert ratios.min() >= 0.0, f"Negative speed_limit_ratio: {ratios.min()}"
        assert ratios.max() <= 2.0, f"Speed_limit_ratio > 2: {ratios.max()}"

    def test_no_infs_from_engineering(self, dataset):
        engineered = self._engineer(dataset)
        numeric_cols = engineered.select_dtypes(include=[np.number]).columns
        for col in numeric_cols:
            assert not np.isinf(engineered[col]).any(), f"Inf values in {col}"


# ============================================================
# TESTS: Preprocessing
# ============================================================

class TestPreprocessing:
    def test_preprocessor_exists(self):
        assert os.path.exists(PREPROC_PATH), f"Preprocessor not found at {PREPROC_PATH}"

    def test_preprocessor_contents(self, preprocessor):
        assert 'encoders' in preprocessor
        assert 'feature_names' in preprocessor
        assert 'numeric_features' in preprocessor
        assert 'categorical_features' in preprocessor

    def test_encoder_classes(self, preprocessor):
        for feat, classes in preprocessor['encoders'].items():
            assert len(classes) > 0, f"No classes for encoder {feat}"

    def test_feature_names_consistency(self, preprocessor):
        n_numeric = len(preprocessor['numeric_features'])
        n_categorical = len(preprocessor['categorical_features'])
        n_total = len(preprocessor['feature_names'])
        assert n_total == n_numeric + n_categorical, \
            f"Feature count mismatch: {n_numeric} + {n_categorical} != {n_total}"


# ============================================================
# TESTS: Model Loading and Prediction
# ============================================================

class TestModel:
    def test_model_exists(self):
        assert os.path.exists(MODEL_PATH), f"Model not found at {MODEL_PATH}"

    def test_model_loads(self, model):
        assert model is not None

    def test_model_can_predict(self, model, preprocessor):
        n_features = len(preprocessor['feature_names'])
        X_dummy = np.random.randn(5, n_features).astype(np.float32)
        preds = model.predict(X_dummy)
        assert len(preds) == 5, f"Expected 5 predictions, got {len(preds)}"

    def test_predictions_are_finite(self, model, preprocessor):
        n_features = len(preprocessor['feature_names'])
        X_dummy = np.random.randn(10, n_features).astype(np.float32)
        preds = model.predict(X_dummy)
        assert np.all(np.isfinite(preds)), "Model produced non-finite predictions"

    def test_predictions_reasonable_range(self, model, preprocessor):
        n_features = len(preprocessor['feature_names'])
        X_dummy = np.random.randn(100, n_features).astype(np.float32)
        preds = model.predict(X_dummy)
        # Predictions should be in a reasonable range for delay minutes
        assert preds.min() > -50, f"Prediction too low: {preds.min()}"
        assert preds.max() < 100, f"Prediction too high: {preds.max()}"

    def test_single_prediction(self, model, preprocessor):
        n_features = len(preprocessor['feature_names'])
        X_single = np.random.randn(1, n_features).astype(np.float32)
        pred = model.predict(X_single)
        assert pred.shape == (1,)
        assert np.isfinite(pred[0])


# ============================================================
# TESTS: Metadata and Evaluation
# ============================================================

class TestMetadata:
    def test_metadata_exists(self):
        assert os.path.exists(METADATA_PATH), "model_metadata.json not found"

    def test_metadata_contents(self, metadata):
        required_keys = [
            'model_name', 'model_version', 'model_type', 'training_date',
            'dataset_rows', 'training_rows', 'validation_rows', 'test_rows',
            'feature_count', 'target', 'feature_names', 'evaluation',
            'synthetic_data_disclaimer',
        ]
        for key in required_keys:
            assert key in metadata, f"Missing key in metadata: {key}"

    def test_metadata_row_counts_consistent(self, metadata):
        total = metadata['training_rows'] + metadata['validation_rows'] + metadata['test_rows']
        assert total == metadata['dataset_rows'], \
            f"Row counts don't add up: {metadata['training_rows']} + {metadata['validation_rows']} + {metadata['test_rows']} != {metadata['dataset_rows']}"

    def test_metadata_has_disclaimer(self, metadata):
        assert 'synthetic' in metadata['synthetic_data_disclaimer'].lower(), \
            "Missing synthetic data disclaimer"

    def test_eval_results_exists(self):
        assert os.path.exists(EVAL_PATH), "evaluation_results.json not found"

    def test_eval_has_baseline(self, eval_results):
        assert 'baseline' in eval_results
        assert 'test' in eval_results['baseline']
        assert 'mae' in eval_results['baseline']['test']

    def test_eval_has_selected_model(self, eval_results):
        assert 'selected_model' in eval_results
        assert 'test_metrics' in eval_results['selected_model']
        assert 'mae' in eval_results['selected_model']['test_metrics']

    def test_eval_ml_beats_baseline(self, eval_results):
        assert eval_results.get('ml_beats_baseline', False), \
            "ML model does not beat baseline in saved evaluation results"

    def test_feature_importance_exists(self):
        assert os.path.exists(FEATURE_IMPORTANCE_PATH), "feature_importance.json not found"

    def test_feature_importance_has_entries(self):
        with open(FEATURE_IMPORTANCE_PATH, 'r') as f:
            importance = json.load(f)
        assert len(importance) > 0, "Feature importance is empty"
        assert importance[0]['importance'] > 0, "Top feature has zero importance"


# ============================================================
# TESTS: Dataset Quality
# ============================================================

class TestDatasetQuality:
    def test_all_sections_present(self, dataset):
        sections = dataset.groupby(['from_station', 'to_station']).size()
        # Should have multiple unique sections
        assert len(sections) >= 10, f"Only {len(sections)} unique sections found"

    def test_target_has_variance(self, dataset):
        target_std = dataset['target_delay_minutes'].std()
        assert target_std > 1.0, f"Target std too low: {target_std}"

    def test_events_are_present(self, dataset):
        n_events = dataset[dataset['event_active'] == 1].shape[0]
        assert n_events > 100, f"Only {n_events} events in dataset"

    def test_no_constant_features(self, dataset):
        constant_cols = []
        for col in dataset.select_dtypes(include=[np.number]).columns:
            if dataset[col].std() == 0:
                constant_cols.append(col)
        # level_crossings may be constant, that's acceptable
        # But other numeric features should have variance
        critical_varying = ['accumulated_delay_entering', 'section_distance', 'hour',
                           'event_active', 'target_delay_minutes']
        for col in critical_varying:
            assert col not in constant_cols, f"Critical feature {col} is constant"

    def test_delay_distribution_positive_skew(self, dataset):
        """Target should be right-skewed (most trains on time, some delayed)."""
        skew = dataset['target_delay_minutes'].skew()
        assert skew > 0, f"Expected positive skew, got {skew}"
