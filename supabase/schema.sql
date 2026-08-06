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
  market_cap_updated_at TIMESTAMPTZ,
  market_cap_source TEXT,
  market_cap_metric TEXT CHECK (
    market_cap_metric IN ('equity_market_cap', 'circulating_market_cap', 'aum')
  ),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
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

-- Intraday price history for charts (30-day retention)
CREATE TABLE IF NOT EXISTS stock_price_history (
  id          BIGSERIAL PRIMARY KEY,
  ticker      TEXT REFERENCES stocks(ticker),
  price       NUMERIC NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_price_history ON stock_price_history (ticker, recorded_at DESC);

-- Daily market-cap snapshots power leader-streak and ranking insights.
CREATE TABLE IF NOT EXISTS market_cap_snapshots (
  ticker      TEXT NOT NULL REFERENCES stocks(ticker),
  date        DATE NOT NULL,
  market_cap  BIGINT NOT NULL,
  observed_at TIMESTAMPTZ,
  source      TEXT,
  metric      TEXT CHECK (
    metric IN ('equity_market_cap', 'circulating_market_cap', 'aum')
  ),
  PRIMARY KEY (ticker, date)
);
CREATE INDEX IF NOT EXISTS idx_market_cap_snapshots_date
  ON market_cap_snapshots (date DESC, market_cap DESC);
CREATE INDEX IF NOT EXISTS idx_stocks_market_cap_updated_at
  ON stocks (market_cap_updated_at);

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
  related_tickers  TEXT[],
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

-- Suspicious provider changes awaiting admin review
CREATE TABLE IF NOT EXISTS price_anomalies (
  id                  BIGSERIAL PRIMARY KEY,
  ticker              TEXT NOT NULL REFERENCES stocks(ticker),
  market_date         DATE NOT NULL,
  price               NUMERIC NOT NULL,
  provider_change_pct NUMERIC,
  applied_change_pct  NUMERIC,
  reason              TEXT NOT NULL CHECK (
    reason IN ('corporate_action_override', 'extreme_change_suppressed')
  ),
  details             TEXT,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'reviewed', 'ignored')
  ),
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at         TIMESTAMPTZ,
  reviewed_by         TEXT,
  UNIQUE (ticker, market_date, reason)
);
CREATE INDEX IF NOT EXISTS idx_price_anomalies_review_queue
  ON price_anomalies (status, detected_at DESC);

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

-- Per-user presentation preferences (safe to update without exposing account tier data)
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'midnight' CHECK (theme IN (
    'midnight', 'aurora', 'dusk', 'light', 'white-gold', 'black-gold',
    'black-red', 'pastel-light', 'pastel-rose', 'pastel-mint', 'pastel-sky',
    'pastel-peach', 'pastel-dark'
  )),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
DROP POLICY IF EXISTS "public read market cap snapshots"  ON market_cap_snapshots;
DROP POLICY IF EXISTS "public read news"                  ON news_articles;
DROP POLICY IF EXISTS "public read active affiliates"     ON affiliate_links;
DROP POLICY IF EXISTS "no public access fetch_logs"       ON fetch_logs;
DROP POLICY IF EXISTS "no public access price anomalies"  ON price_anomalies;
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

-- price_anomalies: internal only; service role access from ingestion/admin.
ALTER TABLE price_anomalies ENABLE ROW LEVEL SECURITY;

ALTER TABLE market_cap_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read market cap snapshots" ON market_cap_snapshots FOR SELECT USING (true);

-- ai_usage: users can only read their own usage
DROP POLICY IF EXISTS "users can read own ai_usage" ON ai_usage;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can read own ai_usage" ON ai_usage FOR SELECT USING (auth.uid() = user_id);
-- No INSERT/UPDATE policy for client — writes go through service role in API route.

-- summary_unlocks: users can read their own unlocks; API writes use service role
DROP POLICY IF EXISTS "users can read own summary_unlocks" ON summary_unlocks;
DROP POLICY IF EXISTS "users can insert own summary_unlocks" ON summary_unlocks;
ALTER TABLE summary_unlocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.summary_unlocks FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.summary_unlocks_id_seq FROM anon, authenticated;
GRANT SELECT ON public.summary_unlocks TO authenticated;
CREATE POLICY "users can read own summary_unlocks" ON summary_unlocks
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- user_profiles: users can only read their own profile
DROP POLICY IF EXISTS "users can read own user_profiles" ON user_profiles;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can read own user_profiles" ON user_profiles FOR SELECT USING (auth.uid() = user_id);

