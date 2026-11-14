/**
 * SIH26028 — Explainable Dynamic ETA Engine
 *
 * Generates structured explanations for ETA changes based strictly on
 * real live railway state, model inputs, and XGBoost residuals.
 */

function generateEtaExplanation({
  previousEta = null,
  newEta = null,
  accumulatedDelay = 0,
  prevSectionDelay = 0,
  currentSpeed = 0,
  typicalSpeed = 80,
  maxSpeed = 110,
  sectionDistance = 100,
  historicalMeanDelay = 0,
  predictedDelayMinutes = 0,
  historicalMeanTravelTime = 0,
  predictedResidualMinutes = 0,
  eventActive = 0,
  eventType = 'None',
  eventSpeedLimit = 110,
  signalCount = 3,
  weather = null,
  weatherUsed = false,
}) {
  const reasons = [];
  let recoveryMinutes = 0;

  // 0. Phase 3A: Weather impact (model actually used weather features)
  if (weather && weatherUsed && weather.severity !== 'NORMAL') {
    const wImpact = Math.max(1.0, Math.round(Math.abs(predictedResidualMinutes) * 0.5 * 10) / 10);
    let wLabel = 'Weather Conditions';
    if (weather.severity === 'SEVERE') {
      wLabel = 'Severe Weather';
      if (weather.precipitation >= 20) wLabel = 'Heavy Rain';
      else if (weather.visibility != null && weather.visibility < 500) wLabel = 'Dense Fog';
      else if (weather.windSpeed >= 60) wLabel = 'Strong Winds';
    } else if (weather.severity === 'CAUTION') {
      wLabel = 'Adverse Weather';
      if (weather.precipitation >= 5 && weather.precipitation < 20) wLabel = 'Rain';
      else if (weather.visibility != null && weather.visibility < 1000) wLabel = 'Fog';
      else if (weather.windSpeed >= 40) wLabel = 'High Winds';
    }
    reasons.push({
      type: 'Weather',
      label: wLabel,
      impactMinutes: wImpact,
      severity: weather.severity === 'SEVERE' ? 'High' : 'Medium',
      evidence: `Weather conditions (${wLabel.toLowerCase()}: ${weather.temperature}°C, ${weather.precipitation}mm/h, visibility ${weather.visibility}m) contributed ${wImpact.toFixed(1)}m to the ETA`,
    });
  } else if (weather && weatherUsed) {
    reasons.push({
      type: 'Weather',
      label: 'Normal Weather',
      impactMinutes: 0,
      severity: 'None',
      evidence: 'Weather conditions are not currently contributing materially to the ETA.',
    });
  }

  // 1. Existing Delay (accumulated from previous sections)
  const baseDelay = Number(accumulatedDelay || prevSectionDelay || 0);
  if (baseDelay > 0.5) {
    reasons.push({
      type: 'ExistingDelay',
      label: 'Prior Section Delay',
      impactMinutes: Math.round(baseDelay * 10) / 10,
      severity: baseDelay > 15 ? 'High' : baseDelay > 5 ? 'Medium' : 'Low',
      evidence: `Carried forward ${baseDelay.toFixed(1)}m accumulated delay entering section`,
    });
  }

  // 2. Operational Event / Speed Restriction / Signal Delay
  if (eventActive === 1 && eventType && eventType !== 'None') {
    let type = 'OperationalEvent';
    let label = `Active Event: ${eventType}`;
    if (eventType === 'SpeedRestriction' || eventSpeedLimit < maxSpeed) {
      type = 'SpeedRestriction';
      label = `Speed Restriction (${eventSpeedLimit} km/h limit)`;
    } else if (eventType === 'SignalIssue' || eventType === 'SignalDelay') {
      type = 'SignalDelay';
      label = 'Signal Delay / Restriction';
    }

    const eventImpact = Math.max(1.0, Math.round((predictedResidualMinutes * 0.6) * 10) / 10);
    reasons.push({
      type,
      label,
      impactMinutes: eventImpact > 0 ? eventImpact : 2.0,
      severity: eventImpact > 5 ? 'High' : 'Medium',
      evidence: `Operational event active with speed limit ${eventSpeedLimit} km/h (Max: ${maxSpeed} km/h)`,
    });
  }

  // 3. Speed restriction / Congestion based on live speed vs typical speed
  if (currentSpeed > 0 && currentSpeed < typicalSpeed * 0.75) {
    const speedDropRatio = (typicalSpeed - currentSpeed) / typicalSpeed;
    const congestionImpact = Math.round((speedDropRatio * 5.0) * 10) / 10;
    if (congestionImpact > 0.5) {
      reasons.push({
        type: 'Congestion',
        label: 'Section Congestion / Slow Running',
        impactMinutes: congestionImpact,
        severity: congestionImpact > 5 ? 'High' : 'Medium',
        evidence: `Current speed ${currentSpeed} km/h is significantly below typical section speed ${typicalSpeed} km/h`,
      });
    }
  }

  // 4. Signal / Infrastructure Complexity (if signal count is high and residual is positive)
  if (signalCount >= 4 && predictedResidualMinutes > 1.0) {
    reasons.push({
      type: 'SignalDelay',
      label: 'High Signal Density',
      impactMinutes: Math.round(predictedResidualMinutes * 0.4 * 10) / 10,
      severity: 'Low',
      evidence: `${signalCount} signals on section contributed ${predictedResidualMinutes.toFixed(1)}m residual delay`,
    });
  }

  // 5. Normal Running / Model Residual
  const residualImpact = Math.round(predictedResidualMinutes * 10) / 10;
  if (Math.abs(residualImpact) > 0.2 && reasons.length === 0) {
    reasons.push({
      type: residualImpact > 0 ? 'OperationalEvent' : 'NormalRunning',
      label: residualImpact > 0 ? 'Section Operating Variance' : 'Normal Operations',
      impactMinutes: Math.abs(residualImpact),
      severity: Math.abs(residualImpact) > 5 ? 'High' : 'Low',
      evidence: `ML model predicted section residual of ${residualImpact > 0 ? '+' : ''}${residualImpact.toFixed(1)} minutes`,
    });
  }

  // 6. Recovery (if predicted delay is less than accumulated delay entering)
  if (predictedDelayMinutes < baseDelay - 0.5) {
    recoveryMinutes = Math.round((baseDelay - predictedDelayMinutes) * 10) / 10;
    reasons.push({
      type: 'Recovery',
      label: 'Time Recovery / Makeup',
      impactMinutes: -recoveryMinutes,
      severity: 'Low',
      evidence: `Train recovered ${recoveryMinutes.toFixed(1)} minutes compared to entering delay`,
    });
  }

  // Fallback if no reasons
  if (reasons.length === 0) {
    reasons.push({
      type: 'NormalRunning',
      label: 'On Schedule / Normal Running',
      impactMinutes: 0,
      severity: 'Normal',
      evidence: 'Operating according to scheduled travel time and typical speed profile',
    });
  }

  const prevEtaTime = previousEta ? new Date(previousEta).getTime() : null;
  const newEtaTime = newEta ? new Date(newEta).getTime() : null;
  let totalChangeMinutes = 0;
  if (prevEtaTime && newEtaTime) {
    totalChangeMinutes = Math.round(((newEtaTime - prevEtaTime) / 60000) * 10) / 10;
  } else {
    totalChangeMinutes = Math.round((predictedDelayMinutes - baseDelay) * 10) / 10;
  }

  return {
    totalImpactMinutes: Math.round(predictedDelayMinutes * 10) / 10,
    totalChangeMinutes,
    previousEta,
    newEta,
    reasons,
    recoveryMinutes,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  generateEtaExplanation,
};
