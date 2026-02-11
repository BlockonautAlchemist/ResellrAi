-- Premium users table (source of truth for publish permissions)

CREATE TABLE IF NOT EXISTS premium_users (
  user_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_premium_users_status
  ON premium_users(status);

CREATE INDEX IF NOT EXISTS idx_premium_users_expires_at
  ON premium_users(expires_at);
