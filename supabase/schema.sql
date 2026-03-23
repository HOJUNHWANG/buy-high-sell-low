-- Buy High Sell Low Database Schema
-- Run this in Supabase SQL Editor

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Stocks (US only — NYSE, NASDAQ)
CREATE TABLE IF NOT EXISTS stocks (
  ticker      TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  exchange    TEXT,
  sector      TEXT,
  logo_url    TEXT,
  market_cap  BIGINT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Current prices (1 row per ticker, upserted on each fetch)
CREATE TABLE IF NOT EXISTS stock_prices (
  ticker      TEXT PRIMARY KEY REFERENCES stocks(ticker),
  price       NUMERIC NOT NULL,
  change_pct  NUMERIC,
  volume      BIGINT,
  fetched_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Price history for charts (90-day retention)
CREATE TABLE IF NOT EXISTS stock_price_history (
  id          BIGSERIAL PRIMARY KEY,
  ticker      TEXT REFERENCES stocks(ticker),
  price       NUMERIC NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_price_history ON stock_price_history (ticker, recorded_at DESC);

-- News articles
CREATE TABLE IF NOT EXISTS news_articles (
  id               BIGSERIAL PRIMARY KEY,
  ticker           TEXT,
  title            TEXT NOT NULL,
  url              TEXT UNIQUE NOT NULL,
  source           TEXT,
  published_at     TIMESTAMPTZ,
  ai_summary       TEXT,
  ai_insight       TEXT,
  ai_sentiment     TEXT CHECK (ai_sentiment IN ('positive', 'neutral', 'negative')),
  ai_caution       TEXT,
  ai_generated_at  TIMESTAMPTZ,
  fetched_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Watchlist
CREATE TABLE IF NOT EXISTS watchlist (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker     TEXT REFERENCES stocks(ticker),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ticker)
);

-- Affiliate links (managed in DB, never hardcoded in components)
CREATE TABLE IF NOT EXISTS affiliate_links (
  id          BIGSERIAL PRIMARY KEY,
  partner     TEXT NOT NULL,
  label       TEXT NOT NULL,
  url         TEXT NOT NULL,
  cpa_usd     NUMERIC,
  placement   TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Data collection monitoring
CREATE TABLE IF NOT EXISTS fetch_logs (
  id               BIGSERIAL PRIMARY KEY,
  job_name         TEXT NOT NULL,
  status           TEXT NOT NULL,
  records_fetched  INT DEFAULT 0,
  records_failed   INT DEFAULT 0,
  failed_tickers   TEXT[],
  error_message    TEXT,
  executed_at      TIMESTAMPTZ DEFAULT NOW()
);

-- AI usage rate limiting (30 calls/user/day)
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date     DATE DEFAULT CURRENT_DATE,
  count    INT DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

-- Individual article unlock records (permanent per user+article)
-- Daily limit is derived by counting today's rows
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
  user_id  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier     TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'premium')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Search indexes (pg_trgm)
CREATE INDEX IF NOT EXISTS idx_stocks_name_trgm   ON stocks USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_stocks_ticker_trgm ON stocks USING gin (ticker gin_trgm_ops);

-- News index: supports date-filtered dedup in fetch_news.py and weekly cleanup
CREATE INDEX IF NOT EXISTS idx_news_fetched_at ON news_articles (fetched_at DESC);
-- Also useful for per-ticker news queries on the stock detail page
CREATE INDEX IF NOT EXISTS idx_news_ticker_published ON news_articles (ticker, published_at DESC);

-- =========================================
-- RLS (Row Level Security)
-- =========================================

-- Drop existing policies first (safe to re-run)
DROP POLICY IF EXISTS "users can read own watchlist"      ON watchlist;
DROP POLICY IF EXISTS "users can insert own watchlist"    ON watchlist;
DROP POLICY IF EXISTS "users can delete own watchlist"    ON watchlist;
DROP POLICY IF EXISTS "public read stocks"                ON stocks;
DROP POLICY IF EXISTS "public read prices"                ON stock_prices;
DROP POLICY IF EXISTS "public read price history"         ON stock_price_history;
DROP POLICY IF EXISTS "public read news"                  ON news_articles;
DROP POLICY IF EXISTS "public read active affiliates"     ON affiliate_links;
DROP POLICY IF EXISTS "no public access fetch_logs"       ON fetch_logs;
DROP POLICY IF EXISTS "users can read own ai_usage"       ON ai_usage;

-- watchlist: own data only
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can read own watchlist"   ON watchlist FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users can insert own watchlist" ON watchlist FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users can delete own watchlist" ON watchlist FOR DELETE USING (auth.uid() = user_id);

-- Public read for market data
ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read stocks" ON stocks FOR SELECT USING (true);

ALTER TABLE stock_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read prices" ON stock_prices FOR SELECT USING (true);

ALTER TABLE stock_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read price history" ON stock_price_history FOR SELECT USING (true);

ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read news" ON news_articles FOR SELECT USING (true);

ALTER TABLE affiliate_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read active affiliates" ON affiliate_links FOR SELECT USING (is_active = true);

-- fetch_logs: internal only — no public or user access
DROP POLICY IF EXISTS "no public access fetch_logs" ON fetch_logs;
ALTER TABLE fetch_logs ENABLE ROW LEVEL SECURITY;
-- No SELECT policy = blocked for all anon/authenticated client queries.
-- Only service role key (used by Python scripts) can write.

-- ai_usage: users can only read their own usage
DROP POLICY IF EXISTS "users can read own ai_usage" ON ai_usage;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can read own ai_usage" ON ai_usage FOR SELECT USING (auth.uid() = user_id);
-- No INSERT/UPDATE policy for client — writes go through service role in API route.

-- summary_unlocks: users can only read their own unlocks
DROP POLICY IF EXISTS "users can read own summary_unlocks" ON summary_unlocks;
ALTER TABLE summary_unlocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can read own summary_unlocks" ON summary_unlocks FOR SELECT USING (auth.uid() = user_id);

-- user_profiles: users can only read their own profile
DROP POLICY IF EXISTS "users can read own user_profiles" ON user_profiles;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can read own user_profiles" ON user_profiles FOR SELECT USING (auth.uid() = user_id);

-- =========================================
-- Long-term price history (20Y daily OHLCV for What If feature)
-- =========================================
CREATE TABLE IF NOT EXISTS price_history_long (
  id      BIGSERIAL PRIMARY KEY,
  ticker  TEXT REFERENCES stocks(ticker),
  date    DATE NOT NULL,
  open    NUMERIC,
  high    NUMERIC,
  low     NUMERIC,
  close   NUMERIC NOT NULL,
  volume  BIGINT,
  UNIQUE(ticker, date)
);
CREATE INDEX IF NOT EXISTS idx_phl_ticker_date ON price_history_long (ticker, date DESC);

DROP POLICY IF EXISTS "public read price_history_long" ON price_history_long;
ALTER TABLE price_history_long ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read price_history_long" ON price_history_long FOR SELECT USING (true);

-- =========================================
-- What If scenarios (user-saved regret calculations)
-- =========================================
CREATE TABLE IF NOT EXISTS whatif_scenarios (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker      TEXT REFERENCES stocks(ticker),
  buy_date    DATE NOT NULL,
  sell_date   DATE,
  amount_usd  NUMERIC NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_whatif_user ON whatif_scenarios (user_id, created_at DESC);

DROP POLICY IF EXISTS "users can read own whatif"   ON whatif_scenarios;
DROP POLICY IF EXISTS "users can insert own whatif"  ON whatif_scenarios;
DROP POLICY IF EXISTS "users can delete own whatif"  ON whatif_scenarios;
ALTER TABLE whatif_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can read own whatif"   ON whatif_scenarios FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users can insert own whatif"  ON whatif_scenarios FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users can delete own whatif"  ON whatif_scenarios FOR DELETE USING (auth.uid() = user_id);

-- =========================================
-- Paper Trading
-- =========================================
CREATE TABLE IF NOT EXISTS paper_accounts (
  user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cash_balance       NUMERIC NOT NULL DEFAULT 1000.00,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'margin_call', 'liquidated', 'suspended')),
  margin_call_at     TIMESTAMPTZ,
  liquidation_count  INT NOT NULL DEFAULT 0,
  last_liquidation_at TIMESTAMPTZ,
  suspended_until    DATE,
  last_checkin       DATE,
  streak             INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS paper_positions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker      TEXT REFERENCES stocks(ticker),
  shares      NUMERIC NOT NULL,
  avg_cost    NUMERIC NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ticker)
);

CREATE TABLE IF NOT EXISTS paper_transactions (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker       TEXT REFERENCES stocks(ticker),
  side         TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  shares       NUMERIC NOT NULL,
  price        NUMERIC NOT NULL,
  total        NUMERIC NOT NULL,
  executed_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_paper_tx_user ON paper_transactions (user_id, executed_at DESC);

CREATE TABLE IF NOT EXISTS paper_achievements (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_key   TEXT NOT NULL,
  earned_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, badge_key)
);

-- Paper trading AI roast rate limiting (1 call/user/day)
CREATE TABLE IF NOT EXISTS paper_ai_usage (
  user_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date     DATE DEFAULT CURRENT_DATE,
  count    INT DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

-- Weekly challenges
CREATE TABLE IF NOT EXISTS paper_challenges (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker        TEXT REFERENCES stocks(ticker),
  challenge_type TEXT NOT NULL CHECK (challenge_type IN ('gain_pct', 'hold_value')),
  target_pct    NUMERIC NOT NULL,
  week_start    DATE NOT NULL,
  week_end      DATE NOT NULL,
  entry_price   NUMERIC,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'expired')),
  reward_usd    NUMERIC NOT NULL DEFAULT 200,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_paper_challenges_user ON paper_challenges (user_id, week_start DESC);

-- RLS for paper trading tables
DROP POLICY IF EXISTS "users can read own paper_accounts"    ON paper_accounts;
DROP POLICY IF EXISTS "users can insert own paper_accounts"  ON paper_accounts;
DROP POLICY IF EXISTS "users can update own paper_accounts"  ON paper_accounts;
ALTER TABLE paper_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can read own paper_accounts"   ON paper_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users can insert own paper_accounts"  ON paper_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users can update own paper_accounts"  ON paper_accounts FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users can read own paper_positions"    ON paper_positions;
DROP POLICY IF EXISTS "users can insert own paper_positions"  ON paper_positions;
DROP POLICY IF EXISTS "users can update own paper_positions"  ON paper_positions;
DROP POLICY IF EXISTS "users can delete own paper_positions"  ON paper_positions;
ALTER TABLE paper_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can read own paper_positions"    ON paper_positions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users can insert own paper_positions"  ON paper_positions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users can update own paper_positions"  ON paper_positions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users can delete own paper_positions"  ON paper_positions FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users can read own paper_transactions"   ON paper_transactions;
DROP POLICY IF EXISTS "users can insert own paper_transactions" ON paper_transactions;
ALTER TABLE paper_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can read own paper_transactions"   ON paper_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users can insert own paper_transactions" ON paper_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users can read own paper_achievements"   ON paper_achievements;
DROP POLICY IF EXISTS "users can insert own paper_achievements" ON paper_achievements;
ALTER TABLE paper_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can read own paper_achievements"   ON paper_achievements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users can insert own paper_achievements" ON paper_achievements FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users can read own paper_ai_usage"   ON paper_ai_usage;
DROP POLICY IF EXISTS "users can insert own paper_ai_usage" ON paper_ai_usage;
DROP POLICY IF EXISTS "users can update own paper_ai_usage" ON paper_ai_usage;
ALTER TABLE paper_ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can read own paper_ai_usage"   ON paper_ai_usage FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users can insert own paper_ai_usage" ON paper_ai_usage FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users can update own paper_ai_usage" ON paper_ai_usage FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users can read own paper_challenges"   ON paper_challenges;
DROP POLICY IF EXISTS "users can insert own paper_challenges" ON paper_challenges;
DROP POLICY IF EXISTS "users can update own paper_challenges" ON paper_challenges;
ALTER TABLE paper_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can read own paper_challenges"   ON paper_challenges FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users can insert own paper_challenges" ON paper_challenges FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users can update own paper_challenges" ON paper_challenges FOR UPDATE USING (auth.uid() = user_id);
