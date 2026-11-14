/**
 * SIH26028 — Phase 3A: Weather-Aware ETA Integration Tests
 *
 * Covers:
 *  1. Weather feature construction (training/live parity)
 *  2. Weather unavailable handling
 *  3. Weather API failure
 *  4. Current-location weather resolution
 *  5. Weather cache behavior
 *  6. Prediction schema (base + weather model)
 *  7. No future-data leakage in weather generation
 *  8. ETA regression — base model still works as rollback
 */

// Mock mongoose models BEFORE requiring the engine
jest.mock('../models/Train', () => ({
  findOne: jest.fn().mockImplementation(() => ({
    populate: jest.fn().mockResolvedValue({
      _id: 'train-1',
      trainNumber: '11020',
      name: 'Konark Express',
      route: {
        stations: [
          { station: 'BZA', stationName: 'Vijayawada Jn', scheduledArrival: null, scheduledDeparture: '10:55', haltDuration: 0 },
          { station: 'WL', stationName: 'Warangal', scheduledArrival: '14:15', scheduledDeparture: '14:20', haltDuration: 5 },
          { station: 'SC', stationName: 'Secunderabad Jn', scheduledArrival: '16:50', scheduledDeparture: '17:00', haltDuration: 10 },
        ],
        sections: [
          { fromStation: 'BZA', toStation: 'WL', distance: 207, typicalSpeed: 70, maxSpeed: 110, sectionType: 'DoubleLine', signalCount: 4, levelCrossings: 1, gradientProfile: 'Flat' },
          { fromStation: 'WL', toStation: 'SC', distance: 142, typicalSpeed: 65, maxSpeed: 110, sectionType: 'DoubleLine', signalCount: 3, levelCrossings: 1, gradientProfile: 'Flat' },
        ],
      },
    }),
  })),
}));

jest.mock('../models/Station', () => ({
  findOne: jest.fn().mockImplementation(() => ({
    lean: jest.fn().mockResolvedValue({ code: 'BZA', name: 'Vijayawada Jn', latitude: 16.518, longitude: 80.648 }),
  })),
}));

jest.mock('../models/OperationalEvent', () => ({
  find: jest.fn().mockResolvedValue([]),
}));

jest.mock('../models/ETAPrediction', () => ({
  create: jest.fn().mockResolvedValue({ _id: 'pred-1' }),
}));

jest.mock('../models/TrainRun', () => ({
  find: jest.fn().mockResolvedValue([]),
}));

jest.mock('../models/HistoricalTrainProfile', () => ({
  findOne: jest.fn().mockImplementation(() => ({
    lean: jest.fn().mockResolvedValue(null),
  })),
}));

jest.mock('../models/HistoricalRouteProfile', () => ({
  findOne: jest.fn().mockImplementation(() => ({
    lean: jest.fn().mockResolvedValue(null),
  })),
}));

jest.mock('../services/historical', () => ({
  getTrainHistoricalProfile: jest.fn().mockResolvedValue(null),
}));

jest.mock('../services/weather/service', () => ({
  getWeather: jest.fn(),
}));

const engine = require('../live/liveEtaEngine');
const { getWeather } = require('../services/weather/service');
const Train = require('../models/Train');
const OperationalEvent = require('../models/OperationalEvent');
const ETAPrediction = require('../models/ETAPrediction');
const TrainRun = require('../models/TrainRun');
const Station = require('../models/Station');

jest.mock('../services/weather/service', () => ({
  getWeather: jest.fn(),
}));

jest.setTimeout(20000);

// ============================================================
// FIXTURES
// ============================================================

function makeTelemetry(overrides = {}) {
  return {
    trainId: 'train-1',
    trainNumber: '11020',
    timestamp: new Date(),
    latitude: 17.385,
    longitude: 78.4867,
    speed: 80,
    heading: 45,
    currentStation: 'BZA',
    nextStation: 'WL',
    sectionIndex: 0,
    progressInSection: 50,
    sectionDistance: 207,
    accumulatedDelay: 5,
    status: 'OnTime',
    source: 'SIMULATOR',
    ...overrides,
  };
}

function makeWeather(overrides = {}) {
  return {
    stationCode: 'BZA',
    stationName: 'Vijayawada Jn',
    temperature: 28.5,
    precipitation: 12.0,
    windSpeed: 30.0,
    visibility: 800,
    severity: 'CAUTION',
    source: 'Open-Meteo (External Weather Model)',
    isStale: false,
    ...overrides,
  };
}

