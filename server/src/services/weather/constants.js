const SEVERITY_LEVELS = Object.freeze({
  NORMAL: 'NORMAL',
  CAUTION: 'CAUTION',
  SEVERE: 'SEVERE'
});

const THRESHOLDS = Object.freeze({
  WIND_SPEED: {
    CAUTION: 40,
    SEVERE: 60
  },
  WIND_GUST: {
    CAUTION: 60,
    SEVERE: 80
  },
  VISIBILITY: {
    CAUTION: 1000,
    SEVERE: 200
  },
  PRECIPITATION: {
    CAUTION: 15,
    SEVERE: 40
  },
  TEMPERATURE: {
    HIGH_CAUTION: 42,
    HIGH_SEVERE: 46,
    LOW_CAUTION: 2,
    LOW_SEVERE: -2
  },
  SEVERE_WMO_CODES: [55, 65, 67, 75, 82, 86, 95, 96, 99],
  CAUTION_WMO_CODES: [45, 48, 53, 57, 63, 66, 73, 77, 81, 85]
});

const CACHE_CONFIG = Object.freeze({
  TTL_MS: 30 * 60 * 1000,
  STALE_MS: 60 * 60 * 1000,
  MAX_SIZE: 200
});

const WMO_CODES = Object.freeze({
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Foggy with rime',
  51: 'Drizzle',
  53: 'Drizzle',
  55: 'Drizzle',
  61: 'Rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers',
  81: 'Heavy rain showers',
  82: 'Violent rain showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail'
});

module.exports = {
  SEVERITY_LEVELS,
  THRESHOLDS,
  CACHE_CONFIG,
  WMO_CODES
};
