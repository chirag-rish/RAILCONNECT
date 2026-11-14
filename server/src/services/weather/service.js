const axios = require('axios');
const Station = require('../../models/Station');
const { normalizeWeather } = require('./normalization');
const { CACHE_CONFIG } = require('./constants');

const weatherCache = new Map();

async function resolveStation(identifier) {
  if (!identifier) return null;
  const str = String(identifier).trim();
  if (!str) return null;
  let station = await Station.findOne({ code: str.toUpperCase() }).lean();
  if (!station) {
    const re = new RegExp(str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    station = await Station.findOne({ $or: [{ name: re }, { city: re }] }).lean();
  }
  if (!station || station.latitude == null || station.longitude == null) {
    return null;
  }
  return {
    stationCode: station.code,
    stationName: station.name,
    latitude: station.latitude,
    longitude: station.longitude
  };
}

const WEATHER_API_TIMEOUT = parseInt(process.env.WEATHER_API_TIMEOUT || '8000', 10);

async function fetchWeather(lat, lng) {
  const url = 'https://api.open-meteo.com/v1/forecast';
  const params = {
    latitude: lat,
    longitude: lng,
    current: ['temperature_2m', 'relative_humidity_2m', 'precipitation', 'weather_code', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'visibility'],
    timezone: 'auto',
  };
  const response = await axios.get(url, { params, timeout: WEATHER_API_TIMEOUT });
  return response.data;
}

async function getWeather(params = {}) {
  let lat = params.latitude;
  let lng = params.longitude;
  let locationInfo = {};

  if (lat == null || lng == null) {
    const identifier = params.stationCode || params.stationName;
    if (!identifier) throw new Error('Location identifier missing');
    const resolved = await resolveStation(identifier);
    if (!resolved) throw new Error('Station not found');
    lat = resolved.latitude;
    lng = resolved.longitude;
    locationInfo = resolved;
  }

  const cacheKey = `${lat.toFixed(2)}:${lng.toFixed(2)}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_CONFIG.TTL_MS) {
    return cached.data;
  }

  try {
    const rawData = await fetchWeather(lat, lng);
    const normalized = normalizeWeather(rawData, locationInfo);
    weatherCache.set(cacheKey, { data: normalized, timestamp: Date.now() });
    return normalized;
  } catch (error) {
    if (cached) return { ...cached.data, isStale: true };
    throw error;
  }
}

module.exports = {
  getWeather,
  resolveStation
};
