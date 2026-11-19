-- Internal review queue for suspicious provider-reported price changes.
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

ALTER TABLE price_anomalies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no public access price anomalies" ON price_anomalies;
-- No public policy. Service-role ingestion and the server-only admin page have access.

-- Preserve the incident that motivated this queue even if the migration is
-- applied after the event date.
INSERT INTO price_anomalies (
  ticker,
  market_date,
  price,
  provider_change_pct,
  applied_change_pct,
  reason,
  details
)
VALUES (
  'HON',
  '2026-06-29',
  227.71001,
  -50.96895,
  -6.45,
  'corporate_action_override',
  'HON completed the HONA spin-off and a 1-for-2 reverse split.'
)
ON CONFLICT (ticker, market_date, reason) DO NOTHING;
