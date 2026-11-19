-- Keep the tracked crypto set compatible with the current price provider and
-- the automated history backfill. Historical rows for retired assets remain.
UPDATE stocks
SET is_active = FALSE, updated_at = NOW()
WHERE ticker IN ('HYPE-USD', 'LEO-USD', 'DAI-USD');

UPDATE stocks
SET is_active = TRUE, updated_at = NOW()
WHERE ticker IN ('LTC-USD', 'DOT-USD', 'AAVE-USD');
