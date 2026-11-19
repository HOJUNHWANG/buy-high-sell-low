-- Remove the What If feature tables and keep only one year of daily chart history.

DROP TABLE IF EXISTS whatif_scenarios;

DELETE FROM price_history_long
WHERE date < (CURRENT_DATE - INTERVAL '366 days');
