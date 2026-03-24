# A/B Test Evaluation Plan — Onboarding

## Hypothesis

Introducing a structured 3-step onboarding flow for new Telegram bot users will
increase 7-day retention (return rate) compared to a generic welcome message.

---

## Experiment Design

| Parameter    | Value                              |
|--------------|------------------------------------|
| Tool         | Statsig (server-side experiment)   |
| Name         | `onboarding_flow_v1`               |
| Groups       | Control (50%) / Test (50%)         |
| Unit         | Telegram user ID                   |
| Assignment   | On first `/start` command          |
| Duration     | Minimum 2 weeks (target n=200/group)|

### Control Group
Receives a simple, one-shot welcome message listing available commands.

### Test Group
Goes through a guided 3-step flow:
1. **Goal selection** — what do you want to achieve?
2. **Meal frequency** — how many meals do you eat per day?
3. **Reminder opt-in** — would you like a daily reminder?

---

## Metrics

### Primary Metric (leading indicator)
**Onboarding completion rate** — percentage of Test users who complete all 3
steps. Research shows that users who complete onboarding have 3–5× higher
7-day retention (Amplitude, 2023 Benchmarks). This is a **leading indicator**
we can measure within minutes of a user joining.

- **Formula**: `completed_onboarding / assigned_to_test × 100`
- **Target**: ≥ 60% completion rate
- **Minimum detectable effect**: 10 percentage points

### Secondary Metrics
| Metric | Definition | Target |
|--------|------------|--------|
| Day-7 return rate | % of users who use the bot on day 7 | Test ≥ Control + 10% |
| Meals logged (day 1) | Meals logged within first 24h | Test ≥ Control |
| Day-1 activation | % who log at least 1 meal | Test ≥ Control + 15% |
| Bot block rate | % of users who block the bot | Test ≤ Control |

### Guardrail Metrics (must NOT degrade)
| Guardrail | Limit | Action if breached |
|-----------|-------|--------------------|
| Bot block rate | < 5% in either group | Pause test, investigate |
| Error rate | < 1% of messages | Pause test, fix bugs |
| Onboarding abandonment | < 70% drop at step 1 | Simplify step 1 |

---

## Statistical Framework

- **Test**: Two-proportion z-test (primary), Mann–Whitney U for continuous metrics
- **Significance threshold**: p < 0.05 (two-tailed)
- **Power**: 80% (standard)
- **Sample size** (per group, for primary metric):
  - Baseline completion: 30% (control — they see no onboarding, so ~30% engage)
  - Target completion: 60% (test)
  - Required n ≈ 52 per group (calculated at α=0.05, power=0.80)
- **Minimum run time**: 2 weeks (to capture weekly usage patterns)

---

## Decision Framework

### Ship (roll out to 100% of users)
- Onboarding completion ≥ 60% **AND**
- Day-7 return rate significantly higher in Test (p < 0.05) **AND**
- No guardrail metrics breached

### Iterate (don't ship, but revise)
- Completion rate 40–60% **AND**
- Block rate not significantly higher in Test
→ Simplify onboarding: reduce to 2 steps, or make them optional

### Kill (revert to control)
- Block rate significantly higher in Test (p < 0.05) **OR**
- Day-7 return rate significantly lower in Test **OR**
- Completion rate < 40%

### No decision (extend run)
- Neither group shows statistical significance after 2 weeks
- Insufficient sample size (< 50/group)
→ Extend experiment or acquire more users

---

## Event Logging Schema

All events are logged to Supabase `events` table and mirrored to Statsig.

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `ab_assigned` | First `/start` | `ab_group`, `username` |
| `welcome_shown` | Control welcome sent | — |
| `onboarding_step_1_shown` | Step 1 question sent | — |
| `onboarding_step_1_complete` | User replies to step 1 | `goal` |
| `onboarding_step_2_complete` | User replies to step 2 | `meals_per_day` |
| `onboarding_complete` | Step 3 answered | `reminder_opt_in` |
| `meal_logged` | Any meal logged | `source`, `calories` |
| `day_summary_viewed` | `/day` command | `meal_count` |
| `push_notification_sent` | Cron reminder | `meals_today` |

---

## Analysis Queries (Supabase SQL)

```sql
-- Primary metric: onboarding completion rate
SELECT
  ab_group,
  COUNT(DISTINCT telegram_id) AS users,
  COUNT(DISTINCT CASE WHEN event_name = 'onboarding_complete' THEN telegram_id END) AS completed,
  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN event_name = 'onboarding_complete' THEN telegram_id END)
    / NULLIF(COUNT(DISTINCT telegram_id), 0), 1
  ) AS completion_pct
FROM events
GROUP BY ab_group;

-- Day-7 return rate
SELECT
  u.ab_group,
  COUNT(DISTINCT u.telegram_id) AS total_users,
  COUNT(DISTINCT CASE
    WHEN DATE(e.created_at) = DATE(u.created_at + INTERVAL '7 days')
    THEN e.telegram_id END) AS returned_day7,
  ROUND(
    100.0 * COUNT(DISTINCT CASE
      WHEN DATE(e.created_at) = DATE(u.created_at + INTERVAL '7 days')
      THEN e.telegram_id END)
    / NULLIF(COUNT(DISTINCT u.telegram_id), 0), 1
  ) AS day7_return_pct
FROM users u
LEFT JOIN events e ON u.telegram_id = e.telegram_id
GROUP BY u.ab_group;

-- Onboarding funnel (test group only)
SELECT event_name, COUNT(DISTINCT telegram_id) AS unique_users
FROM events
WHERE ab_group = 'test'
  AND event_name IN (
    'onboarding_step_1_shown',
    'onboarding_step_1_complete',
    'onboarding_step_2_complete',
    'onboarding_complete'
  )
GROUP BY event_name
ORDER BY MIN(created_at);
```

---

## Timeline

| Week | Milestone |
|------|-----------|
| 1    | Launch experiment, monitor guardrails daily |
| 2    | Check sample size, verify event data quality |
| 3    | Run statistical tests, prepare decision memo |
| 3+   | Ship / Iterate / Kill per decision framework |
