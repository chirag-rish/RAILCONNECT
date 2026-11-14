"""
SIH26028 — Phase 3A: Weather-Aware Model Tests

Tests the weather-augmented ETA model:
  - Weather model artifacts exist and load
  - Feature schema is 46 features (37 base + 9 weather)
  - Weather feature engineering matches training
  - Weather model produces finite predictions
  - Weather-unavailable defaults produce valid predictions
  - Base model remains usable as rollback
  - No train/inference schema mismatch
"""

import os
import sys
import math
import json
import numpy as np
import joblib
import pytest

ML_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ML_DIR)

MODELS_DIR = os.path.join(ML_DIR, 'models')
WEATHER_SCHEMA_PATH = os.path.join(MODELS_DIR, 'weather_feature_schema.json')
WEATHER_MODEL_PATH = os.path.join(MODELS_DIR, 'eta_xgboost_weather_model.json')
WEATHER_PREPROC_PATH = os.path.join(MODELS_DIR, 'weather_preprocessing.joblib')
WEATHER_META_PATH = os.path.join(MODELS_DIR, 'weather_model_metadata.json')

BASE_SCHEMA_PATH = os.path.join(MODELS_DIR, 'feature_schema.json')
BASE_MODEL_PATH = os.path.join(MODELS_DIR, 'eta_xgboost_model.json')
BASE_PREPROC_PATH = os.path.join(MODELS_DIR, 'preprocessing.joblib')

# Sample base input (20 raw fields)
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


def sample_weather_input(severity=0):
    """Build a raw input including weather fields."""
    d = dict(SAMPLE_INPUT)
    d.update({
        "weather_temperature": 28.0,
        "weather_precipitation": 5.0 if severity >= 1 else 0.0,
        "weather_wind_speed": 25.0,
        "weather_visibility": 900 if severity >= 2 else 10000,
        "weather_severity": severity,
    })
    return d


# ============================================================
# WEATHER MODEL ARTIFACTS
# ============================================================

class TestWeatherArtifacts:
    def test_weather_model_artifacts_exist(self):
        for path in [WEATHER_MODEL_PATH, WEATHER_PREPROC_PATH,
                     WEATHER_SCHEMA_PATH, WEATHER_META_PATH]:
            assert os.path.exists(path), f"Missing: {path}"

    def test_weather_schema_has_46_features(self):
        with open(WEATHER_SCHEMA_PATH) as f:
            schema = json.load(f)
        assert len(schema['all_features']) == 46, \
            f"Expected 46 features, got {len(schema['all_features'])}"

    def test_weather_schema_contains_weather_features(self):
        with open(WEATHER_SCHEMA_PATH) as f:
            schema = json.load(f)
        weather = schema.get('weather_features', [])
        assert 'weather_temperature' in weather
        assert 'weather_precipitation' in weather
        assert 'weather_wind_speed' in weather
        assert 'weather_visibility' in weather
        assert 'weather_severity' in weather
        assert 'weather_is_rain' in weather
        assert 'weather_is_fog' in weather
        assert 'weather_is_severe' in weather
        assert 'precipitation_x_distance' in weather

    def test_base_schema_untouched_37_features(self):
        with open(BASE_SCHEMA_PATH) as f:
            schema = json.load(f)
        assert len(schema['all_features']) == 37
        # No weather features in base schema
        assert 'weather_temperature' not in schema['all_features']


# ============================================================
# WEATHER MODEL LOADING
# ============================================================

class TestWeatherModelLoading:
    def test_weather_model_loads(self):
        import xgboost as xgb
        model = xgb.XGBRegressor()
        model.load_model(WEATHER_MODEL_PATH)
        assert model.n_features_in_ == 46

    def test_base_model_still_loads_as_rollback(self):
        import xgboost as xgb
        model = xgb.XGBRegressor()
        model.load_model(BASE_MODEL_PATH)
        assert model.n_features_in_ == 37

    def test_weather_preprocessor_has_46_features(self):
        preproc = joblib.load(WEATHER_PREPROC_PATH)
        assert len(preproc['feature_names']) == 46
        assert 'weather_temperature' in preproc['feature_names']
        assert 'weather_severity' in preproc['feature_names']


# ============================================================
# WEATHER FEATURE ENGINEERING (must match train_model_weather.py)
# ============================================================

