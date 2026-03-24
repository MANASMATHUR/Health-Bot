/**
 * CalorAI Telegram Bot
 *
 * Handles two concerns:
 *   1. A/B Test onboarding: new users are assigned to
 *      control (simple welcome) or test (3-step guided onboarding).
 *   2. Health chatbot: /log, /meals, /edit, /delete, /day
 *
 * Run standalone: `node src/bot.js`
 * Or integrated with Express via src/index.js (webhook mode).
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const supabase    = require('./supabase');
const { assignGroup } = require('./statsig');
const { logEvent }    = require('./eventLogger');

const TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();

if (!TOKEN) {
  console.warn(
    '[CalorAI] TELEGRAM_BOT_TOKEN is empty — REST API and dashboard still run. Paste your @BotFather token into backend/.env and restart to enable Telegram.'
  );
  module.exports = { processUpdate() {} };
  return;
}

// Polling only when this process receives Telegram traffic directly.
// If TELEGRAM_RECEIVER=n8n, Telegram → n8n → /api/telegram/handle-update (no polling).
const usePolling =
  process.env.NODE_ENV !== 'production' && process.env.TELEGRAM_RECEIVER !== 'n8n';

const bot = new TelegramBot(TOKEN, {
  polling: usePolling,
});

/* ─── Helpers ─── */

async function getOrCreateUser(msg) {
  const { id: telegram_id, username, first_name } = msg.from;

  // Try to fetch existing user
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegram_id)
    .single();

  if (existing) return existing;

  // New user — assign A/B group
  const ab_group = await assignGroup(telegram_id);

  const { data: newUser, error } = await supabase
    .from('users')
    .insert({ telegram_id, username, first_name, ab_group })
    .select()
    .single();

  if (error) throw new Error('Failed to create user: ' + error.message);

  // Log assignment event
  await logEvent({
    telegramId: telegram_id,
    eventName: 'ab_assigned',
    abGroup: ab_group,
    properties: { username, first_name },
  });

  return newUser;
}

function escapeMarkdown(text) {
  return String(text || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

/* ─── /start — onboarding entry ─── */

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const user = await getOrCreateUser(msg);
    const name = escapeMarkdown(user.first_name || user.username || 'there');

    if (user.ab_group === 'control') {
      // Control: simple welcome
      await bot.sendMessage(
        chatId,
        `👋 *Welcome to CalorAI, ${name}\\!*\n\nI help you track meals and stay healthy\\.\n\nQuick commands:\n• /log — log a meal\n• /meals — view today's meals\n• /day — daily summary\n• /help — all commands`,
        { parse_mode: 'MarkdownV2' }
      );
      await logEvent({
        telegramId: user.telegram_id,
        eventName: 'welcome_shown',
        abGroup: 'control',
      });
    } else {
      // Test: 3-step onboarding
      await startOnboarding(chatId, user);
    }
  } catch (err) {
    console.error('/start error:', err);
    bot.sendMessage(chatId, '⚠️ Something went wrong. Please try /start again.');
  }
});

/* ─── 3-step onboarding (test group) ─── */

async function startOnboarding(chatId, user) {
  // Step 1 — Goals
  await bot.sendMessage(
    chatId,
    `🎉 *Welcome to CalorAI, ${escapeMarkdown(user.first_name || 'friend')}\\!*\n\n` +
    `I'm your personal health companion\\.\n\n` +
    `*Step 1 of 3 — What's your main goal?*\n\n` +
    `Reply with the number that fits best:`,
    {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        keyboard: [['1️⃣ Lose weight', '2️⃣ Maintain weight'], ['3️⃣ Build muscle', '4️⃣ Just track meals']],
        one_time_keyboard: true,
        resize_keyboard: true,
      },
    }
  );

  await supabase
    .from('users')
    .update({ onboarding_step: 1 })
    .eq('telegram_id', user.telegram_id);

  await logEvent({
    telegramId: user.telegram_id,
    eventName: 'onboarding_step_1_shown',
    abGroup: 'test',
  });
}

async function onboardingStep2(chatId, telegramId, goalText) {
  await supabase
    .from('users')
    .update({ onboarding_step: 2 })
    .eq('telegram_id', telegramId);

  await logEvent({
    telegramId,
    eventName: 'onboarding_step_1_complete',
    abGroup: 'test',
    properties: { goal: goalText },
  });

  await bot.sendMessage(
    chatId,
    `✅ Got it\\!\n\n*Step 2 of 3 — How many meals do you usually eat per day?*`,
    {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        keyboard: [['🍽️ 2 meals', '🍽️🍽️ 3 meals'], ['🍽️🍽️🍽️ 4+ meals', '🤷 It varies']],
        one_time_keyboard: true,
        resize_keyboard: true,
      },
    }
  );
}

