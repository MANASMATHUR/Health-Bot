/**
 * Statsig integration for A/B test group assignment and event logging.
 *
 * Statsig SDK is used server-side. If STATSIG_SERVER_SECRET is not set,
 * we fall back to a deterministic hash-based assignment so development
 * works without credentials.
 *
 * Experiment name: "onboarding_flow_v1"
 * Groups: control (generic welcome), test (3-step onboarding)
 */

const axios = require('axios');
require('dotenv').config();

const STATSIG_SECRET = process.env.STATSIG_SERVER_SECRET;
const EXPERIMENT_NAME = 'onboarding_flow_v1';

/**
 * Assign a user to a test group.
 * Returns 'control' or 'test'.
 */
async function assignGroup(telegramId) {
  if (!STATSIG_SECRET) {
    // Fallback: deterministic 50/50 split by telegram_id parity
    console.warn('[Statsig] No secret key — using deterministic fallback');
    return telegramId % 2 === 0 ? 'control' : 'test';
  }

  try {
    const res = await axios.post(
      'https://statsigapi.net/v1/get_config',
      {
        user: { userID: String(telegramId) },
        configName: EXPERIMENT_NAME,
      },
      {
        headers: {
          'STATSIG-API-KEY': STATSIG_SECRET,
          'Content-Type': 'application/json',
        },
        timeout: 3000,
      }
    );

    const group = res.data?.value?.group || res.data?.group;
    if (group === 'test' || group === 'control') return group;

    // Statsig returns the experiment variant in data.value
    // Default to control if not explicitly set to 'test'
    return 'control';
  } catch (err) {
    console.error('[Statsig] assignGroup error:', err.message);
    // Fallback on network error
    return telegramId % 2 === 0 ? 'control' : 'test';
  }
}

/**
 * Log an event to Statsig for downstream analysis.
 */
async function logEvent(telegramId, eventName, value = null, metadata = {}) {
  if (!STATSIG_SECRET) {
    console.log(`[Statsig Fallback] Event: ${eventName} | user: ${telegramId} | value: ${value}`);
    return;
  }

  try {
    await axios.post(
      'https://statsigapi.net/v1/log_event',
      {
        events: [
          {
            eventName,
            user: { userID: String(telegramId) },
            value: value !== null ? String(value) : undefined,
            metadata: { ...metadata, source: 'telegram_bot' },
            time: Date.now(),
          },
        ],
      },
      {
        headers: {
          'STATSIG-API-KEY': STATSIG_SECRET,
          'Content-Type': 'application/json',
        },
        timeout: 3000,
      }
    );
  } catch (err) {
    console.error('[Statsig] logEvent error:', err.message);
    // Non-fatal — don't throw
  }
}

module.exports = { assignGroup, logEvent, EXPERIMENT_NAME };
