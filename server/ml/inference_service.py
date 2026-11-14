"""
SIH26028 — FastAPI Inference Service for ETA Prediction

Loads the trained XGBoost model and preprocessing artifacts.
Supports both base model (37 features) and weather-aware model (46 features).

Phase 3A: Weather model loaded when WEATHER_MODEL_ENABLED=true.
The base model is always loaded as fallback.

Usage:
    python server/ml/inference_service.py

Environment variables:
    WEATHER_MODEL_ENABLED  — 'true' to load weather model (default: false)
    ETA_INFERENCE_PORT     — port (default: 8001)

Endpoints:
    POST /predict        — Predict section delay from feature vector
    GET  /health         — Service health check
    POST /predict/batch  — Predict multiple sections at once
"""

import os
import sys
import math
import json
import logging
from datetime import datetime, timezone
from typing import Optional

import numpy as np
import joblib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("eta-inference")

# ============================================================
# PATHS
# ============================================================
ML_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(ML_DIR, 'models')

# Base model (37 features — always loaded as fallback)
MODEL_PATH = os.path.join(MODELS_DIR, 'eta_xgboost_model.json')
PREPROC_PATH = os.path.join(MODELS_DIR, 'preprocessing.joblib')
METADATA_PATH = os.path.join(MODELS_DIR, 'model_metadata.json')
SCHEMA_PATH = os.path.join(MODELS_DIR, 'feature_schema.json')

# Weather-aware model (46 features — loaded when WEATHER_MODEL_ENABLED=true)
WEATHER_MODEL_PATH = os.path.join(MODELS_DIR, 'eta_xgboost_weather_model.json')
WEATHER_PREPROC_PATH = os.path.join(MODELS_DIR, 'weather_preprocessing.joblib')
WEATHER_METADATA_PATH = os.path.join(MODELS_DIR, 'weather_model_metadata.json')
WEATHER_SCHEMA_PATH = os.path.join(MODELS_DIR, 'weather_feature_schema.json')

# ============================================================
# FASTAPI APP
# ============================================================
app = FastAPI(
    title="SIH26028 ETA Inference Service",
    description="XGBoost-based railway section delay prediction",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# GLOBAL STATE — loaded once at startup
# ============================================================
# Base model (always loaded)
model = None
preprocessor = None
metadata = None
feature_schema = None
model_loaded = False
load_error = None

# Weather model (loaded when WEATHER_MODEL_ENABLED=true)
weather_model = None
weather_preprocessor = None
weather_metadata = None
weather_feature_schema = None
weather_model_loaded = False
weather_enabled = os.environ.get('WEATHER_MODEL_ENABLED', 'false').lower() == 'true'


def load_artifacts():
    """Load base model and preprocessing artifacts."""
    global model, preprocessor, metadata, feature_schema, model_loaded, load_error

    try:
        import xgboost as xgb

        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"Model not found at {MODEL_PATH}")
        if not os.path.exists(PREPROC_PATH):
            raise FileNotFoundError(f"Preprocessor not found at {PREPROC_PATH}")

        model = xgb.XGBRegressor()
        model.load_model(MODEL_PATH)
        logger.info(f"Loaded base XGBoost model from {MODEL_PATH}")

        preprocessor = joblib.load(PREPROC_PATH)
        logger.info(f"Loaded base preprocessor from {PREPROC_PATH}")

        with open(METADATA_PATH, 'r') as f:
            metadata = json.load(f)
        logger.info(f"Loaded base metadata: version={metadata.get('model_version')}")

        with open(SCHEMA_PATH, 'r') as f:
            feature_schema = json.load(f)
        logger.info(f"Loaded base feature schema: {len(feature_schema.get('all_features', []))} features")

        model_loaded = True
        load_error = None
        logger.info("Base model artifacts loaded successfully")

    except Exception as e:
        model_loaded = False
        load_error = str(e)
        logger.error(f"Failed to load base artifacts: {e}")


