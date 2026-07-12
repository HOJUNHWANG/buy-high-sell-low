-- Daily market-cap history for leader-duration insights.
CREATE TABLE IF NOT EXISTS market_cap_snapshots (
  ticker      TEXT NOT NULL REFERENCES stocks(ticker),
  date        DATE NOT NULL,
  market_cap  BIGINT NOT NULL,
  PRIMARY KEY (ticker, date)
);

CREATE INDEX IF NOT EXISTS idx_market_cap_snapshots_date
  ON market_cap_snapshots (date DESC, market_cap DESC);

ALTER TABLE market_cap_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read market cap snapshots" ON market_cap_snapshots;
CREATE POLICY "public read market cap snapshots"
  ON market_cap_snapshots FOR SELECT USING (true);

-- Start tracking with the current active universe; future daily market-cap
-- runs upsert a new date automatically.
INSERT INTO market_cap_snapshots (ticker, date, market_cap)
SELECT ticker, CURRENT_DATE, market_cap
FROM stocks
WHERE is_active = TRUE AND market_cap IS NOT NULL
ON CONFLICT (ticker, date) DO UPDATE SET market_cap = EXCLUDED.market_cap;
