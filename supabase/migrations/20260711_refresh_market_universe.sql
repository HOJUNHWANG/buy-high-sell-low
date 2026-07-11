-- Refresh the public market universe without deleting historical watchlist,
-- portfolio, or transaction references to retired assets.
ALTER TABLE stocks
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- These assets remain in `stocks` for historical records but are excluded from
-- public search, the screener, sitemap, and market overview queries.
UPDATE stocks
SET is_active = FALSE, updated_at = NOW()
WHERE ticker IN (
  'AAVE-USD', 'APT-USD', 'ARB-USD', 'ATOM-USD', 'DOT-USD',
  'FIL-USD', 'LTC-USD', 'NEAR-USD', 'OP-USD'
);

-- Keep the existing HON listing and add its separately listed aerospace business.
-- Seed the new ETF and current large-cap crypto universe as active assets.
INSERT INTO stocks (ticker, name, exchange, sector, logo_url, market_cap, is_active, updated_at)
VALUES
  ('HONA', 'Honeywell Aerospace', 'NASDAQ', 'Aerospace & Defense', NULL, NULL, TRUE, NOW()),
  ('OEF', 'iShares S&P 100 ETF', 'NYSE ARCA', 'ETF', NULL, NULL, TRUE, NOW()),
  ('USDC-USD', 'USD Coin', 'CRYPTO', 'Cryptocurrency', 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdc.png', NULL, TRUE, NOW()),
  ('TRX-USD', 'TRON', 'CRYPTO', 'Cryptocurrency', 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/trx.png', NULL, TRUE, NOW()),
  ('HYPE-USD', 'Hyperliquid', 'CRYPTO', 'Cryptocurrency', 'https://assets.coingecko.com/coins/images/50882/small/hyperliquid.jpg', NULL, TRUE, NOW()),
  ('LEO-USD', 'UNUS SED LEO', 'CRYPTO', 'Cryptocurrency', 'https://assets.coingecko.com/coins/images/8418/small/leo-token.png', NULL, TRUE, NOW()),
  ('ZEC-USD', 'Zcash', 'CRYPTO', 'Cryptocurrency', 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/zec.png', NULL, TRUE, NOW()),
  ('XLM-USD', 'Stellar', 'CRYPTO', 'Cryptocurrency', 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/xlm.png', NULL, TRUE, NOW()),
  ('XMR-USD', 'Monero', 'CRYPTO', 'Cryptocurrency', 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/xmr.png', NULL, TRUE, NOW()),
  ('DAI-USD', 'Dai', 'CRYPTO', 'Cryptocurrency', 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/dai.png', NULL, TRUE, NOW()),
  ('BCH-USD', 'Bitcoin Cash', 'CRYPTO', 'Cryptocurrency', 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/bch.png', NULL, TRUE, NOW())
ON CONFLICT (ticker) DO UPDATE SET
  name = EXCLUDED.name,
  exchange = EXCLUDED.exchange,
  sector = EXCLUDED.sector,
  logo_url = COALESCE(stocks.logo_url, EXCLUDED.logo_url),
  is_active = TRUE,
  updated_at = NOW();
