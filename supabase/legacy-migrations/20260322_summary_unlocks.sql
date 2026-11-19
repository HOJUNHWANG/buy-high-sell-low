-- Summary unlock gating: individual article unlocks + user tier
-- Run in Supabase SQL Editor

-- Individual article unlock records (permanent per user+article)
CREATE TABLE IF NOT EXISTS summary_unlocks (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id  BIGINT REFERENCES news_articles(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, article_id)
);
CREATE INDEX IF NOT EXISTS idx_summary_unlocks_user ON summary_unlocks (user_id, unlocked_at DESC);

-- User profiles for tier tracking (free / premium)
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier       TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'premium')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE summary_unlocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users can read own summary_unlocks" ON summary_unlocks;
CREATE POLICY "users can read own summary_unlocks" ON summary_unlocks
  FOR SELECT USING (auth.uid() = user_id);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users can read own user_profiles" ON user_profiles;
CREATE POLICY "users can read own user_profiles" ON user_profiles
  FOR SELECT USING (auth.uid() = user_id);
