SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.stock_prices ADD COLUMN IF NOT EXISTS provider_session_date date;
ALTER TABLE public.price_history_long ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.price_history_long ADD COLUMN IF NOT EXISTS price_basis text;
CREATE TABLE IF NOT EXISTS private.market_holidays(date date PRIMARY KEY);
ALTER TABLE private.market_holidays ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.market_holidays FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON private.market_holidays TO service_role;
INSERT INTO private.market_holidays VALUES ('2025-11-27'),('2025-12-25'),('2026-01-01'),('2026-01-19'),('2026-02-16'),('2026-04-03'),('2026-05-25'),('2026-06-19'),('2026-07-03'),('2026-09-07'),('2026-11-26'),('2026-12-25'),('2027-01-01'),('2027-01-18'),('2027-02-15'),('2027-03-26'),('2027-05-31'),('2027-06-18'),('2027-07-05'),('2027-09-06'),('2027-11-25'),('2027-12-24'),('2028-01-17'),('2028-02-21'),('2028-04-14'),('2028-05-29'),('2028-06-19'),('2028-07-04'),('2028-09-04'),('2028-11-23'),('2028-12-25') ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.validate_market_history()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $validate$
DECLARE v numeric; crypto boolean;
BEGIN
 SELECT sector='Cryptocurrency' INTO crypto FROM public.stocks WHERE ticker=NEW.ticker;
 IF NOT coalesce(crypto,false) AND (extract(isodow FROM NEW.date)>5 OR EXISTS(SELECT 1 FROM private.market_holidays WHERE date=NEW.date)) THEN
   RAISE EXCEPTION 'Daily equity history requires a trading session';
 END IF;
 IF NEW.date>(now() AT TIME ZONE (CASE WHEN crypto THEN 'UTC' ELSE 'America/New_York' END))::date THEN
   RAISE EXCEPTION 'Future daily history is invalid';
 END IF;
 FOREACH v IN ARRAY ARRAY[NEW.open,NEW.high,NEW.low,NEW.close] LOOP
   IF v IS NOT NULL AND (v<=0 OR v::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Invalid daily OHLC'; END IF;
 END LOOP;
 IF NEW.close IS NULL OR NEW.volume<0 OR NEW.low>NEW.high
   OR NEW.close<NEW.low*0.999 OR NEW.close>NEW.high*1.001
   OR NEW.open<NEW.low*0.999 OR NEW.open>NEW.high*1.001 THEN
   RAISE EXCEPTION 'Inconsistent daily OHLCV';
 END IF;
 RETURN NEW;
END;
$validate$;
DROP TRIGGER IF EXISTS validate_market_history_row ON public.price_history_long;
CREATE TRIGGER validate_market_history_row BEFORE INSERT OR UPDATE ON public.price_history_long
FOR EACH ROW EXECUTE FUNCTION public.validate_market_history();
REVOKE ALL ON FUNCTION public.validate_market_history() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_market_history() TO service_role;

CREATE OR REPLACE FUNCTION public.replace_split_adjusted_history(p_ticker text,p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $history$
DECLARE n integer; repair text; last_date date;
BEGIN
 IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)<100 OR jsonb_array_length(p_rows)>500 THEN RAISE EXCEPTION 'Invalid history replacement size'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.stocks WHERE ticker=p_ticker) THEN RAISE EXCEPTION 'Unknown history ticker'; END IF;
 SELECT max((x->>'date')::date) INTO last_date FROM jsonb_array_elements(p_rows)x;
 IF last_date<current_date-10 THEN RAISE EXCEPTION 'Replacement history is not current'; END IF;
 repair:='split-adjusted:'||p_ticker||':'||last_date::text;
 INSERT INTO private.repair_archive(repair_id,source_table,source_key,record)
 SELECT repair,'price_history_long',p_ticker||':'||h.date::text,to_jsonb(h)
 FROM public.price_history_long h JOIN jsonb_to_recordset(p_rows) x(date date,open numeric,high numeric,low numeric,close numeric,volume bigint) USING(date)
 WHERE h.ticker=p_ticker AND ROW(h.open,h.high,h.low,h.close,h.volume) IS DISTINCT FROM ROW(x.open,x.high,x.low,x.close,x.volume)
 ON CONFLICT DO NOTHING;
 INSERT INTO public.price_history_long(ticker,date,open,high,low,close,volume,source,price_basis)
 SELECT p_ticker,date,open,high,low,close,volume,'twelvedata.time_series','split_adjusted'
 FROM jsonb_to_recordset(p_rows)x(date date,open numeric,high numeric,low numeric,close numeric,volume bigint)
 ON CONFLICT(ticker,date) DO UPDATE SET open=excluded.open,high=excluded.high,low=excluded.low,close=excluded.close,volume=excluded.volume,source=excluded.source,price_basis=excluded.price_basis
 WHERE ROW(price_history_long.open,price_history_long.high,price_history_long.low,price_history_long.close,price_history_long.volume,price_history_long.source,price_history_long.price_basis)
 IS DISTINCT FROM ROW(excluded.open,excluded.high,excluded.low,excluded.close,excluded.volume,excluded.source,excluded.price_basis);
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END;
$history$;
REVOKE ALL ON FUNCTION public.replace_split_adjusted_history(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_split_adjusted_history(text,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.find_history_discontinuities()
RETURNS TABLE(ticker text) LANGUAGE sql SECURITY INVOKER SET search_path='' AS $scan$
 SELECT DISTINCT x.ticker FROM (
  SELECT h.ticker,h.close,lag(h.close) OVER(PARTITION BY h.ticker ORDER BY h.date) previous_close
  FROM public.price_history_long h JOIN public.stocks s USING(ticker)
  WHERE s.is_active AND s.sector IS DISTINCT FROM 'Cryptocurrency' AND h.date>=current_date-366
 )x WHERE x.close>0 AND x.previous_close>0 AND (x.close/x.previous_close>1.5 OR x.close/x.previous_close<0.6666667);
$scan$;
REVOKE ALL ON FUNCTION public.find_history_discontinuities() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.find_history_discontinuities() TO service_role;

NOTIFY pgrst, 'reload schema';
