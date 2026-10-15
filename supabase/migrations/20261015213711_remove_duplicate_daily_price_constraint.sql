-- Keep the primary key and its (ticker, date) uniqueness enforcement.
-- Catalog inspection found no foreign key depending on the duplicate UNIQUE
-- constraint. Do not use CASCADE; fail if a dependency has since been added.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
ALTER TABLE public.price_history_long
  DROP CONSTRAINT price_history_long_new_ticker_date_key;
