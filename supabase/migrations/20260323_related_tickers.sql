-- Add related_tickers column to news_articles
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS related_tickers TEXT[];

-- Index for querying news by related ticker (array containment)
CREATE INDEX IF NOT EXISTS idx_news_related_tickers ON news_articles USING gin (related_tickers);