async function onboardingStep3(chatId, telegramId, mealsText) {
  await supabase
    .from('users')
    .update({ onboarding_step: 3 })
    .eq('telegram_id', telegramId);

  await logEvent({
    telegramId,
    eventName: 'onboarding_step_2_complete',
    abGroup: 'test',
    properties: { meals_per_day: mealsText },
  });

  await bot.sendMessage(
    chatId,
    `👍 Perfect\\!\n\n*Step 3 of 3 — Would you like a daily reminder to log your meals?*`,
    {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        keyboard: [['✅ Yes, remind me at 8pm', '❌ No thanks']],
        one_time_keyboard: true,
        resize_keyboard: true,
      },
    }
  );
}

async function completeOnboarding(chatId, telegramId, reminderChoice) {
  await supabase
    .from('users')
    .update({ onboarding_step: 4, onboarding_done: true })
    .eq('telegram_id', telegramId);

  await logEvent({
    telegramId,
    eventName: 'onboarding_complete',
    abGroup: 'test',
    properties: { reminder_opt_in: reminderChoice.includes('Yes') },
    value: 1,
  });

  await bot.sendMessage(
    chatId,
    `🎊 *You're all set\\!*\n\nHere's how to use CalorAI:\n\n` +
    `• /log — log a meal \\(e\\.g\\. /log Chicken salad 450\\)\n` +
    `• /meals — view today's meals\n` +
    `• /edit \\<id\\> \\<name\\> — edit a meal\n` +
    `• /delete \\<id\\> — delete a meal\n` +
    `• /day — full daily summary\n\n` +
    `Let's start tracking\\! 💪`,
    { parse_mode: 'MarkdownV2', reply_markup: { remove_keyboard: true } }
  );
}

/* ─── Onboarding message router ─── */

bot.on('message', async (msg) => {
  if (msg.text && msg.text.startsWith('/')) return; // handled by command handlers

  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (!user) return;

  // Route mid-onboarding messages
  if (user.ab_group === 'test' && !user.onboarding_done) {
    if (user.onboarding_step === 1) {
      return onboardingStep2(chatId, telegramId, msg.text);
    }
    if (user.onboarding_step === 2) {
      return onboardingStep3(chatId, telegramId, msg.text);
    }
    if (user.onboarding_step === 3) {
      return completeOnboarding(chatId, telegramId, msg.text);
    }
  }

  // Fall-through: unknown command hint
  bot.sendMessage(chatId, "I didn't understand that. Try /help for a list of commands.");
});

/* ─── /help ─── */

bot.onText(/\/help/, async (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `*CalorAI Commands*\n\n` +
    `/log <name> [calories] — log a meal\n` +
    `/meals — today's meal log\n` +
    `/edit <id> <new name> [calories] — edit a meal\n` +
    `/delete <id> — delete a meal\n` +
    `/day — daily summary\n` +
    `/help — show this message`,
    { parse_mode: 'Markdown' }
  );
});

/* ─── /log <name> [calories] ─── */

bot.onText(/\/log (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const raw = match[1].trim();

  // Parse: last token is calories if it's a number
  const parts = raw.split(/\s+/);
  let calories = null;
  let name = raw;

  if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
    calories = parseInt(parts.pop(), 10);
    name = parts.join(' ');
  }

  try {
    // Ensure user exists (for users who skip /start)
    await getOrCreateUser(msg);

    const { data: meal, error } = await supabase
      .from('meals')
      .insert({ telegram_id: telegramId, name, calories })
      .select()
      .single();

    if (error) throw error;

    const { data: user } = await supabase
      .from('users')
      .select('ab_group')
      .eq('telegram_id', telegramId)
      .single();

    await logEvent({
      telegramId,
      eventName: 'meal_logged',
      abGroup: user?.ab_group,
      properties: { meal_id: meal.id, name, calories },
      value: calories,
    });

    const calStr = calories ? ` \\(${calories} kcal\\)` : '';
    bot.sendMessage(
      chatId,
      `✅ Logged: *${escapeMarkdown(name)}*${calStr}\nMeal ID: \`${meal.id}\``,
      { parse_mode: 'MarkdownV2' }
    );
  } catch (err) {
    console.error('/log error:', err);
    bot.sendMessage(chatId, '❌ Failed to log meal. Try: /log Chicken salad 450');
  }
});

/* ─── /meals — today's meals ─── */