def load_weather_artifacts():
    """Load weather-aware model and preprocessing artifacts."""
    global weather_model, weather_preprocessor, weather_metadata, weather_feature_schema, weather_model_loaded

    if not weather_enabled:
        logger.info("Weather model disabled (WEATHER_MODEL_ENABLED=false)")
        return

    try:
        import xgboost as xgb

        if not os.path.exists(WEATHER_MODEL_PATH):
            logger.warning(f"Weather model not found at {WEATHER_MODEL_PATH} — falling back to base model")
            return
        if not os.path.exists(WEATHER_PREPROC_PATH):
            logger.warning(f"Weather preprocessor not found at {WEATHER_PREPROC_PATH} — falling back to base model")
            return

        weather_model = xgb.XGBRegressor()
        weather_model.load_model(WEATHER_MODEL_PATH)
        logger.info(f"Loaded weather XGBoost model from {WEATHER_MODEL_PATH}")

        weather_preprocessor = joblib.load(WEATHER_PREPROC_PATH)
        logger.info(f"Loaded weather preprocessor from {WEATHER_PREPROC_PATH}")

        with open(WEATHER_METADATA_PATH, 'r') as f:
            weather_metadata = json.load(f)
        logger.info(f"Loaded weather metadata: version={weather_metadata.get('model_version')}")

        with open(WEATHER_SCHEMA_PATH, 'r') as f:
            weather_feature_schema = json.load(f)
        logger.info(f"Loaded weather feature schema: {len(weather_feature_schema.get('all_features', []))} features")

        weather_model_loaded = True
        logger.info("Weather model artifacts loaded successfully")

    except Exception as e:
        weather_model_loaded = False
        logger.error(f"Failed to load weather artifacts: {e}")


# Load on startup
load_artifacts()
load_weather_artifacts()


# ============================================================
# INPUT SCHEMAS (Pydantic models)
# ============================================================