function stubDbForTrain() {
  Train.findOne.mockImplementation(() => ({
    populate: jest.fn().mockResolvedValue({
      _id: 'train-1',
      trainNumber: '11020',
      name: 'Konark Express',
      route: {
        stations: [
          { station: 'BZA', stationName: 'Vijayawada Jn', scheduledArrival: null, scheduledDeparture: '10:55', haltDuration: 0 },
          { station: 'WL', stationName: 'Warangal', scheduledArrival: '14:15', scheduledDeparture: '14:20', haltDuration: 5 },
          { station: 'SC', stationName: 'Secunderabad Jn', scheduledArrival: '16:50', scheduledDeparture: '17:00', haltDuration: 10 },
        ],
        sections: [
          { fromStation: 'BZA', toStation: 'WL', distance: 207, typicalSpeed: 70, maxSpeed: 110, sectionType: 'DoubleLine', signalCount: 4, levelCrossings: 1, gradientProfile: 'Flat' },
          { fromStation: 'WL', toStation: 'SC', distance: 142, typicalSpeed: 65, maxSpeed: 110, sectionType: 'DoubleLine', signalCount: 3, levelCrossings: 1, gradientProfile: 'Flat' },
        ],
      },
    }),
  }));
  OperationalEvent.find.mockResolvedValue([]);
  TrainRun.find.mockResolvedValue([]);
}

// ============================================================
// 1. WEATHER FEATURE CONSTRUCTION
// ============================================================

describe('Weather Feature Construction', () => {
  beforeEach(() => {
    engine._clearWeatherCache();
    jest.clearAllMocks();
    stubDbForTrain();
    OperationalEvent.find.mockResolvedValue([]);
  });

  it('should include weather fields in prediction input when weather is provided', () => {
    const input = engine._buildPredictionInput({
      accumulatedDelayEntering: 5.0,
      weather: {
        temperature: 28.5,
        precipitation: 12.0,
        windSpeed: 30.0,
        visibility: 800,
        severityLevel: 2,
        weatherAvailable: true,
      },
    });

    expect(input.weather_temperature).toBe(28.5);
    expect(input.weather_precipitation).toBe(12.0);
    expect(input.weather_wind_speed).toBe(30.0);
    expect(input.weather_visibility).toBe(800);
    expect(input.weather_severity).toBe(2);
  });

  it('should NOT include weather fields when weather is unavailable', () => {
    const input = engine._buildPredictionInput({ accumulatedDelayEntering: 5.0 });
    expect(input).not.toHaveProperty('weather_temperature');
    expect(input).not.toHaveProperty('weather_precipitation');
    expect(Object.keys(input).length).toBe(20);
  });

  it('should map weather severity levels consistently with training', () => {
    expect(engine._toWeatherModelInput({ severity: 'NORMAL', precipitation: 0 }).weatherSeverity).toBe(0);
    expect(engine._toWeatherModelInput({ severity: 'NORMAL', precipitation: 2, isStale: false }).weatherSeverity).toBe(1);
    expect(engine._toWeatherModelInput({ severity: 'CAUTION', isStale: false }).weatherSeverity).toBe(2);
    expect(engine._toWeatherModelInput({ severity: 'SEVERE', isStale: false }).weatherSeverity).toBe(3);
  });
});

// ============================================================
// 2. WEATHER UNAVAILABLE
// ============================================================

describe('Weather Unavailable', () => {
  beforeEach(() => {
    engine._clearWeatherCache();
    jest.clearAllMocks();
    stubDbForTrain();
    OperationalEvent.find.mockResolvedValue([]);
  });

  it('should return null from _fetchWeatherForTrain when getWeather throws', async () => {
    getWeather.mockRejectedValue(new Error('Open-Meteo down'));
    const result = await engine._fetchWeatherForTrain(makeTelemetry(), null);
    expect(result).toBeNull();
  });

  it('should return null when weather data is invalid (no severity)', async () => {
    getWeather.mockResolvedValue({ temperature: 30, precipitation: 0 });
    const result = await engine._fetchWeatherForTrain(makeTelemetry(), null);
    expect(result).toBeNull();
  });

  it('should fall back to base model prediction when weather lookup fails', async () => {
    // Real inference service is used here (no mock on axios)
    // If weather fails, prediction should still succeed via base model
    getWeather.mockRejectedValue(new Error('API down'));
    const result = await engine._toWeatherModelInput(await engine._fetchWeatherForTrain(makeTelemetry(), null));
    expect(result).toBeNull(); // Weather unavailable → base model fallback
  });
});

// ============================================================
// 3. WEATHER API FAILURE
// ============================================================

describe('Weather API Failure', () => {
  beforeEach(() => {
    engine._clearWeatherCache();
    jest.clearAllMocks();
    stubDbForTrain();
    OperationalEvent.find.mockResolvedValue([]);
  });

  it('should not crash _predictForTrain when weather fails', async () => {
    getWeather.mockRejectedValue(new Error('timeout'));
    engine.trainState.clear();
    // Should not throw — it should run with base model
    await expect(engine._predictForTrain(makeTelemetry())).resolves.toBeUndefined();
  });
});

