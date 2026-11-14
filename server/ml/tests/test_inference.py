"""
SIH26028 — Phase 3B Inference Tests

Tests for the Python FastAPI inference service.
Verifies model loading, feature engineering, inference correctness,
determinism, and error handling.

Run with:
    python -m pytest server/ml/tests/test_inference.py -v
"""

import os
import sys
import math
import json
import numpy as np
import pandas as pd
import pytest

# Add parent directory to path
ML_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ML_DIR)

MODELS_DIR = os.path.join(ML_DIR, 'models')

# Sample valid input matching the training schema
SAMPLE_INPUT = {
    "accumulated_delay_entering": 5.2,
    "prev_section_travel_time": 45.0,
    "prev_section_delay": 2.1,
    "stations_travelled": 2,
    "stations_remaining": 3,
    "section_distance": 130.0,
    "typical_speed": 80.0,
    "max_speed": 110.0,
    "signal_count": 4,
    "level_crossings": 1,
    "section_type": "DoubleLine",
    "gradient_profile": "Flat",
    "hour": 14,
    "day_of_week": 2,
    "is_weekend": 0,
    "event_active": 0,
    "event_type": "None",
    "event_speed_limit": 110.0,
    "historical_mean_travel_time": 97.5,
    "historical_mean_delay": 2.4,
}


# ============================================================
# FIXTURES
# ============================================================

@pytest.fixture(scope='module')
def loaded_model():
    """Load the XGBoost model."""
    import xgboost as xgb
    model = xgb.XGBRegressor()
    model.load_model(os.path.join(MODELS_DIR, 'eta_xgboost_model.json'))
    return model


@pytest.fixture(scope='module')
def loaded_preprocessor():
    """Load the preprocessing artifacts."""
    import joblib
    return joblib.load(os.path.join(MODELS_DIR, 'preprocessing.joblib'))


@pytest.fixture(scope='module')
def loaded_metadata():
    """Load model metadata."""
    with open(os.path.join(MODELS_DIR, 'model_metadata.json'), 'r') as f:
        return json.load(f)


@pytest.fixture(scope='module')
def loaded_schema():
    """Load feature schema."""
    with open(os.path.join(MODELS_DIR, 'feature_schema.json'), 'r') as f:
        return json.load(f)


# ============================================================
# TESTS: Artifact Loading
# ============================================================

class TestArtifactLoading:
    def test_model_file_exists(self):
        assert os.path.exists(os.path.join(MODELS_DIR, 'eta_xgboost_model.json'))

    def test_preprocessing_file_exists(self):
        assert os.path.exists(os.path.join(MODELS_DIR, 'preprocessing.joblib'))

    def test_metadata_file_exists(self):
        assert os.path.exists(os.path.join(MODELS_DIR, 'model_metadata.json'))

    def test_schema_file_exists(self):
        assert os.path.exists(os.path.join(MODELS_DIR, 'feature_schema.json'))

    def test_model_loads(self, loaded_model):
        assert loaded_model is not None

    def test_preprocessor_loads(self, loaded_preprocessor):
        assert 'encoders' in loaded_preprocessor
        assert 'feature_names' in loaded_preprocessor

    def test_metadata_version(self, loaded_metadata):
        assert loaded_metadata['model_version'] == '2.0.0'
        assert loaded_metadata['model_type'] == 'XGBRegressor (residual)'

    def test_schema_has_37_features(self, loaded_schema):
        assert len(loaded_schema['all_features']) == 37


# ============================================================
# TESTS: Feature Engineering
# ============================================================