-- user_preferences: users can only manage their own display settings
DROP POLICY IF EXISTS "users can read own preferences" ON user_preferences;
DROP POLICY IF EXISTS "users can insert own preferences" ON user_preferences;
DROP POLICY IF EXISTS "users can update own preferences" ON user_preferences;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_preferences FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_preferences TO authenticated;
CREATE POLICY "users can read own preferences" ON user_preferences FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "users can insert own preferences" ON user_preferences
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "users can update own preferences" ON user_preferences
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Atomic account theme synchronization. Direct table writes stay unavailable.
CREATE OR REPLACE FUNCTION public.set_theme_preference(
  p_theme TEXT,
  p_updated_at TIMESTAMPTZ,
  p_force BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(theme TEXT, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_received_at TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_candidate_at TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_updated_at IS NULL THEN
    RAISE EXCEPTION 'updated_at is required' USING ERRCODE = '22023';
  END IF;

  v_candidate_at := LEAST(
    p_updated_at,
    v_received_at + INTERVAL '5 minutes'
  );

  INSERT INTO public.user_preferences AS preference (user_id, theme, updated_at)
  VALUES (v_user_id, p_theme, v_received_at)
  ON CONFLICT (user_id) DO UPDATE
    SET theme = EXCLUDED.theme,
        updated_at = v_received_at
    WHERE COALESCE(p_force, FALSE)
       OR preference.updated_at <= v_candidate_at;

  RETURN QUERY
    SELECT preference.theme, preference.updated_at
    FROM public.user_preferences AS preference
    WHERE preference.user_id = v_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_theme_preference(TEXT, TIMESTAMPTZ, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_theme_preference(TEXT, TIMESTAMPTZ, BOOLEAN)
  TO authenticated;

-- Atomic server-only summary unlock quota claim.
CREATE OR REPLACE FUNCTION public.claim_summary_unlock(
  p_user_id UUID,
  p_article_id BIGINT,
  p_daily_limit INTEGER
)
RETURNS TABLE(outcome TEXT, remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_premium BOOLEAN;
  v_today_count INTEGER := 0;
  v_day_start TIMESTAMPTZ :=
    pg_catalog.date_trunc('day', pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')
    AT TIME ZONE 'UTC';
BEGIN
  IF p_user_id IS NULL OR p_article_id IS NULL OR p_daily_limit < 1 THEN
    RAISE EXCEPTION 'invalid summary unlock claim' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_user_id::TEXT || ':' || v_day_start::DATE::TEXT,
      0
    )
  );

  SELECT COALESCE(
    (SELECT profile.tier = 'premium'
     FROM public.user_profiles AS profile
     WHERE profile.user_id = p_user_id),
    FALSE
  )
  INTO v_is_premium;

  IF NOT v_is_premium THEN
    SELECT COUNT(*)::INTEGER
    INTO v_today_count
    FROM public.summary_unlocks AS unlock
    WHERE unlock.user_id = p_user_id
      AND unlock.unlocked_at >= v_day_start;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.summary_unlocks AS unlock
    WHERE unlock.user_id = p_user_id
      AND unlock.article_id = p_article_id
  ) THEN
    RETURN QUERY SELECT
      'already_unlocked'::TEXT,
      CASE WHEN v_is_premium THEN NULL::INTEGER
           ELSE GREATEST(p_daily_limit - v_today_count, 0)
      END;
    RETURN;
  END IF;

  IF NOT v_is_premium AND v_today_count >= p_daily_limit THEN
    RETURN QUERY SELECT 'limit_reached'::TEXT, 0::INTEGER;
    RETURN;
  END IF;

  INSERT INTO public.summary_unlocks (user_id, article_id)
  VALUES (p_user_id, p_article_id)
  ON CONFLICT (user_id, article_id) DO NOTHING;

  RETURN QUERY SELECT
    'unlocked'::TEXT,
    CASE WHEN v_is_premium THEN NULL::INTEGER
         ELSE GREATEST(p_daily_limit - v_today_count - 1, 0)
    END;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_summary_unlock(UUID, BIGINT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_summary_unlock(UUID, BIGINT, INTEGER)
  TO service_role;

-- =========================================
-- Daily chart history (1Y rolling OHLCV)
-- =========================================
CREATE TABLE IF NOT EXISTS price_history_long (
  ticker  TEXT REFERENCES stocks(ticker),
  date    DATE NOT NULL,
  open    NUMERIC,
  high    NUMERIC,
  low     NUMERIC,
  close   NUMERIC NOT NULL,
  volume  BIGINT,
  PRIMARY KEY (ticker, date)
);
CREATE INDEX IF NOT EXISTS idx_phl_ticker_date ON price_history_long (ticker, date DESC);

DROP POLICY IF EXISTS "public read price_history_long" ON price_history_long;
ALTER TABLE price_history_long ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read price_history_long" ON price_history_long FOR SELECT USING (true);

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
  side        TEXT NOT NULL DEFAULT 'long' CHECK (side IN ('long', 'short')),
  shares      NUMERIC NOT NULL,
  avg_cost    NUMERIC NOT NULL,
  leverage    INT NOT NULL DEFAULT 1,
  borrowed    NUMERIC NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ticker, side)
);

CREATE TABLE IF NOT EXISTS paper_transactions (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker       TEXT REFERENCES stocks(ticker),
  side         TEXT NOT NULL CHECK (side IN ('buy', 'sell', 'short', 'cover')),
  shares       NUMERIC NOT NULL,
  price        NUMERIC NOT NULL,
  total        NUMERIC NOT NULL,
  leverage     INT NOT NULL DEFAULT 1,
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
DROP POLICY IF EXISTS "users can delete own paper_challenges" ON paper_challenges;
ALTER TABLE paper_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paper_challenges FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.paper_challenges_id_seq FROM anon, authenticated;
GRANT SELECT ON public.paper_challenges TO authenticated;
CREATE POLICY "users can read own paper_challenges" ON paper_challenges
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
-- No INSERT/UPDATE/DELETE policy: challenge mutations are server-only.

-- Atomic service-role write for validated current market value + daily history.
CREATE OR REPLACE FUNCTION public.upsert_market_cap_observation(
  p_ticker TEXT,
  p_market_cap BIGINT,
  p_observed_at TIMESTAMPTZ,
  p_source TEXT,
  p_metric TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_market_cap <= 0 THEN
    RAISE EXCEPTION 'market cap must be positive';
  END IF;
  IF p_source IS NULL OR btrim(p_source) = '' THEN
    RAISE EXCEPTION 'market cap source is required';
  END IF;
  IF p_metric NOT IN ('equity_market_cap', 'circulating_market_cap', 'aum') THEN
    RAISE EXCEPTION 'invalid market cap metric: %', p_metric;
  END IF;

  UPDATE public.stocks
  SET
    market_cap = p_market_cap,
    market_cap_updated_at = p_observed_at,
    market_cap_source = p_source,
    market_cap_metric = p_metric,
    updated_at = p_observed_at
  WHERE ticker = upper(p_ticker);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown market ticker: %', p_ticker;
  END IF;

  INSERT INTO public.market_cap_snapshots (
    ticker,
    date,
    market_cap,
    observed_at,
    source,
    metric
  )
  VALUES (
    upper(p_ticker),
    (p_observed_at AT TIME ZONE 'UTC')::date,
    p_market_cap,
    p_observed_at,
    p_source,
    p_metric
  )
  ON CONFLICT (ticker, date)
  DO UPDATE SET
    market_cap = EXCLUDED.market_cap,
    observed_at = EXCLUDED.observed_at,
    source = EXCLUDED.source,
    metric = EXCLUDED.metric;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_market_cap_observation(
  TEXT, BIGINT, TIMESTAMPTZ, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_market_cap_observation(
  TEXT, BIGINT, TIMESTAMPTZ, TEXT, TEXT
) TO service_role;
