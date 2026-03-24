
-- Users table (Telegram users)
CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL PRIMARY KEY,
  telegram_id     BIGINT UNIQUE NOT NULL,
  username        TEXT,
  first_name      TEXT,
  ab_group        TEXT CHECK (ab_group IN ('control','test')) NOT NULL DEFAULT 'control',
  onboarding_step INTEGER DEFAULT 0,
  onboarding_done BOOLEAN DEFAULT FALSE,
  expo_token      TEXT,                          -- Expo push notification token
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Meals table
CREATE TABLE IF NOT EXISTS meals (
  id           BIGSERIAL PRIMARY KEY,
  telegram_id  BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  calories     INTEGER,
  notes        TEXT,
  logged_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Events table (A/B test analytics)
CREATE TABLE IF NOT EXISTS events (
  id           BIGSERIAL PRIMARY KEY,
  telegram_id  BIGINT,
  event_name   TEXT NOT NULL,          -- e.g. "ab_assigned", "onboarding_step_1", "meal_logged"
  ab_group     TEXT,
  properties   JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meals_telegram_id ON meals(telegram_id);
CREATE INDEX IF NOT EXISTS idx_meals_logged_at ON meals(logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_telegram_id ON events(telegram_id);
CREATE INDEX IF NOT EXISTS idx_events_event_name ON events(event_name);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);

-- Enable Realtime on meals table
ALTER PUBLICATION supabase_realtime ADD TABLE meals;

-- Row Level Security (optional but recommended)
-- Disable for now to keep API simple; enable when adding auth
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE meals DISABLE ROW LEVEL SECURITY;
ALTER TABLE events DISABLE ROW LEVEL SECURITY;

-- Helper function: auto-update updated_at on meals
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER meals_updated_at
  BEFORE UPDATE ON meals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
