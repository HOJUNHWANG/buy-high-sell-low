-- Align BNY Mellon with the current S&P 100 constituent symbol.
-- The app previously tracked BNY Mellon as BK; current market data providers use BNY.

WITH source_stock AS (
  SELECT
    'BNY'::TEXT AS ticker,
    'BNY Mellon'::TEXT AS name,
    COALESCE(exchange, 'NYSE') AS exchange,
    COALESCE(sector, 'Financial Services') AS sector,
    COALESCE(logo_url, 'https://icons.duckduckgo.com/ip3/bny.com.ico') AS logo_url,
    market_cap
  FROM stocks
  WHERE ticker = 'BK'

  UNION ALL

  SELECT
    'BNY',
    'BNY Mellon',
    'NYSE',
    'Financial Services',
    'https://icons.duckduckgo.com/ip3/bny.com.ico',
    NULL::BIGINT
  WHERE NOT EXISTS (SELECT 1 FROM stocks WHERE ticker = 'BK')
)
INSERT INTO stocks (ticker, name, exchange, sector, logo_url, market_cap, updated_at)
SELECT ticker, name, exchange, sector, logo_url, market_cap, NOW()
FROM source_stock
LIMIT 1
ON CONFLICT (ticker) DO UPDATE SET
  name = EXCLUDED.name,
  exchange = COALESCE(stocks.exchange, EXCLUDED.exchange),
  sector = COALESCE(stocks.sector, EXCLUDED.sector),
  logo_url = COALESCE(stocks.logo_url, EXCLUDED.logo_url),
  market_cap = COALESCE(stocks.market_cap, EXCLUDED.market_cap),
  updated_at = NOW();

DELETE FROM watchlist old_watchlist
USING watchlist new_watchlist
WHERE old_watchlist.ticker = 'BK'
  AND new_watchlist.ticker = 'BNY'
  AND old_watchlist.user_id = new_watchlist.user_id;

UPDATE watchlist
SET ticker = 'BNY'
WHERE ticker = 'BK';

WITH duplicate_positions AS (
  SELECT
    new_position.id AS target_id,
    old_position.id AS old_id,
    new_position.shares AS target_shares,
    old_position.shares AS old_shares,
    new_position.avg_cost AS target_avg_cost,
    old_position.avg_cost AS old_avg_cost,
    new_position.borrowed AS target_borrowed,
    old_position.borrowed AS old_borrowed
  FROM paper_positions old_position
  JOIN paper_positions new_position
    ON old_position.user_id = new_position.user_id
   AND old_position.side = new_position.side
  WHERE old_position.ticker = 'BK'
    AND new_position.ticker = 'BNY'
)
UPDATE paper_positions position
SET
  shares = duplicate_positions.target_shares + duplicate_positions.old_shares,
  avg_cost = CASE
    WHEN duplicate_positions.target_shares + duplicate_positions.old_shares = 0
      THEN position.avg_cost
    ELSE (
      duplicate_positions.target_shares * duplicate_positions.target_avg_cost
      + duplicate_positions.old_shares * duplicate_positions.old_avg_cost
    ) / (duplicate_positions.target_shares + duplicate_positions.old_shares)
  END,
  borrowed = duplicate_positions.target_borrowed + duplicate_positions.old_borrowed,
  updated_at = NOW()
FROM duplicate_positions
WHERE position.id = duplicate_positions.target_id;

DELETE FROM paper_positions old_position
USING paper_positions new_position
WHERE old_position.ticker = 'BK'
  AND new_position.ticker = 'BNY'
  AND old_position.user_id = new_position.user_id
  AND old_position.side = new_position.side;

UPDATE paper_positions
SET ticker = 'BNY'
WHERE ticker = 'BK';

UPDATE paper_transactions
SET ticker = 'BNY'
WHERE ticker = 'BK';

UPDATE paper_challenges
SET ticker = 'BNY'
WHERE ticker = 'BK';

UPDATE stock_prices
SET ticker = 'BNY'
WHERE ticker = 'BK'
  AND NOT EXISTS (SELECT 1 FROM stock_prices WHERE ticker = 'BNY');

DELETE FROM stock_prices
WHERE ticker = 'BK';

UPDATE stock_price_history
SET ticker = 'BNY'
WHERE ticker = 'BK';

DELETE FROM price_history_long old_history
USING price_history_long new_history
WHERE old_history.ticker = 'BK'
  AND new_history.ticker = 'BNY'
  AND old_history.date = new_history.date;

UPDATE price_history_long
SET ticker = 'BNY'
WHERE ticker = 'BK';

UPDATE news_articles
SET ticker = 'BNY'
WHERE ticker = 'BK';

UPDATE news_articles
SET related_tickers = (
  SELECT ARRAY_AGG(DISTINCT CASE WHEN related_ticker = 'BK' THEN 'BNY' ELSE related_ticker END)
  FROM UNNEST(related_tickers) AS tickers(related_ticker)
)
WHERE related_tickers @> ARRAY['BK']::TEXT[];

UPDATE fetch_logs
SET failed_tickers = (
  SELECT ARRAY_AGG(DISTINCT CASE WHEN failed_ticker = 'BK' THEN 'BNY' ELSE failed_ticker END)
  FROM UNNEST(failed_tickers) AS tickers(failed_ticker)
)
WHERE failed_tickers @> ARRAY['BK']::TEXT[];

DELETE FROM stocks
WHERE ticker = 'BK';
