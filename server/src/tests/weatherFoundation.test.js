const { normalizeWeather, deriveSeverity } = require('../services/weather/normalization');
const { SEVERITY_LEVELS } = require('../services/weather/constants');
const { processWeatherAlert } = require('../services/weather/alertService');
const OperationalEvent = require('../models/OperationalEvent');

describe('Weather Foundation Unit Tests', () => {
  test('severity classification normal', () => {
    const sev = deriveSeverity({
      weatherCode: 0,
      windSpeed: 10,
      windGust: 15,
      visibility: 10000,
      precipitation: 0,
      temperature: 25
    });
    expect(sev).toBe(SEVERITY_LEVELS.NORMAL);
  });

  test('severity classification caution and severe', () => {
    const sev = deriveSeverity({
      weatherCode: 45,
      windSpeed: 45,
      windGust: 65,
      visibility: 800,
      precipitation: 20,
      temperature: 47
    });
    expect(sev).toBe(SEVERITY_LEVELS.SEVERE);
  });

  test('successful weather normalization', () => {
    const raw = {
      weather_code: 0,
      wind_speed_10m: 12,
      wind_gusts_10m: 20,
      visibility: 10000,
      precipitation: 0,
      temperature_2m: 30,
      timestamp: new Date().toISOString()
    };
    const normalized = normalizeWeather(raw, { stationCode: 'DEL', stationName: 'Delhi', latitude: 28.6, longitude: 77.2 });
    expect(normalized.stationCode).toBe('DEL');
    expect(normalized.severity).toBe(SEVERITY_LEVELS.NORMAL);
    expect(normalized.source).toContain('Open-Meteo');
    expect(normalized.isStale).toBe(false);
  });

  test('stale response detection', () => {
    const oldDate = new Date(Date.now() - 70 * 60 * 1000).toISOString();
    const raw = {
      weather_code: 0,
      wind_speed_10m: 5,
      timestamp: oldDate
    };
    const normalized = normalizeWeather(raw, { stationCode: 'DEL' });
    expect(normalized.isStale).toBe(true);
  });

  test('weather timezone field normalization and raw data propagation', () => {
    const rawEST = {
      weather_code: 0,
      timestamp: '2026-09-08T12:00:00.000Z',
      timezone: 'America/New_York'
    };
    const normalizedEST = normalizeWeather(rawEST, { stationCode: 'NYC' });
    expect(normalizedEST.timezone).toBe('America/New_York');

    const rawIST = {
      weather_code: 0,
      timestamp: '2026-09-08T23:00:00.000Z',
      timezone: 'Asia/Kolkata'
    };
    const normalizedIST = normalizeWeather(rawIST, { stationCode: 'DEL' });
    expect(normalizedIST.timezone).toBe('Asia/Kolkata');
  });
});
