const { generateEtaExplanation } = require('../live/etaExplanationEngine');

describe('ETA Explanation Engine', () => {
  it('should explain an existing delay', () => {
    const explanation = generateEtaExplanation({
      accumulatedDelay: 10,
      predictedDelayMinutes: 10,
    });
    expect(explanation.reasons.some(r => r.type === 'ExistingDelay')).toBe(true);
    expect(explanation.reasons.find(r => r.type === 'ExistingDelay').impactMinutes).toBe(10);
  });

  it('should explain a speed restriction', () => {
    const explanation = generateEtaExplanation({
      accumulatedDelay: 0,
      predictedDelayMinutes: 2,
      predictedResidualMinutes: 2,
      eventActive: 1,
      eventType: 'SpeedRestriction',
      eventSpeedLimit: 30,
      maxSpeed: 110
    });
    expect(explanation.reasons.some(r => r.type === 'SpeedRestriction')).toBe(true);
  });

  it('should explain congestion', () => {
    const explanation = generateEtaExplanation({
      currentSpeed: 20,
      typicalSpeed: 80,
      predictedDelayMinutes: 5,
    });
    expect(explanation.reasons.some(r => r.type === 'Congestion')).toBe(true);
  });

  it('should explain recovery', () => {
    const explanation = generateEtaExplanation({
      accumulatedDelay: 10,
      predictedDelayMinutes: 5,
    });
    expect(explanation.reasons.some(r => r.type === 'Recovery')).toBe(true);
    expect(explanation.recoveryMinutes).toBe(5);
  });

  it('should show normal running when no delays', () => {
    const explanation = generateEtaExplanation({
      accumulatedDelay: 0,
      predictedDelayMinutes: 0,
    });
    expect(explanation.reasons[0].type).toBe('NormalRunning');
  });

  it('should handle multiple causes', () => {
    const explanation = generateEtaExplanation({
      accumulatedDelay: 10,
      eventActive: 1,
      eventType: 'SignalDelay',
      predictedDelayMinutes: 15,
      predictedResidualMinutes: 5
    });
    expect(explanation.reasons.length).toBeGreaterThan(1);
    expect(explanation.reasons.some(r => r.type === 'ExistingDelay')).toBe(true);
    expect(explanation.reasons.some(r => r.type === 'SignalDelay')).toBe(true);
  });
});
