-- Emoji reactions on leaderboard / graveyard entries
CREATE TABLE IF NOT EXISTS leaderboard_reactions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id   UUID NOT NULL,
  tab         TEXT NOT NULL CHECK (tab IN ('leaderboard', 'graveyard')),
  emoji       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, target_id, tab, emoji)
);
CREATE INDEX IF NOT EXISTS idx_reactions_target ON leaderboard_reactions (target_id, tab);
CREATE INDEX IF NOT EXISTS idx_reactions_user_date ON leaderboard_reactions (user_id, created_at);

-- RLS: anyone can read, users can write/delete own
ALTER TABLE leaderboard_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone can read reactions" ON leaderboard_reactions;
DROP POLICY IF EXISTS "users can insert own reactions" ON leaderboard_reactions;
DROP POLICY IF EXISTS "users can delete own reactions" ON leaderboard_reactions;
CREATE POLICY "anyone can read reactions" ON leaderboard_reactions FOR SELECT USING (true);
CREATE POLICY "users can insert own reactions" ON leaderboard_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users can delete own reactions" ON leaderboard_reactions FOR DELETE USING (auth.uid() = user_id);

-- Graveyard: snapshot of liquidated traders' portfolios
CREATE TABLE IF NOT EXISTS paper_graveyard (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  final_value     NUMERIC NOT NULL,
  cash_at_death   NUMERIC NOT NULL,
  positions_json  JSONB NOT NULL DEFAULT '[]',
  liquidated_at   TIMESTAMPTZ DEFAULT NOW(),
  month           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_graveyard_month ON paper_graveyard (month, liquidated_at);

-- RLS: public read only (writes via service role in liquidation route)
ALTER TABLE paper_graveyard ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone can read graveyard" ON paper_graveyard;
CREATE POLICY "anyone can read graveyard" ON paper_graveyard FOR SELECT USING (true);
