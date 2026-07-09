-- Fictional Market
-- Isolated from the real market tables so simulated symbols never pollute live data.

CREATE TABLE IF NOT EXISTS fictional_companies (
  ticker       TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  source       TEXT NOT NULL,
  exchange     TEXT NOT NULL CHECK (exchange IN ('FICTDAQ', 'OMNI', 'NSE', 'LUNA')),
  sector       TEXT NOT NULL,
  risk         TEXT NOT NULL CHECK (risk IN ('Low', 'Moderate', 'High', 'Extreme', 'Existential')),
  market_cap   BIGINT NOT NULL,
  base_price   NUMERIC NOT NULL,
  float_shares NUMERIC NOT NULL,
  volatility   NUMERIC NOT NULL,
  influence    INT NOT NULL CHECK (influence BETWEEN 0 AND 100),
  technology   INT NOT NULL CHECK (technology BETWEEN 0 AND 100),
  color        TEXT NOT NULL,
  accent       TEXT NOT NULL,
  note         TEXT NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fictional_prices (
  ticker      TEXT PRIMARY KEY REFERENCES fictional_companies(ticker) ON DELETE CASCADE,
  price       NUMERIC NOT NULL,
  change_pct  NUMERIC NOT NULL,
  volume      BIGINT NOT NULL,
  pe_ratio    NUMERIC,
  dividend_yield NUMERIC,
  fetched_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fictional_price_history (
  ticker      TEXT REFERENCES fictional_companies(ticker) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  price       NUMERIC NOT NULL,
  change_pct  NUMERIC NOT NULL,
  volume      BIGINT NOT NULL,
  PRIMARY KEY (ticker, recorded_at)
);

CREATE TABLE IF NOT EXISTS fictional_price_history_daily (
  ticker TEXT REFERENCES fictional_companies(ticker) ON DELETE CASCADE,
  date   DATE NOT NULL,
  open   NUMERIC NOT NULL,
  high   NUMERIC NOT NULL,
  low    NUMERIC NOT NULL,
  close  NUMERIC NOT NULL,
  volume BIGINT NOT NULL,
  PRIMARY KEY (ticker, date)
);

CREATE TABLE IF NOT EXISTS fictional_market_events (
  id          BIGSERIAL PRIMARY KEY,
  event_key   TEXT UNIQUE,
  ticker      TEXT REFERENCES fictional_companies(ticker) ON DELETE SET NULL,
  headline    TEXT NOT NULL,
  impact_pct  NUMERIC NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('routine', 'material', 'chaotic')),
  event_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fictional_news (
  id           BIGSERIAL PRIMARY KEY,
  ticker       TEXT REFERENCES fictional_companies(ticker) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  body         TEXT,
  sentiment    TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  source       TEXT NOT NULL DEFAULT 'BHSL Fictional Wire',
  published_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fictional_companies_name_trgm
  ON fictional_companies USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_fictional_companies_ticker_trgm
  ON fictional_companies USING gin (ticker gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_fictional_prices_change
  ON fictional_prices (change_pct DESC);
CREATE INDEX IF NOT EXISTS idx_fictional_history_ticker_time
  ON fictional_price_history (ticker, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_fictional_daily_ticker_date
  ON fictional_price_history_daily (ticker, date DESC);
CREATE INDEX IF NOT EXISTS idx_fictional_events_time
  ON fictional_market_events (event_at DESC);
CREATE INDEX IF NOT EXISTS idx_fictional_news_ticker_time
  ON fictional_news (ticker, published_at DESC);

ALTER TABLE fictional_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE fictional_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE fictional_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE fictional_price_history_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE fictional_market_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fictional_news ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read fictional companies" ON fictional_companies;
DROP POLICY IF EXISTS "public read fictional prices" ON fictional_prices;
DROP POLICY IF EXISTS "public read fictional history" ON fictional_price_history;
DROP POLICY IF EXISTS "public read fictional daily history" ON fictional_price_history_daily;
DROP POLICY IF EXISTS "public read fictional events" ON fictional_market_events;
DROP POLICY IF EXISTS "public read fictional news" ON fictional_news;

CREATE POLICY "public read fictional companies" ON fictional_companies FOR SELECT USING (true);
CREATE POLICY "public read fictional prices" ON fictional_prices FOR SELECT USING (true);
CREATE POLICY "public read fictional history" ON fictional_price_history FOR SELECT USING (true);
CREATE POLICY "public read fictional daily history" ON fictional_price_history_daily FOR SELECT USING (true);
CREATE POLICY "public read fictional events" ON fictional_market_events FOR SELECT USING (true);
CREATE POLICY "public read fictional news" ON fictional_news FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION cleanup_fictional_market_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM fictional_price_history
  WHERE recorded_at < NOW() - INTERVAL '30 days';

  DELETE FROM fictional_market_events
  WHERE event_at < NOW() - INTERVAL '30 days';

  DELETE FROM fictional_news
  WHERE published_at < NOW() - INTERVAL '45 days';

  DELETE FROM fictional_price_history_daily
  WHERE date < CURRENT_DATE - INTERVAL '366 days';
END;
$$;