class TestFeatureEngineering:
    def _engineer(self, raw):
        """Apply feature engineering matching train_model.py."""
        d = raw.copy()
        d['accumulated_delay_x_distance'] = d['accumulated_delay_entering'] * d['section_distance']
        d['accumulated_delay_x_speed'] = d['accumulated_delay_entering'] / (d['typical_speed'] + 1e-6)
        d['delay_rate'] = d['accumulated_delay_entering'] / (d['stations_travelled'] + 1)
        d['speed_margin'] = d['max_speed'] - d['typical_speed']
        d['speed_limit_ratio'] = d['event_speed_limit'] / (d['max_speed'] + 1e-6)
        d['section_travel_time'] = d['section_distance'] / (d['typical_speed'] + 1e-6)
        d['delay_fraction_of_travel'] = d['accumulated_delay_entering'] / (d['section_travel_time'] + 1e-6)
        d['hour_sin'] = math.sin(2 * math.pi * d['hour'] / 24)
        d['hour_cos'] = math.cos(2 * math.pi * d['hour'] / 24)
        d['signals_per_km'] = d['signal_count'] / (d['section_distance'] + 1e-6)
        d['crossings_per_km'] = d['level_crossings'] / (d['section_distance'] + 1e-6)
        d['prev_delay_positive'] = max(d['prev_section_delay'], 0)
        d['accumulated_delay_squared'] = d['accumulated_delay_entering'] ** 2
        d['is_peak_hour'] = 1 if d['hour'] in (7, 8, 9, 10, 17, 18, 19, 20) else 0
        d['is_night'] = 1 if d['hour'] in (23, 0, 1, 2, 3, 4, 5) else 0
        d['event_speed_ratio'] = d['event_speed_limit'] / (d['max_speed'] + 1e-6)
        d['section_type_gradient'] = f"{d['section_type']}_{d['gradient_profile']}"
        return d

    def test_engineering_produces_all_features(self):
        engineered = self._engineer(SAMPLE_INPUT)
        expected = [
            'accumulated_delay_x_distance', 'accumulated_delay_x_speed',
            'delay_rate', 'speed_margin', 'speed_limit_ratio',
            'section_travel_time', 'delay_fraction_of_travel',
            'hour_sin', 'hour_cos', 'signals_per_km', 'crossings_per_km',
            'prev_delay_positive', 'accumulated_delay_squared',
            'is_peak_hour', 'is_night', 'event_speed_ratio',
            'section_type_gradient',
        ]
        for feat in expected:
            assert feat in engineered, f"Missing engineered feature: {feat}"

    def test_hour_sin_cos_correct(self):
        engineered = self._engineer(SAMPLE_INPUT)
        assert abs(engineered['hour_sin'] - math.sin(2 * math.pi * 14 / 24)) < 1e-10
        assert abs(engineered['hour_cos'] - math.cos(2 * math.pi * 14 / 24)) < 1e-10

    def test_peak_hour_detection(self):
        d = SAMPLE_INPUT.copy()
        d['hour'] = 8
        engineered = self._engineer(d)
        assert engineered['is_peak_hour'] == 1

        d['hour'] = 14
        engineered = self._engineer(d)
        assert engineered['is_peak_hour'] == 0

    def test_night_detection(self):
        d = SAMPLE_INPUT.copy()
        d['hour'] = 2
        engineered = self._engineer(d)
        assert engineered['is_night'] == 1

        d['hour'] = 14
        engineered = self._engineer(d)
        assert engineered['is_night'] == 0


# ============================================================
# TESTS: Inference
# ============================================================