bot.onText(/\/meals/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: meals, error } = await supabase
    .from('meals')
    .select('*')
    .eq('telegram_id', telegramId)
    .gte('logged_at', today.toISOString())
    .order('logged_at', { ascending: true });

  if (error || !meals?.length) {
    return bot.sendMessage(chatId, "No meals logged today\\. Use /log to add one\\!", { parse_mode: 'MarkdownV2' });
  }

  const totalCal = meals.reduce((s, m) => s + (m.calories || 0), 0);
  const lines = meals.map((m, i) => {
    const t = new Date(m.logged_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const cal = m.calories ? ` — ${m.calories} kcal` : '';
    return `${i + 1}\\. *${escapeMarkdown(m.name)}*${escapeMarkdown(cal)} \\[id: ${m.id}\\] _${t}_`;
  });

  const summary = totalCal > 0 ? `\n\n*Total: ${totalCal} kcal*` : '';
  bot.sendMessage(chatId, `🍽️ *Today's meals:*\n\n${lines.join('\n')}${summary}`, { parse_mode: 'MarkdownV2' });
});

/* ─── /edit <id> <new name> [calories] ─── */

bot.onText(/\/edit (\d+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const mealId = parseInt(match[1], 10);
  const raw = match[2].trim();

  const parts = raw.split(/\s+/);
  let calories = null;
  let name = raw;

  if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
    calories = parseInt(parts.pop(), 10);
    name = parts.join(' ');
  }

  const updateData = { name };
  if (calories !== null) updateData.calories = calories;

  const { data: meal, error } = await supabase
    .from('meals')
    .update(updateData)
    .eq('id', mealId)
    .eq('telegram_id', telegramId) // ownership check
    .select()
    .single();

  if (error || !meal) {
    return bot.sendMessage(chatId, `❌ Meal ${mealId} not found or you don't own it.`);
  }

  const { data: user } = await supabase.from('users').select('ab_group').eq('telegram_id', telegramId).single();
  await logEvent({ telegramId, eventName: 'meal_edited', abGroup: user?.ab_group, properties: { meal_id: mealId } });

  bot.sendMessage(chatId, `✏️ Updated meal ${mealId}: *${escapeMarkdown(name)}*`, { parse_mode: 'MarkdownV2' });
});

/* ─── /delete <id> ─── */

bot.onText(/\/delete (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const mealId = parseInt(match[1], 10);

  const { data: meal } = await supabase
    .from('meals')
    .select('name')
    .eq('id', mealId)
    .eq('telegram_id', telegramId)
    .single();

  if (!meal) {
    return bot.sendMessage(chatId, `❌ Meal ${mealId} not found.`);
  }

  await supabase.from('meals').delete().eq('id', mealId);

  const { data: user } = await supabase.from('users').select('ab_group').eq('telegram_id', telegramId).single();
  await logEvent({ telegramId, eventName: 'meal_deleted', abGroup: user?.ab_group, properties: { meal_id: mealId } });

  bot.sendMessage(chatId, `🗑️ Deleted: *${escapeMarkdown(meal.name)}*`, { parse_mode: 'MarkdownV2' });
});

/* ─── /day — daily summary ─── */

bot.onText(/\/day/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: meals } = await supabase
    .from('meals')
    .select('*')
    .eq('telegram_id', telegramId)
    .gte('logged_at', today.toISOString())
    .order('logged_at', { ascending: true });

  const count = meals?.length || 0;
  const totalCal = (meals || []).reduce((s, m) => s + (m.calories || 0), 0);
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const { data: user } = await supabase.from('users').select('ab_group').eq('telegram_id', telegramId).single();
  await logEvent({ telegramId, eventName: 'day_summary_viewed', abGroup: user?.ab_group, properties: { meal_count: count } });

  const emoji = count === 0 ? '😴' : count < 3 ? '🌱' : '💪';
  bot.sendMessage(
    chatId,
    `${emoji} *Daily Summary — ${escapeMarkdown(dateStr)}*\n\n` +
    `Meals logged: *${count}*\n` +
    `Total calories: *${totalCal > 0 ? totalCal + ' kcal' : 'not tracked'}*\n\n` +
    (count === 0 ? "No meals yet\\! Start with /log" : "Keep it up\\! 🙌"),
    { parse_mode: 'MarkdownV2' }
  );
});

/* ─── Polling error handler ─── */

bot.on('polling_error', (err) => console.error('[Bot polling error]', err.message));

module.exports = bot;
console.log(
  usePolling
    ? '🤖 CalorAI bot started (Telegram polling — direct mode)'
    : '🤖 CalorAI bot ready (n8n mode — updates via POST /api/telegram/handle-update)'
);
