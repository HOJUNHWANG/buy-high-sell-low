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
