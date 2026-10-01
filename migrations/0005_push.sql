-- Push notification subscriptions (Web Push / Apple declarative push).
-- One row per device subscription; endpoint is unique so re-subscribing replaces.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint         TEXT NOT NULL UNIQUE,
  p256dh           TEXT NOT NULL,
  auth             TEXT NOT NULL,
  lang             TEXT NOT NULL DEFAULT 'en',
  user_agent       TEXT,
  expiration_time  REAL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_push_sub_user ON push_subscriptions(user_id);
