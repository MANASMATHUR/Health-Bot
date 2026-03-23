/**
 * CalorAI Express server
 *
 * Exposes REST API used by the Expo mobile app and analytics dashboard.
 * Also schedules daily push notifications via Expo Push API.
 *
 * Endpoints:
 *   GET  /api/meals/:telegramId          — list meals (optional ?date=YYYY-MM-DD)
 *   POST /api/meals                      — create meal
 *   PUT  /api/meals/:id                  — update meal
 *   DELETE /api/meals/:id                — delete meal
 *   GET  /api/analytics/dashboard        — dashboard stats
 *   POST /api/users/expo-token           — register Expo push token
 *   POST /webhook/telegram               — Telegram webhook (production)
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const cron    = require('node-cron');
const axios   = require('axios');
const supabase = require('./supabase');
const { logEvent } = require('./eventLogger');
const bot     = require('./bot');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

/* ═══════════════════════════════════════════════
   Meals API
═══════════════════════════════════════════════ */

// GET /api/meals/:telegramId
app.get('/api/meals/:telegramId', async (req, res) => {
  const { telegramId } = req.params;
  const { date } = req.query; // optional YYYY-MM-DD filter

  let query = supabase
    .from('meals')
    .select('*')
    .eq('telegram_id', telegramId)
    .order('logged_at', { ascending: false });

  if (date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    query = query.gte('logged_at', start.toISOString()).lte('logged_at', end.toISOString());
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/meals
app.post('/api/meals', async (req, res) => {
  const { telegram_id, name, calories, notes } = req.body;
  if (!telegram_id || !name) return res.status(400).json({ error: 'telegram_id and name required' });

  const { data, error } = await supabase
    .from('meals')
    .insert({ telegram_id, name, calories: calories || null, notes: notes || null })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const { data: user } = await supabase.from('users').select('ab_group').eq('telegram_id', telegram_id).single();
  await logEvent({ telegramId: telegram_id, eventName: 'meal_logged', abGroup: user?.ab_group, properties: { source: 'app' }, value: calories });

  res.status(201).json(data);
});

// PUT /api/meals/:id
app.put('/api/meals/:id', async (req, res) => {
  const { id } = req.params;
  const { name, calories, notes, telegram_id } = req.body;

  const update = {};
  if (name !== undefined)     update.name = name;
  if (calories !== undefined) update.calories = calories;
  if (notes !== undefined)    update.notes = notes;

  let query = supabase.from('meals').update(update).eq('id', id);
  if (telegram_id) query = query.eq('telegram_id', telegram_id);

  const { data, error } = await query.select().single();
  if (error || !data) return res.status(404).json({ error: 'Meal not found' });

  res.json(data);
});

// DELETE /api/meals/:id
app.delete('/api/meals/:id', async (req, res) => {
  const { id } = req.params;
  const { telegram_id } = req.query;

  let query = supabase.from('meals').delete().eq('id', id);
  if (telegram_id) query = query.eq('telegram_id', telegram_id);

  const { error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ success: true });
});

/* ═══════════════════════════════════════════════
   Analytics API (Bonus Task 3)
═══════════════════════════════════════════════ */

// GET /api/analytics/dashboard
app.get('/api/analytics/dashboard', async (req, res) => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const [mealsRes, usersRes, onboardingRes, eventsRes] = await Promise.all([
    // Daily meal counts last 7 days
    supabase
      .from('meals')
      .select('logged_at')
      .gte('logged_at', sevenDaysAgo.toISOString()),

    // A/B group distribution
    supabase
      .from('users')
      .select('ab_group'),

    // Onboarding funnel (test group)
    supabase
      .from('events')
      .select('event_name, telegram_id')
      .in('event_name', [
        'onboarding_step_1_shown',
        'onboarding_step_1_complete',
        'onboarding_step_2_complete',
        'onboarding_complete',
      ])
      .eq('ab_group', 'test'),

    // Recent events
    supabase
      .from('events')
      .select('event_name, ab_group, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  // Build daily meals map
  const dailyMap = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dailyMap[d.toISOString().split('T')[0]] = 0;
  }
  (mealsRes.data || []).forEach((m) => {
    const day = m.logged_at.split('T')[0];
    if (day in dailyMap) dailyMap[day]++;
  });
  const dailyMeals = Object.entries(dailyMap).map(([date, count]) => ({ date, count }));

  // A/B distribution
  const abDist = { control: 0, test: 0 };
  (usersRes.data || []).forEach((u) => {
    if (u.ab_group in abDist) abDist[u.ab_group]++;
  });

  // Onboarding funnel (unique users per step)
  const funnelSteps = [
    'onboarding_step_1_shown',
    'onboarding_step_1_complete',
    'onboarding_step_2_complete',
    'onboarding_complete',
  ];
  const funnelCounts = {};
  funnelSteps.forEach((s) => (funnelCounts[s] = new Set()));
  (onboardingRes.data || []).forEach((e) => funnelCounts[e.event_name]?.add(e.telegram_id));
  const funnel = funnelSteps.map((step) => ({
    step: step.replace('onboarding_', '').replace(/_/g, ' '),
    count: funnelCounts[step].size,
  }));

  res.json({ dailyMeals, abDistribution: abDist, onboardingFunnel: funnel });
});

/* ═══════════════════════════════════════════════
   Users API (called by n8n workflow)
═══════════════════════════════════════════════ */

// POST /api/users/check — get or create user, return with ab_group
// Called by n8n on every /start before hitting Statsig
app.post('/api/users/check', async (req, res) => {
  const { telegram_id, username, first_name } = req.body;
  if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });

  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegram_id)
    .single();

  if (existing) return res.json(existing);

  // New user — insert without ab_group yet (n8n will call Statsig next and update it)
  const { data: newUser, error } = await supabase
    .from('users')
    .insert({ telegram_id, username: username || null, first_name: first_name || null, ab_group: 'control' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(newUser);
});

// POST /api/users/onboarding-step — update onboarding progress, called by n8n
app.post('/api/users/onboarding-step', async (req, res) => {
  const { telegram_id, step, ab_group } = req.body;
  if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });

  const update = { onboarding_step: parseInt(step, 10) };
  if (ab_group) update.ab_group = ab_group;
  if (parseInt(step, 10) >= 4) update.onboarding_done = true;

  const { data, error } = await supabase
    .from('users')
    .update(update)
    .eq('telegram_id', telegram_id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/events — log event from n8n
app.post('/api/events', async (req, res) => {
  const { telegram_id, event_name, ab_group, properties } = req.body;
  if (!event_name) return res.status(400).json({ error: 'event_name required' });

  await logEvent({
    telegramId: telegram_id,
    eventName: event_name,
    abGroup: ab_group,
    properties: properties || {},
  });

  res.json({ success: true });
});

/* ═══════════════════════════════════════════════
   Expo Push Token Registration (Bonus Task 2)
═══════════════════════════════════════════════ */

app.post('/api/users/expo-token', async (req, res) => {
  const { telegram_id, expo_token } = req.body;
  if (!telegram_id || !expo_token) return res.status(400).json({ error: 'telegram_id and expo_token required' });

  // Store token in users table (add expo_token column via migration if needed)
  const { error } = await supabase
    .from('users')
    .upsert({ telegram_id, expo_token }, { onConflict: 'telegram_id' });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

/* ═══════════════════════════════════════════════
   Telegram Webhook (production mode)
═══════════════════════════════════════════════ */

if (process.env.NODE_ENV === 'production') {
  app.post('/webhook/telegram', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });
}

/* ═══════════════════════════════════════════════
   Daily Push Notifications Cron (Bonus Task 2)
   Runs at 8pm every day
═══════════════════════════════════════════════ */

async function sendPushNotification(expoPushToken, title, body) {
  try {
    await axios.post('https://exp.host/--/api/v2/push/send', {
      to: expoPushToken,
      sound: 'default',
      title,
      body,
    });
  } catch (err) {
    console.error('[Push] Failed to send to', expoPushToken, err.message);
  }
}

// ── Cron 1: Daily meal reminder at 8pm ──────────────────────────────────────
cron.schedule('0 20 * * *', async () => {
  console.log('[Cron] Sending daily meal reminders...');

  const { data: users } = await supabase
    .from('users')
    .select('telegram_id, expo_token, first_name')
    .not('expo_token', 'is', null);

  if (!users?.length) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const user of users) {
    const { count } = await supabase
      .from('meals')
      .select('*', { count: 'exact', head: true })
      .eq('telegram_id', user.telegram_id)
      .gte('logged_at', today.toISOString());

    const name = user.first_name || 'there';
    const mealCount = count || 0;

    if (mealCount === 0) {
      await sendPushNotification(
        user.expo_token,
        "🍽️ Don't forget to log!",
        `Hey ${name}, you haven't logged any meals today. Stay on track!`
      );
    } else {
      await sendPushNotification(
        user.expo_token,
        `🌟 Keep it up, ${name}!`,
        `You've logged ${mealCount} meal${mealCount > 1 ? 's' : ''} today. Log your evening meal?`
      );
    }

    await logEvent({
      telegramId: user.telegram_id,
      eventName: 'push_notification_sent',
      properties: { type: 'daily_reminder', meals_today: mealCount },
    });
  }
});

// ── Cron 2: Daily summary notification at 9pm ────────────────────────────────
// Bonus Task 2: "A simple daily summary notification showing total meals logged"
cron.schedule('0 21 * * *', async () => {
  console.log('[Cron] Sending daily summary notifications...');

  const { data: users } = await supabase
    .from('users')
    .select('telegram_id, expo_token, first_name')
    .not('expo_token', 'is', null);

  if (!users?.length) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const user of users) {
    // Fetch full meals for calorie total
    const { data: meals } = await supabase
      .from('meals')
      .select('calories')
      .eq('telegram_id', user.telegram_id)
      .gte('logged_at', today.toISOString());

    const mealCount  = meals?.length || 0;
    const totalCal   = (meals || []).reduce((s, m) => s + (m.calories || 0), 0);
    const calStr     = totalCal > 0 ? ` · ${totalCal} kcal` : '';
    const name       = user.first_name || 'there';

    const title = mealCount === 0
      ? '📋 No meals logged today'
      : `📋 Today's summary — ${mealCount} meal${mealCount > 1 ? 's' : ''}`;

    const body = mealCount === 0
      ? `${name}, don't forget to log your meals tomorrow!`
      : `${mealCount} meal${mealCount > 1 ? 's' : ''} logged${calStr}. Great work, ${name}!`;

    await sendPushNotification(user.expo_token, title, body);

    await logEvent({
      telegramId: user.telegram_id,
      eventName: 'push_notification_sent',
      properties: { type: 'daily_summary', meals_today: mealCount, total_calories: totalCal },
    });
  }
});

/* ─── Start ─── */

app.listen(PORT, () => {
  console.log(`🚀 CalorAI API running on port ${PORT}`);
});
