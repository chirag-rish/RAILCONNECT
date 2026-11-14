const { SEVERITY_LEVELS, THRESHOLDS, CACHE_CONFIG } = require('./constants');

function deriveSeverity(data) {
  const { weatherCode, windSpeed, windGust, visibility, precipitation, temperature } = data;

  if (THRESHOLDS.SEVERE_WMO_CODES.includes(weatherCode)) {
    return SEVERITY_LEVELS.SEVERE;
  }
  if (windSpeed >= THRESHOLDS.WIND_SPEED.SEVERE) {
    return SEVERITY_LEVELS.SEVERE;
  }
  if (windGust >= THRESHOLDS.WIND_GUST.SEVERE) {
    return SEVERITY_LEVELS.SEVERE;
  }
  if (visibility != null && visibility <= THRESHOLDS.VISIBILITY.SEVERE) {
    return SEVERITY_LEVELS.SEVERE;
  }
  if (precipitation != null && precipitation >= THRESHOLDS.PRECIPITATION.SEVERE) {
    return SEVERITY_LEVELS.SEVERE;
  }
  if (temperature != null && (temperature >= THRESHOLDS.TEMPERATURE.HIGH_SEVERE || temperature <= THRESHOLDS.TEMPERATURE.LOW_SEVERE)) {
    return SEVERITY_LEVELS.SEVERE;
  }

  if (THRESHOLDS.CAUTION_WMO_CODES.includes(weatherCode)) {
    return SEVERITY_LEVELS.CAUTION;
  }
  if (windSpeed >= THRESHOLDS.WIND_SPEED.CAUTION) {
    return SEVERITY_LEVELS.CAUTION;
  }
  if (windGust >= THRESHOLDS.WIND_GUST.CAUTION) {
    return SEVERITY_LEVELS.CAUTION;
  }
  if (visibility != null && visibility <= THRESHOLDS.VISIBILITY.CAUTION) {
    return SEVERITY_LEVELS.CAUTION;
  }
  if (precipitation != null && precipitation >= THRESHOLDS.PRECIPITATION.CAUTION) {
    return SEVERITY_LEVELS.CAUTION;
  }
  if (temperature != null && (temperature >= THRESHOLDS.TEMPERATURE.HIGH_CAUTION || temperature <= THRESHOLDS.TEMPERATURE.LOW_CAUTION)) {
    return SEVERITY_LEVELS.CAUTION;
  }

  return SEVERITY_LEVELS.NORMAL;
}

function normalizeWeather(rawData, locationInfo = {}) {
  const currentData = rawData.current || rawData;
  const timestamp = currentData.time || rawData.timestamp || new Date().toISOString();
  const timezone = rawData.timezone || 'Asia/Kolkata';
  const age = Date.now() - new Date(timestamp).getTime();
  const isStale = age > CACHE_CONFIG.STALE_MS;

  const normalizedInput = {
    weatherCode: currentData.weatherCode ?? currentData.weather_code ?? 0,
    windSpeed: currentData.windSpeed ?? currentData.wind_speed_10m ?? 0,
    windGust: currentData.windGust ?? currentData.wind_gusts_10m ?? 0,
    visibility: currentData.visibility ?? 10000,
    precipitation: currentData.precipitation ?? currentData.precipitation_sum ?? 0,
    temperature: currentData.temperature ?? currentData.temperature_2m ?? 0
  };

  const severity = deriveSeverity(normalizedInput);

  return {
    stationCode: locationInfo.stationCode || null,
    stationName: locationInfo.stationName || null,
    latitude: locationInfo.latitude ?? rawData.latitude ?? null,
    longitude: locationInfo.longitude ?? rawData.longitude ?? null,
    timestamp,
    timezone,
    temperature: normalizedInput.temperature,
    precipitation: normalizedInput.precipitation,
    visibility: normalizedInput.visibility,
    windSpeed: normalizedInput.windSpeed,
    windDirection: currentData.windDirection ?? currentData.wind_direction_10m ?? 0,
    windGust: normalizedInput.windGust,
    weatherCode: normalizedInput.weatherCode,
    severity,
    source: 'Open-Meteo (External Weather Model)',
    isStale
  };
}

module.exports = {
  deriveSeverity,
  normalizeWeather
};
