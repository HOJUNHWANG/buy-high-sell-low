-- Add missing columns to market_briefs table
ALTER TABLE market_briefs ADD COLUMN IF NOT EXISTS sector_notes text;
ALTER TABLE market_briefs ADD COLUMN IF NOT EXISTS sentiment_breakdown jsonb;
ALTER TABLE market_briefs ADD COLUMN IF NOT EXISTS top_gainers jsonb;
ALTER TABLE market_briefs ADD COLUMN IF NOT EXISTS top_losers jsonb;
ALTER TABLE market_briefs ADD COLUMN IF NOT EXISTS bullets jsonb;
ALTER TABLE market_briefs ADD COLUMN IF NOT EXISTS crypto_notes text;
ALTER TABLE market_briefs ADD COLUMN IF NOT EXISTS crypto_prices jsonb;
ALTER TABLE market_briefs ADD COLUMN IF NOT EXISTS news_count integer;
ALTER TABLE market_briefs ADD COLUMN IF NOT EXISTS generated_at timestamptz;
