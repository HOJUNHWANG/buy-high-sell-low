-- Add side column to paper_positions for short selling support
ALTER TABLE paper_positions
  ADD COLUMN side TEXT NOT NULL DEFAULT 'long'
  CHECK (side IN ('long', 'short'));

-- Drop the old unique constraint and create new one that allows both long and short per ticker
ALTER TABLE paper_positions
  DROP CONSTRAINT IF EXISTS paper_positions_user_id_ticker_key;

ALTER TABLE paper_positions
  ADD CONSTRAINT paper_positions_user_id_ticker_side_key UNIQUE (user_id, ticker, side);

-- Add side column to paper_transactions for clearer history
-- 'buy' = open long, 'sell' = close long, 'short' = open short, 'cover' = close short
ALTER TABLE paper_transactions
  DROP CONSTRAINT IF EXISTS paper_transactions_side_check;

ALTER TABLE paper_transactions
  ALTER COLUMN side TYPE TEXT;

ALTER TABLE paper_transactions
  ADD CONSTRAINT paper_transactions_side_check CHECK (side IN ('buy', 'sell', 'short', 'cover'));