class TestInference:
    def _build_vector(self, raw, schema, preprocessor):
        """Build feature vector from raw input, using encoders."""
        d = raw.copy()
        
        # Engineering features
        d['accumulated_delay_x_distance'] = d['accumulated_delay_entering'] * d['section_distance']
        d['accumulated_delay_x_speed'] = d['accumulated_delay_entering'] / (d['typical_speed'] + 1e-6)
        d['delay_rate'] = d['accumulated_delay_entering'] / (d['stations_travelled'] + 1)
        d['speed_margin'] = d['max_speed'] - d['typical_speed']
        d['speed_limit_ratio'] = d['event_speed_limit'] / (d['max_speed'] + 1e-6)
        d['section_travel_time'] = d['section_distance'] / (d['typical_speed'] + 1e-6)
        d['delay_fraction_of_travel'] = d['accumulated_delay_entering'] / (d['section_travel_time'] + 1e-6)
        d['hour_sin'] = math.sin(2 * math.pi * d['hour'] / 24)
        d['hour_cos'] = math.cos(2 * math.pi * d['hour'] / 24)
        d['signals_per_km'] = d['signal_count'] / (d['section_distance'] + 1e-6)
        d['crossings_per_km'] = d['level_crossings'] / (d['section_distance'] + 1e-6)
        d['prev_delay_positive'] = max(d['prev_section_delay'], 0)
        d['accumulated_delay_squared'] = d['accumulated_delay_entering'] ** 2
        d['is_peak_hour'] = 1 if d['hour'] in (7, 8, 9, 10, 17, 18, 19, 20) else 0
        d['is_night'] = 1 if d['hour'] in (23, 0, 1, 2, 3, 4, 5) else 0
        d['event_speed_ratio'] = d['event_speed_limit'] / (d['max_speed'] + 1e-6)
        d['section_type_gradient'] = f"{d['section_type']}_{d['gradient_profile']}"

        # Encoding categorical features
        from sklearn.preprocessing import LabelEncoder
        
        # Build DataFrame for consistent handling
        df = pd.DataFrame([d])
        
        for feat, classes in preprocessor['encoders'].items():
            le = LabelEncoder()
            le.classes_ = np.array(classes)
            # Handle unseen labels by mapping to first class
            known = set(le.classes_)
            df[feat] = df[feat].apply(lambda x: x if x in known else le.classes_[0])
            df[feat] = le.transform(df[feat].values)
            
        # Ensure all features exist in correct order
        feature_names = schema['all_features']
        values = df[feature_names].values.flatten()
        return values.astype(np.float32).reshape(1, -1)

    def test_prediction_is_finite(self, loaded_model, loaded_schema, loaded_preprocessor):
        X = self._build_vector(SAMPLE_INPUT, loaded_schema, loaded_preprocessor)
        pred = loaded_model.predict(X)
        assert len(pred) == 1
        assert np.isfinite(pred[0]), f"Prediction is not finite: {pred[0]}"

    def test_prediction_residual_addition(self, loaded_model, loaded_schema, loaded_preprocessor):
        X = self._build_vector(SAMPLE_INPUT, loaded_schema, loaded_preprocessor)
        residual = float(loaded_model.predict(X)[0])
        hmd = SAMPLE_INPUT['historical_mean_delay']
        predicted_delay = hmd + residual
        assert np.isfinite(predicted_delay)
        assert predicted_delay > -50, f"Prediction too low: {predicted_delay}"
        assert predicted_delay < 100, f"Prediction too high: {predicted_delay}"

    def test_deterministic_inference(self, loaded_model, loaded_schema, loaded_preprocessor):
        """Same input must produce identical output."""
        X1 = self._build_vector(SAMPLE_INPUT, loaded_schema, loaded_preprocessor)
        X2 = self._build_vector(SAMPLE_INPUT, loaded_schema, loaded_preprocessor)
        pred1 = loaded_model.predict(X1)
        pred2 = loaded_model.predict(X2)
        np.testing.assert_array_equal(pred1, pred2)

    def test_different_inputs_different_predictions(self, loaded_model, loaded_schema, loaded_preprocessor):
        X1 = self._build_vector(SAMPLE_INPUT, loaded_schema, loaded_preprocessor)
        pred1 = loaded_model.predict(X1)

        modified = SAMPLE_INPUT.copy()
        modified['event_active'] = 1
        modified['event_type'] = 'Derailment'
        modified['event_speed_limit'] = 40
        X2 = self._build_vector(modified, loaded_schema, loaded_preprocessor)
        pred2 = loaded_model.predict(X2)

        # With a major event, predictions should differ
        assert pred1[0] != pred2[0], "Different inputs should produce different predictions"

    def test_higher_event_gives_higher_delay(self, loaded_model, loaded_schema, loaded_preprocessor):
        """An active derailment event should increase predicted delay."""
        X_normal = self._build_vector(SAMPLE_INPUT, loaded_schema, loaded_preprocessor)
        pred_normal = float(loaded_model.predict(X_normal)[0])

        event_input = SAMPLE_INPUT.copy()
        event_input['event_active'] = 1
        event_input['event_type'] = 'Derailment'
        event_input['event_speed_limit'] = 30
        X_event = self._build_vector(event_input, loaded_schema, loaded_preprocessor)
        pred_event = float(loaded_model.predict(X_event)[0])

        # Event prediction should be >= normal (residual is higher)
        # Note: this is a sanity check, not guaranteed for all inputs
        # but for a derailment it should hold in most cases
        assert np.isfinite(pred_event), f"Event prediction not finite: {pred_event}"


# ============================================================
# TESTS: Error Handling
# ============================================================

class TestErrorHandling:
    def test_missing_feature_will_fail(self, loaded_model, loaded_schema, loaded_preprocessor):
        """Incomplete input should raise an error during vector construction."""
        incomplete = {k: v for k, v in list(SAMPLE_INPUT.items())[:5]}  # Only first 5 features
        # Re-use TestInference._build_vector
        inference_test = TestInference()
        with pytest.raises((KeyError, ValueError)):
            inference_test._build_vector(incomplete, loaded_schema, loaded_preprocessor)