class PredictionInput(BaseModel):
    """Raw input features for section delay prediction."""
    # Train state
    accumulated_delay_entering: float = Field(..., description="Delay accumulated before entering section (minutes)")
    prev_section_travel_time: float = Field(..., description="Actual travel time of previous section (minutes)")
    prev_section_delay: float = Field(..., description="Delay from previous section (minutes)")
    stations_travelled: int = Field(..., description="Number of stations traversed so far")
    stations_remaining: int = Field(..., description="Number of stations remaining")

    # Section infrastructure
    section_distance: float = Field(..., description="Distance of section in km")
    typical_speed: float = Field(..., description="Typical speed limit in km/h")
    max_speed: float = Field(..., description="Maximum speed limit in km/h")
    signal_count: int = Field(..., description="Number of signals in section")
    level_crossings: int = Field(..., description="Number of level crossings")
    section_type: str = Field(..., description="SingleLine/DoubleLine/TripleLine/Quadruple")
    gradient_profile: str = Field(..., description="Flat/Mild/Steep")

    # Temporal
    hour: int = Field(..., ge=0, le=23, description="Hour of day (0-23)")
    day_of_week: int = Field(..., ge=0, le=6, description="Day of week (0=Mon, 6=Sun)")
    is_weekend: int = Field(..., ge=0, le=1, description="1 if Saturday or Sunday")

    # Operational
    event_active: int = Field(..., ge=0, le=1, description="1 if operational event active")
    event_type: str = Field("None", description="Type of operational event")
    event_speed_limit: float = Field(..., description="Speed limit from event (km/h)")

    # Historical
    historical_mean_travel_time: float = Field(..., description="Rolling average past travel times (minutes)")
    historical_mean_delay: float = Field(..., description="Rolling average past delays (minutes)")

    # Weather (Phase 3A — optional, used by weather-aware model)
    weather_temperature: Optional[float] = Field(None, description="Temperature in °C (from Open-Meteo)")
    weather_precipitation: Optional[float] = Field(None, description="Precipitation in mm/h")
    weather_wind_speed: Optional[float] = Field(None, description="Wind speed in km/h")
    weather_visibility: Optional[float] = Field(None, description="Visibility in meters")
    weather_severity: Optional[int] = Field(None, ge=0, le=3, description="Weather severity: 0=clear, 1=light, 2=moderate, 3=severe")

    class Config:
        json_schema_extra = {
            "example": {
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
        }


class BatchPredictionInput(BaseModel):
    """Batch of prediction inputs."""
    predictions: list[PredictionInput]


# ============================================================
# FEATURE ENGINEERING (must match train_model.py exactly)
# ============================================================

def engineer_features(raw) -> dict:
    """
    Construct base 37 features in the exact order used during training.
    This mirrors the engineer_features() function in train_model.py.
    """
    d = raw.model_dump() if hasattr(raw, 'model_dump') else dict(raw)

    # Engineered numeric features
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

    # Categorical interaction feature
    d['section_type_gradient'] = f"{d['section_type']}_{d['gradient_profile']}"

    return d


def engineer_weather_features(d: dict) -> dict:
    """
    Add weather-engineered features to the feature dict.
    Called when weather model is active and weather fields are present.
    """
    # Default weather values when fields are missing
    temp = d.get('weather_temperature', 25.0) or 25.0
    precip = d.get('weather_precipitation', 0.0) or 0.0
    wind = d.get('weather_wind_speed', 10.0) or 10.0
    vis = d.get('weather_visibility', 10000.0) or 10000.0
    severity = d.get('weather_severity', 0) or 0

    d['weather_temperature'] = float(temp)
    d['weather_precipitation'] = float(precip)
    d['weather_wind_speed'] = float(wind)
    d['weather_visibility'] = float(vis)
    d['weather_severity'] = int(severity)

    # Engineered weather features (must match train_model_weather.py)
    d['weather_is_rain'] = 1 if d['weather_precipitation'] > 0.5 else 0
    d['weather_is_fog'] = 1 if d['weather_visibility'] < 1000 else 0
    d['weather_is_severe'] = 1 if d['weather_severity'] >= 2 else 0
    d['precipitation_x_distance'] = d['weather_precipitation'] * d['section_distance']

    return d


def prepare_feature_vector(raw: PredictionInput) -> np.ndarray:
    """
    Convert raw input to ordered feature vector matching BASE model schema (37 features).
    Applies label encoding to categorical features using fitted preprocessor encoders.
    Returns a 1-row numpy array of shape (1, 37).
    """
    if not model_loaded:
        raise RuntimeError("Model not loaded")

    raw_dict = raw.model_dump() if hasattr(raw, 'model_dump') else dict(raw)
    d = engineer_features(raw_dict)
    
    feature_names = feature_schema['all_features']
    categorical_features = feature_schema.get('categorical_features', ['section_type', 'gradient_profile', 'event_type', 'section_type_gradient'])
    encoders = preprocessor.get('encoders', {})

    values = []
    for fname in feature_names:
        if fname not in d:
            raise ValueError(f"Missing feature: {fname}")
        
        val = d[fname]
        if fname in categorical_features and fname in encoders:
            classes = encoders[fname]
            str_val = str(val)
            if str_val in classes:
                val = classes.index(str_val)
            else:
                val = 0
                
        try:
            values.append(float(val))
        except (ValueError, TypeError) as e:
            raise ValueError(f"Could not convert feature {fname} (value={val}) to float: {e}")

    return np.array([values], dtype=np.float32)


def prepare_weather_feature_vector(raw: PredictionInput) -> np.ndarray:
    """
    Convert raw input to ordered feature vector matching WEATHER model schema (46 features).
    Uses weather_preprocessor for label encoding.
    Returns a 1-row numpy array of shape (1, 46).
    """
    if not weather_model_loaded:
        raise RuntimeError("Weather model not loaded")

    raw_dict = raw.model_dump() if hasattr(raw, 'model_dump') else dict(raw)
    d = engineer_features(raw_dict)
    d = engineer_weather_features(d)

    feature_names = weather_feature_schema['all_features']
    categorical_features = weather_feature_schema.get('categorical_features', ['section_type', 'gradient_profile', 'event_type', 'section_type_gradient'])
    encoders = weather_preprocessor.get('encoders', {})

    values = []
    for fname in feature_names:
        if fname not in d:
            raise ValueError(f"Missing weather feature: {fname}")
        
        val = d[fname]
        if fname in categorical_features and fname in encoders:
            classes = encoders[fname]
            str_val = str(val)
            if str_val in classes:
                val = classes.index(str_val)
            else:
                val = 0
                
        try:
            values.append(float(val))
        except (ValueError, TypeError) as e:
            raise ValueError(f"Could not convert feature {fname} (value={val}) to float: {e}")

    return np.array([values], dtype=np.float32)


# ============================================================
# INFERENCE
# ============================================================

def predict_section_delay(raw: PredictionInput) -> dict:
    """
    Run inference: predict section delay using the trained XGBoost residual model.

    When weather features are provided and the weather model is loaded,
    uses the weather-aware model (46 features).
    Otherwise, uses the base model (37 features).

    Formula:
        predicted_delay = historical_mean_delay + predicted_residual
    """
    if not model_loaded:
        raise RuntimeError(f"Model not loaded: {load_error}")

    # Determine which model to use
    has_weather = any([
        raw.weather_temperature is not None,
        raw.weather_precipitation is not None,
        raw.weather_wind_speed is not None,
        raw.weather_visibility is not None,
        raw.weather_severity is not None,
    ])

    use_weather_model = has_weather and weather_model_loaded

    if use_weather_model:
        X = prepare_weather_feature_vector(raw)
        predicted_residual = float(weather_model.predict(X)[0])
        model_version = weather_metadata.get('model_version', 'unknown') if weather_metadata else 'unknown'
        model_name = 'XGBoost Residual (Weather-Aware)'
    else:
        X = prepare_feature_vector(raw)
        predicted_residual = float(model.predict(X)[0])
        model_version = metadata.get('model_version', 'unknown') if metadata else 'unknown'
        model_name = 'XGBoost Residual'

    # Final prediction = historical_mean_delay + predicted residual
    predicted_delay = raw.historical_mean_delay + predicted_residual

    return {
        'predictedDelayMinutes': round(predicted_delay, 4),
        'historicalMeanDelayMinutes': round(raw.historical_mean_delay, 4),
        'predictedResidualMinutes': round(predicted_residual, 4),
        'model': model_name,
        'modelVersion': model_version,
        'weatherUsed': use_weather_model,
        'predictionTimestamp': datetime.now(timezone.utc).isoformat(),
    }


# ============================================================
# API ENDPOINTS
# ============================================================

@app.get("/health")
def health_check():
    """Inference service health check."""
    return {
        'status': 'healthy' if model_loaded else 'degraded',
        'modelLoaded': model_loaded,
        'modelVersion': metadata.get('model_version') if metadata else None,
        'modelType': metadata.get('model_type') if metadata else None,
        'featureCount': len(feature_schema.get('all_features', [])) if feature_schema else 0,
        'weatherModelEnabled': weather_enabled,
        'weatherModelLoaded': weather_model_loaded,
        'weatherModelVersion': weather_metadata.get('model_version') if weather_metadata else None,
        'weatherFeatureCount': len(weather_feature_schema.get('all_features', [])) if weather_feature_schema else 0,
        'loadError': load_error,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }


@app.post("/predict")
def predict(input_data: PredictionInput):
    """Predict section delay for a single section."""
    try:
        result = predict_section_delay(input_data)
        return {'success': True, 'prediction': result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid input: {e}")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=f"Model unavailable: {e}")
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@app.post("/predict/batch")
def predict_batch(input_data: BatchPredictionInput):
    """Predict section delay for multiple sections."""
    if len(input_data.predictions) > 50:
        raise HTTPException(status_code=400, detail="Batch size limited to 50")

    results = []
    errors = []
    for i, pred in enumerate(input_data.predictions):
        try:
            result = predict_section_delay(pred)
            results.append({'index': i, 'success': True, 'prediction': result})
        except Exception as e:
            errors.append({'index': i, 'success': False, 'error': str(e)})

    return {
        'success': len(errors) == 0,
        'results': results,
        'errors': errors,
        'totalPredictions': len(input_data.predictions),
        'successfulPredictions': len(results),
    }


# ============================================================
# MAIN
# ============================================================

if __name__ == '__main__':
    import uvicorn
    port = int(os.environ.get('ETA_INFERENCE_PORT', 8001))
    logger.info(f"Starting ETA inference service on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
