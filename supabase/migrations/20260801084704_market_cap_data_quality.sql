-- Track the provenance and freshness of every stored market-value metric.
ALTER TABLE public.stocks
  ADD COLUMN IF NOT EXISTS market_cap_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS market_cap_source TEXT,
  ADD COLUMN IF NOT EXISTS market_cap_metric TEXT;

DO $$
BEGIN
  ALTER TABLE public.stocks
    ADD CONSTRAINT stocks_market_cap_metric_check
    CHECK (
      market_cap_metric IS NULL
      OR market_cap_metric IN ('equity_market_cap', 'circulating_market_cap', 'aum')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.market_cap_snapshots
  ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS metric TEXT;

DO $$
BEGIN
  ALTER TABLE public.market_cap_snapshots
    ADD CONSTRAINT market_cap_snapshots_metric_check
    CHECK (
      metric IS NULL
      OR metric IN ('equity_market_cap', 'circulating_market_cap', 'aum')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE public.market_cap_snapshots AS snapshot
SET
  observed_at = COALESCE(snapshot.observed_at, snapshot.date::TIMESTAMPTZ),
  source = COALESCE(snapshot.source, 'legacy:yfinance'),
  metric = COALESCE(
    snapshot.metric,
    CASE
      WHEN stock.sector = 'Cryptocurrency' THEN 'circulating_market_cap'
      WHEN stock.sector = 'ETF' THEN 'aum'
      ELSE 'equity_market_cap'
    END
  )
FROM public.stocks AS stock
WHERE stock.ticker = snapshot.ticker;

WITH latest AS (
  SELECT DISTINCT ON (ticker)
    ticker,
    observed_at,
    source,
    metric
  FROM public.market_cap_snapshots
  ORDER BY ticker, date DESC
)
UPDATE public.stocks AS stock
SET
  market_cap_updated_at = COALESCE(
    stock.market_cap_updated_at,
    latest.observed_at,
    stock.updated_at
  ),
  market_cap_source = COALESCE(stock.market_cap_source, latest.source, 'legacy:yfinance'),
  market_cap_metric = COALESCE(
    stock.market_cap_metric,
    latest.metric,
    CASE
      WHEN stock.sector = 'Cryptocurrency' THEN 'circulating_market_cap'
      WHEN stock.sector = 'ETF' THEN 'aum'
      ELSE 'equity_market_cap'
    END
  )
FROM latest
WHERE stock.market_cap IS NOT NULL
  AND stock.ticker = latest.ticker;

CREATE INDEX IF NOT EXISTS idx_stocks_market_cap_updated_at
  ON public.stocks (market_cap_updated_at);
