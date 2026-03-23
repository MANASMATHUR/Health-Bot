# CalorAI — Full-Stack Telegram Health Bot + A/B Test

A production-ready system built for the CalorAI take-home assessment.

## What's built

| Task | Status | Location |
|------|--------|----------|
| Primary: A/B Test chatbot (n8n + Statsig) | ✅ | `backend/`, `n8n/` |
| Secondary: Health chatbot (log/edit/delete meals) | ✅ | `backend/src/bot.js` |
| Bonus 1: Expo mobile app | ✅ | `mobile/CalorAI/` |
| Bonus 2: Realtime sync + push notifications | ✅ | `hooks/useMeals.ts`, `src/index.js` |
| Bonus 3: Analytics dashboard | ✅ | `dashboard/`, mobile analytics tab |

---

## Architecture Overview

```
Telegram User
     │
     ▼
Telegram Bot API
     │ webhook / polling
     ▼
n8n Workflow ──────── Statsig API
     │                (A/B group assignment)
     ▼
Node.js API (Express)
     │
     ├── Supabase (PostgreSQL + Realtime)
     │        │
     │        └── Realtime subscriptions ──► Expo Mobile App
     │
     └── Expo Push Notification API (daily reminders)

Analytics Dashboard (standalone HTML or in-app tab)
     └── reads from Node.js /api/analytics/dashboard
```

### How the A/B test works

1. User sends `/start` to the Telegram bot
2. n8n workflow receives the webhook
3. n8n calls **Statsig** (`get_config`) with the user's Telegram ID
4. Statsig returns the experiment group (`control` or `test`)
5. **Control** → receives a simple one-shot welcome message
6. **Test** → enters a 3-step guided onboarding flow (goal → meal frequency → reminder opt-in)
7. Every step is logged to Supabase `events` table **and** Statsig for downstream analysis

---

## Quick Setup

### Prerequisites
- Node.js 18+
- Supabase project (free tier works)
- Telegram bot token (from @BotFather)
- Statsig server-side secret (from Statsig dashboard → Project Settings)
- n8n instance (self-hosted or cloud)
- Expo Go app on your phone

---

### 1. Supabase — run the schema

1. Open your Supabase project → **SQL Editor**
2. Paste and run `backend/supabase_schema.sql`
3. Go to **Database → Replication** and enable realtime on the `meals` table (or the SQL does it automatically)

---

### 2. Backend

```bash
cd backend
cp .env.example .env
# Fill in TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY, STATSIG_SERVER_SECRET
npm install
npm run dev        # starts bot in polling mode + Express API on port 3001
```

> **Production (webhook mode):** set `NODE_ENV=production` and register your webhook:
> ```
> curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-domain.com/webhook/telegram"
> ```

---

### 3. n8n workflow

1. Open your n8n instance → **Import workflow**
2. Import `n8n/workflow.json`
3. Set environment variables in n8n:
   - `BACKEND_URL` → e.g. `http://localhost:3001`
   - `STATSIG_SERVER_SECRET` → your Statsig secret
   - `TELEGRAM_BOT_TOKEN` → your bot token
4. Add your Telegram Bot credential in n8n
5. Activate the workflow

> **Note:** The backend bot (`src/bot.js`) handles the full health chatbot commands. The n8n workflow handles the `/start` A/B routing and can be extended for additional flows. Both can run simultaneously — set the bot to webhook mode and point it at n8n for `/start`, or use the standalone bot for all commands.

---

### 4. Mobile app (Expo Go)

```bash
cd mobile/CalorAI
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_ANON, and API_BASE (your backend URL)
npm install
npx expo start
```

Scan the QR code with **Expo Go** on your phone.

> **Telegram ID**: The app uses a demo Telegram ID by default (`123456789`). In production, implement a `/link` command in the bot that generates a one-time code the user enters in the app to associate their Telegram account.

---

### 5. Analytics dashboard (standalone)

