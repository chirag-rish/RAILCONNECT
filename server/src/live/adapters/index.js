/**
 * SIH26028 — Phase 5A: Adapter Registry
 *
 * Central registry for all data-source adapters.
 * Creates and exports configured adapter instances.
 */

const SimulatorAdapter = require('./simulatorAdapter');
const RTISAdapter = require('./rtisAdapter');
const NTESAdapter = require('./ntesAdapter');
const LiveProviderAdapter = require('./liveProviderAdapter');

/**
 * Build the adapter set from environment configuration.
 * @param {Object} env - process.env (or injected config for testing)
 * @returns {Object} Map of source key → adapter instance
 */
function createAdapters(env = process.env) {
  const simulator = new SimulatorAdapter({ enabled: true });

  const rtis = new RTISAdapter({
    enabled: env.RTIS_ENABLED === 'true',
    apiEndpoint: env.RTIS_API_ENDPOINT || null,
    apiKey: env.RTIS_API_KEY || null,
    organizationId: env.RTIS_ORG_ID || null,
  });

  const ntes = new NTESAdapter({
    enabled: env.NTES_ENABLED === 'true',
    apiEndpoint: env.NTES_API_ENDPOINT || null,
    apiKey: env.NTES_API_KEY || null,
  });

  const liveProvider = new LiveProviderAdapter({
    enabled: env.LIVE_PROVIDER_ENABLED === 'true',
    providerName: env.LIVE_PROVIDER_NAME || 'unknown',
    apiEndpoint: env.LIVE_PROVIDER_API_ENDPOINT || null,
    apiKey: env.LIVE_PROVIDER_API_KEY || null,
  });

  return { simulator, rtis, ntes, liveProvider };
}

module.exports = {
  SimulatorAdapter,
  RTISAdapter,
  NTESAdapter,
  LiveProviderAdapter,
  createAdapters,
};