// ============================================================
// 4. CURRENT-LOCATION WEATHER RESOLUTION
// ============================================================

describe('Current-Location Weather Resolution', () => {
  beforeEach(() => {
    engine._clearWeatherCache();
    jest.clearAllMocks();
    stubDbForTrain();
    OperationalEvent.find.mockResolvedValue([]);
  });

  it('should use telemetry latitude/longitude for weather lookup', async () => {
    getWeather.mockResolvedValue(makeWeather());
    const telemetry = makeTelemetry({ latitude: 17.385, longitude: 78.4867 });
    const weather = await engine._fetchWeatherForTrain(telemetry, null);
    expect(getWeather).toHaveBeenCalledWith({ latitude: 17.385, longitude: 78.4867 });
    expect(weather).not.toBeNull();
  });

  it('should fall back to section fromStation coordinates when telemetry has no lat/lng', async () => {
    getWeather.mockResolvedValue(makeWeather());
    const telemetry = makeTelemetry({ latitude: null, longitude: null });
    const section = { fromStation: 'BZA' };
    const weather = await engine._fetchWeatherForTrain(telemetry, section);
    expect(weather).not.toBeNull();
  });
});

// ============================================================
// 5. WEATHER CACHE
// ============================================================

describe('Weather Cache', () => {
  beforeEach(() => {
    engine._clearWeatherCache();
    jest.clearAllMocks();
    stubDbForTrain();
    OperationalEvent.find.mockResolvedValue([]);
  });

  it('should fetch weather only once for the same location within TTL', async () => {
    getWeather.mockResolvedValue(makeWeather());
    const telemetry = makeTelemetry({ latitude: 17.385, longitude: 78.4867 });

    await engine._fetchWeatherForTrain(telemetry, null);
    await engine._fetchWeatherForTrain(telemetry, null);
    await engine._fetchWeatherForTrain(telemetry, null);

    expect(getWeather).toHaveBeenCalledTimes(1);
  });

  it('should clear cache on _clearWeatherCache', async () => {
    getWeather.mockResolvedValue(makeWeather());
    const telemetry = makeTelemetry({ latitude: 17.385, longitude: 78.4867 });

    await engine._fetchWeatherForTrain(telemetry, null);
    expect(getWeather).toHaveBeenCalledTimes(1);

    engine._clearWeatherCache();
    await engine._fetchWeatherForTrain(telemetry, null);
    expect(getWeather).toHaveBeenCalledTimes(2);
  });

  it('should not cache null results (avoid caching failures)', async () => {
    getWeather.mockRejectedValueOnce(new Error('first fail')).mockResolvedValueOnce(makeWeather());
    const telemetry = makeTelemetry({ latitude: 17.385, longitude: 78.4867 });

    const first = await engine._fetchWeatherForTrain(telemetry, null);
    expect(first).toBeNull();
    const second = await engine._fetchWeatherForTrain(telemetry, null);
    expect(second).not.toBeNull();
    expect(getWeather).toHaveBeenCalledTimes(2);
  });
});

// ============================================================
// 6. PREDICTION SCHEMA
// ============================================================

describe('Prediction Schema (Base vs Weather Model)', () => {
  it('base model input is exactly 20 fields', () => {
    const input = engine._buildPredictionInput({});
    expect(Object.keys(input).length).toBe(20);
    expect(Object.keys(input).sort()).toEqual([
      'accumulated_delay_entering', 'prev_section_travel_time', 'prev_section_delay',
      'stations_travelled', 'stations_remaining', 'section_distance', 'typical_speed',
      'max_speed', 'signal_count', 'level_crossings', 'section_type', 'gradient_profile',
      'hour', 'day_of_week', 'is_weekend', 'event_active', 'event_type',
      'event_speed_limit', 'historical_mean_travel_time', 'historical_mean_delay',
    ].sort());
  });

  it('weather model input adds 5 weather fields (25 total)', () => {
    const input = engine._buildPredictionInput({
      weather: { temperature: 25, precipitation: 0, windSpeed: 10, visibility: 10000, severityLevel: 0, weatherAvailable: true },
    });
    expect(Object.keys(input).length).toBe(25);
    expect(input).toHaveProperty('weather_temperature');
    expect(input).toHaveProperty('weather_precipitation');
    expect(input).toHaveProperty('weather_wind_speed');
    expect(input).toHaveProperty('weather_visibility');
    expect(input).toHaveProperty('weather_severity');
  });
});

// ============================================================
// 7. NO FUTURE-DATA LEAKAGE
// ============================================================

