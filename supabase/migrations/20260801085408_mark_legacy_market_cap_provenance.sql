-- Historical rows predate trustworthy per-provider provenance. Do not label
-- hand-maintained or mixed-provider values as though all came from yfinance.
UPDATE public.market_cap_snapshots
SET source = 'legacy:unverified'
WHERE source = 'legacy:yfinance';

UPDATE public.stocks
SET market_cap_source = 'legacy:unverified'
WHERE market_cap_source = 'legacy:yfinance';

-- Repair the two known MU snapshots written by the removed $145B manual
-- fallback. The July 30 value is reconstructed from the adjacent verified
-- price/share series; August 1 is the contemporaneous Nasdaq value.
UPDATE public.market_cap_snapshots
SET
  market_cap = 835632368641,
  source = 'reconstructed:price_x_shares',
  metric = 'equity_market_cap'
WHERE ticker = 'MU' AND date = DATE '2026-07-30';

UPDATE public.market_cap_snapshots
SET
  market_cap = 929524445068,
  source = 'nasdaq.screener.marketCap',
  metric = 'equity_market_cap'
WHERE ticker = 'MU' AND date = DATE '2026-08-01';
