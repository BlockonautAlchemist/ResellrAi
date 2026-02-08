-- Usage events table for tracking free-tier usage limits
-- Run this migration in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_key TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'generate',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_lookup
  ON usage_events(user_key, action, created_at);
