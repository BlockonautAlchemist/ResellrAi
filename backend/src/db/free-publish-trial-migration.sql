-- One-time free direct publish trial entitlement (granted after eBay connect)

CREATE TABLE IF NOT EXISTS free_publish_trials (
  user_id TEXT PRIMARY KEY,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  grant_source TEXT NOT NULL DEFAULT 'ebay_connect',
  used_at TIMESTAMPTZ NULL,
  used_listing_id TEXT NULL,
  used_publish_result JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_free_publish_trials_granted_at
  ON free_publish_trials(granted_at);

CREATE INDEX IF NOT EXISTS idx_free_publish_trials_used_at
  ON free_publish_trials(used_at);

