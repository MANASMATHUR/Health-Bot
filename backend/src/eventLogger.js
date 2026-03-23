/**
 * Centralized event logging.
 * Every significant user action is written to:
 *   1. Supabase `events` table (for analytics dashboard + SQL queries)
 *   2. Statsig (for experiment analysis)
 */

const supabase = require('./supabase');
const { logEvent: statsigLog } = require('./statsig');

/**
 * Log an event everywhere.
 *
 * @param {object} opts
 * @param {number}  opts.telegramId
 * @param {string}  opts.eventName  - e.g. 'ab_assigned', 'meal_logged', 'onboarding_step_1'
 * @param {string}  [opts.abGroup]  - 'control' | 'test'
 * @param {object}  [opts.properties] - arbitrary key/value metadata
 * @param {any}     [opts.value]    - optional numeric/string value for Statsig
 */
async function logEvent({ telegramId, eventName, abGroup, properties = {}, value = null }) {
  // 1. Supabase
  const { error } = await supabase.from('events').insert({
    telegram_id: telegramId,
    event_name: eventName,
    ab_group: abGroup || null,
    properties,
  });
  if (error) console.error('[EventLog] Supabase error:', error.message);

  // 2. Statsig
  await statsigLog(telegramId, eventName, value, { ab_group: abGroup, ...properties });

  console.log(`[Event] ${eventName} | user=${telegramId} | group=${abGroup || 'n/a'}`);
}

module.exports = { logEvent };
