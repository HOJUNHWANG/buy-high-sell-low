-- Prepare quotes, validated AUM/circulating caps, and daily history before
-- applying this migration. The four replacements become tradable together.
-- Existing holdings, challenges, watchlists, and historical data are preserved.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

INSERT INTO public.stocks (ticker, name, exchange, sector, is_active)
VALUES
  ('SOXQ', 'Invesco PHLX Semiconductor ETF', 'NASDAQ', 'ETF', false),
  ('VXUS', 'Vanguard Total International Stock ETF', 'NASDAQ', 'ETF', false),
  ('NEAR-USD', 'NEAR Protocol', 'CRYPTO', 'Cryptocurrency', false),
  ('UNI-USD', 'Uniswap', 'CRYPTO', 'Cryptocurrency', false)
ON CONFLICT (ticker) DO UPDATE
SET name = EXCLUDED.name, exchange = EXCLUDED.exchange, sector = EXCLUDED.sector;

DO $refresh$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.stocks s
    LEFT JOIN public.stock_prices p USING (ticker)
    LEFT JOIN LATERAL (
      SELECT count(*) AS days, max(date) AS latest
      FROM public.price_history_long h
      WHERE h.ticker = s.ticker AND h.close > 0
    ) h ON true
    WHERE s.ticker IN ('SOXQ', 'VXUS', 'NEAR-USD', 'UNI-USD')
      AND (
        p.price IS NULL OR p.price <= 0 OR p.fetched_at IS NULL
        OR p.fetched_at < now() - CASE WHEN s.sector = 'Cryptocurrency'
          THEN interval '20 minutes' ELSE interval '4 days' END
        OR s.market_cap IS NULL OR s.market_cap <= 0
        OR s.market_cap_updated_at IS NULL
        OR s.market_cap_updated_at < now() - interval '24 hours'
        OR s.market_cap_metric IS DISTINCT FROM CASE WHEN s.sector = 'ETF'
          THEN 'aum' ELSE 'circulating_market_cap' END
        OR s.market_cap_source IS NULL
        OR (s.sector = 'ETF' AND s.market_cap_source <> 'nasdaq.etf.summary.AUM')
        OR (s.sector = 'Cryptocurrency' AND s.market_cap_source <> 'coingecko.simple.usd_market_cap')
        OR h.days < 200 OR h.latest IS NULL OR h.latest < current_date - 4
      )
  ) THEN
    RAISE EXCEPTION 'ETF/crypto replacements are not ready: refresh quotes, verified market values, and daily history first';
  END IF;
END
$refresh$;

UPDATE public.stocks
SET is_active = ticker IN ('SOXQ', 'VXUS', 'NEAR-USD', 'UNI-USD'),
    updated_at = now()
WHERE ticker IN ('SPY', 'OEF', 'DOT-USD', 'XMR-USD',
                 'SOXQ', 'VXUS', 'NEAR-USD', 'UNI-USD');