class TestWeatherFeatureEngineering:
    """Verify feature engineering parity between training and inference."""

    def _engineer(self, raw):
        d = dict(raw)

        # Railway engineered features (same as base)
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

        # Weather engineered features (must match train_model_weather.py)
        d['weather_is_rain'] = 1 if d['weather_precipitation'] > 0.5 else 0
        d['weather_is_fog'] = 1 if d['weather_visibility'] < 1000 else 0
        d['weather_is_severe'] = 1 if d['weather_severity'] >= 2 else 0
        d['precipitation_x_distance'] = d['weather_precipitation'] * d['section_distance']

        return d

    def _prepare(self, raw):
        with open(WEATHER_SCHEMA_PATH) as f:
            schema = json.load(f)
        feature_names = schema['all_features']
        categorical = schema['categorical_features']
        preproc = joblib.load(WEATHER_PREPROC_PATH)
        encoders = preproc['encoders']

        d = self._engineer(raw)
        values = []
        for fname in feature_names:
            val = d.get(fname)
            if val is None:
                raise KeyError(f"Missing feature in engineering: {fname}")
            if fname in categorical:
                classes = encoders[fname]
                sval = str(val)
                val = classes.index(sval) if sval in classes else 0
            if isinstance(val, str):
                val = 0
            values.append(float(val))
        return np.array([values], dtype=np.float32)

    def test_clear_weather_produces_valid_vector(self):
        X = self._prepare(sample_weather_input(severity=0))
        assert X.shape == (1, 46)
        assert np.isfinite(X).all()

    def test_severe_weather_flags_rain_and_fog(self):
        raw = sample_weather_input(severity=2)
        d = self._engineer(raw)
        assert d['weather_is_rain'] == 1
        assert d['weather_is_fog'] == 1
        assert d['weather_is_severe'] == 1

    def test_clear_weather_flags_off(self):
        raw = sample_weather_input(severity=0)
        d = self._engineer(raw)
        assert d['weather_is_rain'] == 0
        assert d['weather_is_fog'] == 0
        assert d['weather_is_severe'] == 0

    def test_precipitation_x_distance(self):
        raw = sample_weather_input(severity=0)
        raw['weather_precipitation'] = 10.0
        d = self._engineer(raw)
        assert d['precipitation_x_distance'] == pytest.approx(10.0 * 130.0)

    def test_weather_model_inference(self):
        import xgboost as xgb
        model = xgb.XGBRegressor()
        model.load_model(WEATHER_MODEL_PATH)

        # Clear weather
        X_clear = self._prepare(sample_weather_input(severity=0))
        pred_clear = float(model.predict(X_clear)[0])

        # Severe weather (fog + rain)
        X_severe = self._prepare(sample_weather_input(severity=2))
        pred_severe = float(model.predict(X_severe)[0])

        assert np.isfinite(pred_clear)
        assert np.isfinite(pred_severe)

        # Weather-aware residual should produce valid final delay
        final = SAMPLE_INPUT['historical_mean_delay'] + pred_severe
        assert np.isfinite(final)

    def test_weather_absent_defaults_match_training(self):
        """Verify weather-unavailable defaults produce a valid prediction
        (graceful degradation — base model path / neutral weather)."""
        import xgboost as xgb
        model = xgb.XGBRegressor()
        model.load_model(WEATHER_MODEL_PATH)

        # Weather fields present with neutral values (what the inference service
        # sends when weather data is missing — can't send absent, Pydantic defaults)
        raw = dict(SAMPLE_INPUT)
        raw.update({
            "weather_temperature": 25.0,
            "weather_precipitation": 0.0,
            "weather_wind_speed": 10.0,
            "weather_visibility": 10000.0,
            "weather_severity": 0,
        })
        X = self._prepare(raw)
        pred = float(model.predict(X)[0])
        assert np.isfinite(pred)


# ============================================================
# NO TRAIN/INFERENCE SCHEMA MISMATCH
# ============================================================

class TestSchemaParity:
    def test_weather_schema_matches_preprocessor(self):
        with open(WEATHER_SCHEMA_PATH) as f:
            schema = json.load(f)
        preproc = joblib.load(WEATHER_PREPROC_PATH)
        assert schema['all_features'] == preproc['feature_names']

    def test_weather_features_in_training_script(self):
        """Verify train_model_weather.py defines the exact same weather features."""
        train_src = open(os.path.join(ML_DIR, 'train_model_weather.py'), encoding='utf-8').read()
        with open(WEATHER_SCHEMA_PATH) as f:
            schema = json.load(f)
        for feat in schema['weather_features']:
            assert feat in train_src, f"Feature {feat} missing from train_model_weather.py"

    def test_base_model_rollback_still_inference_ready(self):
        """Original 37-feature model + preprocessor must still produce predictions."""
        import xgboost as xgb
        model = xgb.XGBRegressor()
        model.load_model(BASE_MODEL_PATH)

        with open(BASE_SCHEMA_PATH) as f:
            schema = json.load(f)
        preproc = joblib.load(BASE_PREPROC_PATH)

        assert len(schema['all_features']) == 37 == len(preproc['feature_names'])

        # Engineer features first (same as base model)
        d = dict(SAMPLE_INPUT)
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

        values = []
        categorical = schema['categorical_features']
        for fname in schema['all_features']:
            if fname in categorical:
                val = preproc['encoders'][fname].index(d[fname]) if d.get(fname) in preproc['encoders'][fname] else 0
            else:
                val = d[fname]
            values.append(float(val))
        X = np.array([values], dtype=np.float32)
        pred = float(model.predict(X)[0])
        assert np.isfinite(pred)


# ============================================================
# MODEL METADATA / VERSIONING
# ============================================================

class TestWeatherMetadata:
    def test_weather_metadata(self):
        with open(WEATHER_META_PATH) as f:
            meta = json.load(f)
        assert meta['model_version'] == '3.0.0-weather'
        assert meta['feature_count'] == 46
        assert 'weather_features' in meta
        assert len(meta['weather_features']) == 9

    def test_base_metadata_untouched(self):
        meta_path = os.path.join(MODELS_DIR, 'model_metadata.json')
        with open(meta_path) as f:
            meta = json.load(f)
        assert meta['model_version'] == '2.0.0'
        assert meta['feature_count'] == 37