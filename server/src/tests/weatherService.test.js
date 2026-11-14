jest.mock('axios');
jest.mock('../models/Station', () => ({
  findOne: jest.fn(),
}));

const axios = require('axios');
const Station = require('../models/Station');
const { getWeather } = require('../services/weather/service');
const { SEVERITY_LEVELS } = require('../services/weather/constants');

const mockWeatherApiResponse = {
  data: {
    current: {
      temperature_2m: 28,
      precipitation: 0,
      weather_code: 0,
      wind_speed_10m: 10,
      wind_direction_10m: 180,
      wind_gusts_10m: 15,
      visibility: 10000,
    },
  },
};

const mockStationRecord = {
  code: 'SBC',
  name: 'Bangalore City',
  city: 'Bangalore',
  state: 'Karnataka',
  latitude: 12.9767,
  longitude: 77.5753,
};

const mockStationRecord2 = {
  code: 'HWH',
  name: 'Howrah Junction',
  city: 'Kolkata',
  state: 'West Bengal',
  latitude: 22.5804,
  longitude: 88.3467,
};

beforeEach(() => {
  jest.clearAllMocks();
  Station.findOne.mockImplementation(() => ({
    lean: jest.fn().mockResolvedValue(mockStationRecord),
  }));
  axios.get.mockResolvedValue(mockWeatherApiResponse);
});

describe('Weather service', () => {
  test('returns weather with stationCode and severity for a valid station', async () => {
    const weather = await getWeather({ stationCode: 'SBC' });

    expect(weather).toBeDefined();
    expect(weather.stationCode).toBe('SBC');
    expect(weather.severity).toBeDefined();
    expect(Object.values(SEVERITY_LEVELS)).toContain(weather.severity);
  });

  test('returns expected weather fields from normalised output', async () => {
    const weather = await getWeather({ stationCode: 'SBC' });

    expect(weather).toHaveProperty('temperature');
    expect(weather).toHaveProperty('windSpeed');
    expect(weather).toHaveProperty('windGust');
    expect(weather).toHaveProperty('precipitation');
    expect(weather).toHaveProperty('visibility');
    expect(weather).toHaveProperty('weatherCode');
    expect(weather).toHaveProperty('source');
  });

  test('resolves station coordinates before fetching weather', async () => {
    Station.findOne.mockImplementation(() => ({
      lean: jest.fn().mockResolvedValue(mockStationRecord2),
    }));

    await getWeather({ stationCode: 'HWH' });

    expect(Station.findOne).toHaveBeenCalled();
    expect(axios.get).toHaveBeenCalledWith(
      'https://api.open-meteo.com/v1/forecast',
      expect.objectContaining({
        params: expect.objectContaining({
          latitude: mockStationRecord2.latitude,
          longitude: mockStationRecord2.longitude,
        }),
      })
    );
  });

  test('uses direct latitude/longitude when provided', async () => {
    const weather = await getWeather({ latitude: 28.6139, longitude: 77.209 });

    expect(weather).toBeDefined();
    expect(Station.findOne).not.toHaveBeenCalled();
    expect(axios.get).toHaveBeenCalled();
  });

  test('returns severity NORMAL for calm conditions', async () => {
    axios.get.mockResolvedValue({
      data: {
        current: {
          temperature_2m: 25,
          precipitation: 0,
          weather_code: 0,
          wind_speed_10m: 5,
          wind_direction_10m: 90,
          wind_gusts_10m: 8,
          visibility: 20000,
        },
      },
    });

    const weather = await getWeather({ stationCode: 'SBC' });
    expect(weather.severity).toBe(SEVERITY_LEVELS.NORMAL);
  });

  test('throws when station is not found', async () => {
    Station.findOne.mockImplementation(() => ({
      lean: jest.fn().mockResolvedValue(null),
    }));

    await expect(getWeather({ stationCode: 'XXXX' })).rejects.toThrow('Station not found');
  });

  test('throws when no location identifier is provided', async () => {
    await expect(getWeather({})).rejects.toThrow('Location identifier missing');
  });
});
