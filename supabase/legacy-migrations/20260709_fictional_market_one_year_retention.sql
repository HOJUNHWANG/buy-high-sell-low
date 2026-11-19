-- Match real stock daily chart retention: keep a rolling 1Y + small weekend/holiday buffer.

CREATE OR REPLACE FUNCTION cleanup_fictional_market_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM fictional_price_history
  WHERE recorded_at < NOW() - INTERVAL '30 days';

  DELETE FROM fictional_market_events
  WHERE event_at < NOW() - INTERVAL '30 days';

  DELETE FROM fictional_news
  WHERE published_at < NOW() - INTERVAL '45 days';

  DELETE FROM fictional_price_history_daily
  WHERE date < CURRENT_DATE - INTERVAL '366 days';
END;
$$;
