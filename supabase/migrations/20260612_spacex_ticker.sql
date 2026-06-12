-- Add SpaceX ahead of first quote availability.
-- Price rows are intentionally not seeded; the normal price job will fill them
-- once the data provider starts returning SPCX.
INSERT INTO stocks (ticker, name, exchange, sector)
VALUES ('SPCX', 'SpaceX', 'NASDAQ', 'Aerospace & Defense')
ON CONFLICT (ticker) DO UPDATE SET
  name = EXCLUDED.name,
  exchange = EXCLUDED.exchange,
  sector = EXCLUDED.sector,
  updated_at = NOW();