```bash
# Just open in a browser — no build step needed
open dashboard/index.html
# Or serve it:
npx serve dashboard
```

The dashboard reads from `http://localhost:3001/api/analytics/dashboard`. Update `API_BASE` in the HTML for production.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | From @BotFather on Telegram |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service role key (Settings → API) |
| `STATSIG_SERVER_SECRET` | Statsig server secret (Project Settings) |
| `PORT` | API port (default: 3001) |
| `NODE_ENV` | `development` (polling) or `production` (webhook) |

### Mobile (`mobile/CalorAI/.env`)

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON` | Supabase anon/public key |
| `EXPO_PUBLIC_API_BASE` | Backend URL, e.g. `http://192.168.x.x:3001` |

---

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Triggers A/B onboarding (or welcome) |
| `/log <name> [calories]` | Log a meal, e.g. `/log Chicken salad 450` |
| `/meals` | View today's logged meals |
| `/edit <id> <name> [calories]` | Edit a meal |
| `/delete <id>` | Delete a meal |
| `/day` | Daily summary with total calories |
| `/help` | Show all commands |

---

## Tools & Services Used

| Tool | Why |
|------|-----|
| **Node.js + Express** | Lightweight API; easy to deploy anywhere |
| **node-telegram-bot-api** | Mature Telegram bot library with polling + webhook support |
| **Supabase** | Postgres + built-in realtime subscriptions; eliminates need for a separate websocket server |
| **Statsig** | Purpose-built A/B testing with server-side SDK; handles group assignment, event logging, and stats in one place |
| **n8n** | Visual workflow automation; makes the A/B routing logic inspectable and modifiable without code deploys |
| **Expo + React Native** | Cross-platform mobile app with a single codebase; Expo Go allows instant testing without a build |
| **Expo Push Notifications** | Managed push infra that works for both iOS and Android without separate APNs/FCM setup |
| **Chart.js** | Lightweight, zero-dependency chart library for the web dashboard |

---

## A/B Test Evaluation Plan

See [`EVALUATION_PLAN.md`](./EVALUATION_PLAN.md) for the full framework including:
- Primary metric (leading indicator)
- Guardrail metrics
- Statistical framework
- Decision criteria (ship / iterate / kill)
- SQL analysis queries

---

## Assumptions & Trade-offs

- **Telegram ID as user identity**: No separate auth system. Sufficient for this use case but would need a proper auth layer for a production multi-platform app.
- **SetupScreen for Telegram ID linking**: On first app launch, users enter their numeric Telegram ID (findable via @userinfobot). Stored in AsyncStorage and used for all API calls, giving true bi-directional sync between the app and the bot.
- **Bot runs in polling mode for development**: Simpler setup. Switch to webhook + a tunnel (e.g. ngrok) for testing n8n locally.
- **n8n handles `/start` routing, bot.js handles everything else**: This avoids duplicating logic. In a larger system, all commands would go through n8n or all through the bot.
- **Statsig fallback**: If `STATSIG_SERVER_SECRET` is not set, a deterministic hash-based 50/50 split is used so the app works without credentials.
- **Two push notification crons**: Reminder at 8pm (nudge to log), summary at 9pm (total meals + calories). Separate times meet both Bonus 2 requirements without notification overlap.
- **No meal photo recognition**: Natural v2 feature — send a photo, get calories estimated by a vision model.

---

## Approximate Time Breakdown

| Section | Time |
|---------|------|
| Primary task (n8n + Statsig + event logging + evaluation plan) | ~2.5h |
| Secondary task (health chatbot) | ~1h |
| Bonus 1 (Expo app — meals screen, add, delete, edit) | ~1.5h |
| Bonus 2 (Realtime + push notifications) | ~45min |
| Bonus 3 (Analytics dashboard — web + in-app) | ~1h |
| README + polish | ~30min |
| **Total** | **~7.5h** |
