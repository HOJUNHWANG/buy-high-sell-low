-- Anthropic Class A common stock began trading on Nasdaq on November 19, 2026.
INSERT INTO public.stocks (ticker, name, exchange, sector, logo_url, is_active)
VALUES (
  'ANT', 'Anthropic, PBC', 'NASDAQ', 'Information Technology',
  'https://icons.duckduckgo.com/ip3/anthropic.com.ico', true
)
ON CONFLICT (ticker) DO UPDATE SET
  name = EXCLUDED.name,
  exchange = EXCLUDED.exchange,
  sector = EXCLUDED.sector,
  logo_url = EXCLUDED.logo_url,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
