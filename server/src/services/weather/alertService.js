const OperationalEvent = require('../../models/OperationalEvent');
const { SEVERITY_LEVELS } = require('./constants');

async function processWeatherAlert(weather) {
  if (weather.severity === SEVERITY_LEVELS.NORMAL) {
    await OperationalEvent.updateMany(
      { eventType: { $in: ['WeatherAlert', 'Fog'] }, affectedStations: weather.stationCode, isActive: true },
      { $set: { isActive: false, endTime: new Date() } }
    );
    return;
  }

  const existingAlert = await OperationalEvent.findOne({
    eventType: 'WeatherAlert',
    affectedStations: weather.stationCode,
    isActive: true
  });

  const severityMapping = {
    [SEVERITY_LEVELS.CAUTION]: 'Medium',
    [SEVERITY_LEVELS.SEVERE]: 'High'
  };

  const mappedSeverity = severityMapping[weather.severity] || 'Medium';

  if (existingAlert) {
    if (existingAlert.severity === mappedSeverity) return;
    existingAlert.severity = mappedSeverity;
    existingAlert.description = `Weather: ${weather.severity} - Code: ${weather.weatherCode}`;
    await existingAlert.save();
    return;
  }

  await OperationalEvent.create({
    eventType: 'WeatherAlert',
    affectedStations: [weather.stationCode],
    severity: mappedSeverity,
    description: `Weather: ${weather.severity} - Code: ${weather.weatherCode}`,
    startTime: new Date(),
    isActive: true
  });
}

module.exports = {
  processWeatherAlert
};