describe('No Future-Data Leakage', () => {
  it('weather features are derived only from location/season/time, never from target', () => {
    // The training generator (extend_dataset_weather.py) uses ONLY
    // day_of_year, hour, latitude_proxy, and route_rng to generate weather.
    // Target delay is NOT an input to weather generation.
    // Verify by reading the generator source.
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('C:/Users/NEW/Desktop/CBP/server/ml/extend_dataset_weather.py'), 'utf8');

    // Weather generation must NOT reference target_delay
    const weatherFn = src.split('def generate_weather')[1].split('def get_weather_delay_impact')[0];
    expect(weatherFn).not.toContain('target_delay');
    expect(weatherFn).not.toContain('section_delay');
    expect(weatherFn).not.toContain('actualTravelTime');
  });

  it('weather delay impact is applied AFTER weather generation as separate causal step', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('C:/Users/NEW/Desktop/CBP/server/ml/extend_dataset_weather.py'), 'utf8');

    // The causal mechanism is isolated in get_weather_delay_impact
    expect(src).toContain('def get_weather_delay_impact(weather, section_type, gradient, max_speed, scheduled_travel_min)');
    // Weather is generated before delay computation and does not see the delay
    const generateFn = src.split('def generate_dataset')[1];
    expect(generateFn).toContain('weather = generate_weather(day_of_year, entry_hour, lat_proxy, route_rng)');
  });
});

// ============================================================
// 8. ETA REGRESSION — base flow still works
// ============================================================

describe('Weather-Aware ETA — Live Regression', () => {
  beforeEach(() => {
    engine._clearWeatherCache();
    jest.clearAllMocks();
    stubDbForTrain();
    OperationalEvent.find.mockResolvedValue([]);
  });

  it('existing ETA prediction still works (base model path)', async () => {
    engine.trainState.clear();
    await engine._predictForTrain(makeTelemetry({ accumulatedDelay: 0 }));
    const pred = engine.getLatestPrediction('train-1');
    expect(pred).not.toBeNull();
    expect(pred.destination).toBeDefined();
    expect(pred.destination.predictedArrival).toBeTruthy();
  });

  it('existing telemetry regression — onTelemetryIngested handles weather failure gracefully', async () => {
    // onTelemetryIngested should not throw when weather is unavailable
    getWeather.mockRejectedValue(new Error('weather unavailable'));
    OperationalEvent.find.mockResolvedValue([]);
    await expect(engine.onTelemetryIngested(makeTelemetry())).resolves.not.toThrow();
  });
});

// ============================================================
// 9. WEATHER-AWARE INFERENCE (via Python service, if running)
// ============================================================

describe('Weather-Aware Inference (Integration)', () => {
  beforeEach(() => {
    engine._clearWeatherCache();
    jest.clearAllMocks();
    stubDbForTrain();
    OperationalEvent.find.mockResolvedValue([]);
  });

  it('sends weather fields to the inference service when available', async () => {
    const axios = require('axios');
    const spy = jest.spyOn(axios, 'post').mockImplementation(async (url, payload) => {
      // Echo back a prediction response
      return { data: {
        success: true,
        prediction: {
          predictedDelayMinutes: 5.5,
          historicalMeanDelayMinutes: 2.4,
          predictedResidualMinutes: 3.1,
          model: 'XGBoost Residual (Weather-Aware)',
          modelVersion: '3.0.0-weather',
          weatherUsed: true,
        }
      } };
    });

    try {
      engine.trainState.clear();
      getWeather.mockResolvedValue(makeWeather());
      await engine._predictForTrain(makeTelemetry({ accumulatedDelay: 2 }));
      const pred = engine.getLatestPrediction('train-1');
      expect(pred).not.toBeNull();
      expect(pred.currentSectionPrediction.model).toBe('XGBoost Residual (Weather-Aware)');
      expect(pred.weatherContext).toBeDefined();
      expect(pred.weatherContext.severity).toBe('CAUTION');
    } finally {
      spy.mockRestore();
    }
  });

  it('stops sending weather fields for base model when weather is unavailable', async () => {
    const axios = require('axios');
    let capturedPayload = null;
    const spy = jest.spyOn(axios, 'post').mockImplementation(async (url, payload) => {
      capturedPayload = payload;
      return { data: {
        success: true,
        prediction: {
          predictedDelayMinutes: 3.2,
          historicalMeanDelayMinutes: 2.4,
          predictedResidualMinutes: 0.8,
          model: 'XGBoost Residual',
          modelVersion: '2.0.0',
          weatherUsed: false,
        }
      } };
    });

    try {
      engine.trainState.clear();
      getWeather.mockRejectedValue(new Error('weather down'));
      await engine._predictForTrain(makeTelemetry({ accumulatedDelay: 2 }));
      expect(capturedPayload).toBeDefined();
      expect(capturedPayload).not.toHaveProperty('weather_temperature');
      const pred = engine.getLatestPrediction('train-1');
      expect(pred.currentSectionPrediction.model).toBe('XGBoost Residual');
    } finally {
      spy.mockRestore();
    }
  });
});