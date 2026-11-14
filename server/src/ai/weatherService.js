const { getWeather: getNewWeather } = require('../services/weather/service');
const { processWeatherAlert } = require('../services/weather/alertService');
const { WMO_CODES } = require('../services/weather/constants');

function getWeatherCondition(weatherCode) {
  return WMO_CODES[weatherCode] || 'Unknown condition';
}

async function getWeather(params = {}) {
  try {
    const normalized = await getNewWeather(params);
    await processWeatherAlert(normalized).catch(() => {});
    return {
      success: true,
      stationCode: normalized.stationCode,
      stationName: normalized.stationName,
      latitude: normalized.latitude,
      longitude: normalized.longitude,
      timestamp: normalized.timestamp,
      timezone: normalized.timezone,
      temperature: normalized.temperature,
      precipitation: normalized.precipitation,
      visibility: normalized.visibility,
      windSpeed: normalized.windSpeed,
      windDirection: normalized.windDirection,
      windGust: normalized.windGust,
      weatherCode: normalized.weatherCode,
      severity: normalized.severity,
      source: normalized.source,
      isStale: normalized.isStale,
      location: {
        stationCode: normalized.stationCode,
        stationName: normalized.stationName,
        latitude: normalized.latitude,
        longitude: normalized.longitude,
      },
      current: {
        temperature: normalized.temperature,
        feelsLike: normalized.temperature,
        humidity: 50,
        weatherCode: normalized.weatherCode,
        condition: getWeatherCondition(normalized.weatherCode),
        precipitationProbability: normalized.precipitation,
        windSpeed: normalized.windSpeed,
        windDirection: normalized.windDirection,
      },
      forecast: [],
      tomorrow: null,
    };
  } catch (err) {
    return {
      success: false,
      error: 'Weather information is temporarily unavailable.',
      details: err.message,
    };
  }
}

async function getDestinationWeather(destinationCode, dateType = 'today') {
  if (!destinationCode) {
    return { success: false, error: 'No destination station provided.' };
  }
  return getWeather({ stationCode: destinationCode, date: dateType });
}

module.exports = {
  getWeather,
  getDestinationWeather,
};
