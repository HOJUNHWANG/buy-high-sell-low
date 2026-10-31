-- Expand first. Direct client mutation privileges are revoked in a later rollout
-- migration after the compatible API is live. No SECURITY DEFINER is required.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

ALTER TABLE public.paper_accounts ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE public.paper_accounts ADD COLUMN IF NOT EXISTS nickname_updated_at timestamptz;
ALTER TABLE public.paper_accounts ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.paper_accounts ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false;
ALTER TABLE public.paper_challenges ADD COLUMN IF NOT EXISTS resolution_error text;

CREATE TABLE IF NOT EXISTS private.demo_users (
  user_id uuid PRIMARY KEY, reason text NOT NULL, quarantined_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS private.demo_ledger_archive (
  source_table text NOT NULL, source_key text NOT NULL, user_id uuid NOT NULL,
  record jsonb NOT NULL, archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source_table,source_key)
);
CREATE TABLE IF NOT EXISTS private.paper_action_receipts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL, payload_hash text NOT NULL, result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,request_id)
);
ALTER TABLE private.demo_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.demo_ledger_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.paper_action_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.demo_users, private.demo_ledger_archive, private.paper_action_receipts TO service_role;

CREATE TABLE IF NOT EXISTS private.market_holidays(date date PRIMARY KEY);
ALTER TABLE private.market_holidays ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.market_holidays FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON private.market_holidays TO service_role;
INSERT INTO private.market_holidays VALUES ('2025-11-27'),('2025-12-25'),('2026-01-01'),('2026-01-19'),('2026-02-16'),('2026-04-03'),('2026-05-25'),('2026-06-19'),('2026-07-03'),('2026-09-07'),('2026-11-26'),('2026-12-25'),('2027-01-01'),('2027-01-18'),('2027-02-15'),('2027-03-26'),('2027-05-31'),('2027-06-18'),('2027-07-05'),('2027-09-06'),('2027-11-25'),('2027-12-24'),('2028-01-17'),('2028-02-21'),('2028-04-14'),('2028-05-29'),('2028-06-19'),('2028-07-04'),('2028-09-04'),('2028-11-23'),('2028-12-25') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS private.market_early_closes(date date PRIMARY KEY,close_minute integer NOT NULL CHECK(close_minute BETWEEN 571 AND 960));
ALTER TABLE private.market_early_closes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.market_early_closes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON private.market_early_closes TO service_role;
INSERT INTO private.market_early_closes VALUES ('2026-11-27',780),('2026-12-24',780),('2027-11-26',780),('2028-07-03',780),('2028-11-24',780) ON CONFLICT(date) DO UPDATE SET close_minute=excluded.close_minute;

INSERT INTO private.demo_users(user_id,reason)
SELECT id,'legacy seeded demo identity' FROM auth.users
WHERE email LIKE 'dummy\_%@bhsl.local' ESCAPE '\'
ON CONFLICT(user_id) DO NOTHING;
UPDATE public.paper_accounts SET is_demo=true
WHERE user_id IN (SELECT user_id FROM private.demo_users) AND NOT is_demo;
CREATE UNIQUE INDEX IF NOT EXISTS paper_accounts_live_nickname_unique
ON public.paper_accounts(lower(nickname)) WHERE nickname IS NOT NULL AND NOT is_demo;

CREATE OR REPLACE FUNCTION private.paper_challenge_deadline(p_week_end date)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $deadline$
 SELECT (p_week_end + coalesce((SELECT close_minute FROM private.market_early_closes WHERE date=p_week_end),960) * interval '1 minute') AT TIME ZONE 'America/New_York';
$deadline$;
REVOKE ALL ON FUNCTION private.paper_challenge_deadline(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.paper_challenge_deadline(date) TO service_role;

CREATE OR REPLACE FUNCTION public.execute_paper_action(
  p_user_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb,
  p_request_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $action$
#variable_conflict use_variable
<<paper_action>>
DECLARE
  a public.paper_accounts%ROWTYPE;
  pos public.paper_positions%ROWTYPE;
  q public.stock_prices%ROWTYPE;
  ch public.paper_challenges%ROWTYPE;
  receipt private.paper_action_receipts%ROWTYPE;
  result jsonb;
  fingerprint text := md5(p_action || (coalesce(p_payload,'{}'::jsonb)-'quote_fetched_at')::text);
  ticker text;
  side text;
  quantity numeric;
  lev integer;
  effective numeric;
  margin numeric;
  debt numeric;
  repay numeric;
  proceeds numeric;
  cost numeric;
  pnl numeric;
  balance numeric;
  total_value numeric;
  reward numeric;
  streak integer;
  name text;
  week_start date := date_trunc('week',now() AT TIME ZONE 'America/New_York')::date;
  snapshot jsonb;
  missing_quotes integer;
  challenge_id bigint;
  challenge_deadline timestamptz;
  picks jsonb;
  hours_left numeric;
  until_date date;
BEGIN
  p_payload := coalesce(p_payload,'{}'::jsonb);
  IF p_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id)
    OR EXISTS(SELECT 1 FROM private.demo_users WHERE user_id=p_user_id) THEN
    RAISE EXCEPTION 'This identity cannot use the live paper market' USING ERRCODE='P0403';
  END IF;
  IF jsonb_typeof(coalesce(p_payload,'{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Invalid action payload' USING ERRCODE='P0400';
  END IF;
  -- The account row is the first lock for every mutation. Concurrent initial
  -- INSERTs also serialize through the primary key before the row lock.
  INSERT INTO public.paper_accounts(user_id,cash_balance) VALUES(p_user_id,1000)
  ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO STRICT a FROM public.paper_accounts WHERE user_id=p_user_id FOR UPDATE;
  IF a.is_demo THEN
    RAISE EXCEPTION 'Demo accounts are isolated from the live market' USING ERRCODE='P0403';
  END IF;
  IF p_request_id IS NOT NULL THEN
    SELECT * INTO receipt FROM private.paper_action_receipts
    WHERE user_id=p_user_id AND request_id=p_request_id;
    IF FOUND THEN
      IF receipt.payload_hash <> fingerprint THEN
        RAISE EXCEPTION 'Idempotency key was used for a different request' USING ERRCODE='P0409';
      END IF;
      RETURN receipt.result || jsonb_build_object('replayed',true);
    END IF;
  END IF;

  IF p_action='init' THEN
    RETURN to_jsonb(a);

  ELSIF p_action IN ('buy','short','sell','cover') THEN
    ticker := upper(btrim(coalesce(p_payload->>'ticker','')));
    IF ticker='' OR jsonb_typeof(p_payload->'shares') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'ticker and shares (> 0) are required' USING ERRCODE='P0400';
    END IF;
    quantity := (p_payload->>'shares')::numeric;
    IF quantity<=0 OR quantity>1e15 OR quantity::text IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'shares must be a positive finite number' USING ERRCODE='P0400';
    END IF;
    IF a.status IN ('suspended','liquidated') THEN
      RAISE EXCEPTION 'Account suspended. Trading resumes next month.' USING ERRCODE='P0403';
    END IF;
    SELECT * INTO q FROM public.stock_prices WHERE stock_prices.ticker=ticker;
    IF NOT FOUND OR q.price<=0 OR q.price::text IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'Price unavailable' USING ERRCODE='P0404';
    END IF;
    IF q.fetched_at IS NULL OR q.fetched_at>now()+interval '5 minutes'
      OR q.fetched_at<now()-(CASE WHEN ticker LIKE '%-USD' THEN interval '20 minutes' ELSE interval '4 days' END) THEN
      RAISE EXCEPTION 'Price update delayed. Please try again after quotes refresh.' USING ERRCODE='P0503';
    END IF;
    -- The API supplies this value after its exchange-calendar freshness check.
    -- A quote update between validation and execution requires a fresh request.
    IF p_payload ? 'quote_fetched_at' AND q.fetched_at IS DISTINCT FROM (p_payload->>'quote_fetched_at')::timestamptz THEN
      RAISE EXCEPTION 'Quote changed. Please retry with the latest quote.' USING ERRCODE='P0409';
    END IF;
    side := CASE WHEN p_action IN ('buy','sell') THEN 'long' ELSE 'short' END;
    SELECT * INTO pos FROM public.paper_positions
    WHERE user_id=p_user_id AND paper_positions.ticker=ticker AND paper_positions.side=side FOR UPDATE;
    IF p_action IN ('buy','short') THEN
      IF a.status='margin_call' AND a.margin_call_at<=now()-interval '24 hours' THEN
        RAISE EXCEPTION 'Margin-call deadline passed. Refresh your portfolio before opening positions.' USING ERRCODE='P0403';
      END IF;
      IF NOT EXISTS(SELECT 1 FROM public.stocks s WHERE s.ticker=ticker AND s.is_active) THEN
        RAISE EXCEPTION 'Ticker not found or inactive' USING ERRCODE='P0404';
      END IF;
      IF p_payload ? 'leverage' AND jsonb_typeof(p_payload->'leverage')<>'number' THEN
        RAISE EXCEPTION 'Invalid leverage' USING ERRCODE='P0400';
      END IF;
      lev := floor(coalesce((p_payload->>'leverage')::numeric,1));
      IF lev NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION 'Leverage must be between 1 and 100' USING ERRCODE='P0400';
      END IF;
      margin := quantity*q.price;
      IF margin<0.01 THEN
        RAISE EXCEPTION 'Minimum order value is $0.01' USING ERRCODE='P0400';
      END IF;
      IF margin>a.cash_balance THEN
        RAISE EXCEPTION 'Insufficient margin' USING ERRCODE='P0400';
      END IF;
      effective := quantity*lev;
      debt := margin*(lev-1);
      IF pos.id IS NULL THEN
        INSERT INTO public.paper_positions(user_id,ticker,side,shares,avg_cost,borrowed,leverage)
        VALUES(p_user_id,ticker,side,effective,q.price,debt,lev);
      ELSE
        UPDATE public.paper_positions SET
          shares=pos.shares+effective,
          avg_cost=(pos.shares*pos.avg_cost+effective*q.price)/(pos.shares+effective),
          borrowed=pos.borrowed+debt,
          leverage=CASE WHEN pos.borrowed+debt>0 THEN lev ELSE 1 END,
          updated_at=now()
        WHERE id=pos.id AND paper_positions.side=side;
      END IF;
      balance := a.cash_balance-margin;
      UPDATE public.paper_accounts SET cash_balance=balance WHERE user_id=p_user_id;
      INSERT INTO public.paper_transactions(user_id,ticker,side,shares,price,total,leverage)
      VALUES(p_user_id,ticker,p_action,effective,q.price,margin,lev);
      result := jsonb_build_object('ok',true,'ticker',ticker,'side',p_action,'shares',effective,
        'price',q.price,'priceFetchedAt',q.fetched_at,'margin',margin,'borrowed',debt,'leverage',lev,'cashBalance',balance);
    ELSE
      IF pos.id IS NULL OR quantity>pos.shares+0.000001 THEN
        RAISE EXCEPTION 'No position or insufficient shares' USING ERRCODE='P0400';
      END IF;
      quantity := least(quantity,pos.shares);
      IF pos.shares-quantity<=0.000001 OR (pos.shares-quantity)*q.price<0.01 THEN quantity:=pos.shares; END IF;
      repay := pos.borrowed*quantity/pos.shares;
      cost := quantity*pos.avg_cost;
      proceeds := CASE WHEN side='long' THEN quantity*q.price-repay ELSE cost-repay+(pos.avg_cost-q.price)*quantity END;
      pnl := CASE WHEN side='long' THEN (q.price-pos.avg_cost)*quantity ELSE (pos.avg_cost-q.price)*quantity END;
      IF quantity=pos.shares THEN
        DELETE FROM public.paper_positions WHERE id=pos.id;
      ELSE
        UPDATE public.paper_positions SET shares=pos.shares-quantity,borrowed=pos.borrowed-repay,updated_at=now() WHERE id=pos.id;
      END IF;
      -- A leveraged loss is an account liability. Clamping each close to zero
      -- lets a hedged account discard the losing leg and keep the winning leg.
      balance := a.cash_balance+proceeds;
      UPDATE public.paper_accounts SET cash_balance=balance WHERE user_id=p_user_id;
      INSERT INTO public.paper_transactions(user_id,ticker,side,shares,price,total,leverage)
      VALUES(p_user_id,ticker,p_action,quantity,q.price,proceeds,pos.leverage);
      result := jsonb_build_object('ok',true,'ticker',ticker,'side',p_action,'shares',quantity,
        'price',q.price,'priceFetchedAt',q.fetched_at,'grossProceeds',quantity*q.price,'costToCover',quantity*q.price,
        'borrowedRepay',repay,'marginReturned',cost-repay,'netProceeds',proceeds,'realizedPnl',pnl,
        'cashBalance',balance,'lossWriteOff',0);
    END IF;

  ELSIF p_action='checkin' THEN
    IF a.last_checkin=(now() AT TIME ZONE 'UTC')::date THEN
      result:=jsonb_build_object('alreadyCheckedIn',true,'reward',0,'streak',a.streak,'cashBalance',a.cash_balance);
    ELSE
      streak:=CASE WHEN a.last_checkin=(now() AT TIME ZONE 'UTC')::date-1 THEN a.streak+1 ELSE 1 END;
      IF streak>10 THEN streak:=1; END IF;
      reward:=100+streak*20+CASE WHEN streak=10 THEN 200 ELSE 0 END;
      UPDATE public.paper_accounts SET cash_balance=cash_balance+reward,last_checkin=(now() AT TIME ZONE 'UTC')::date,
        streak=streak WHERE user_id=p_user_id RETURNING cash_balance INTO balance;
      result:=jsonb_build_object('reward',reward,'streak',streak,'cashBalance',balance);
    END IF;

  ELSIF p_action='claim_roast' THEN
    INSERT INTO public.paper_ai_usage(user_id,date,count) VALUES(p_user_id,(now() AT TIME ZONE 'UTC')::date,1)
    ON CONFLICT(user_id,date) DO UPDATE SET count=paper_ai_usage.count+1 WHERE paper_ai_usage.count<1
    RETURNING count INTO lev;
    IF NOT FOUND THEN RAISE EXCEPTION 'Daily portfolio analysis limit reached. Try again tomorrow.' USING ERRCODE='P0429'; END IF;
    result:=jsonb_build_object('claimed',true);

  ELSIF p_action='refund_roast' THEN
    DELETE FROM public.paper_ai_usage WHERE user_id=p_user_id AND date=(now() AT TIME ZONE 'UTC')::date;
    result:=jsonb_build_object('refunded',true);

  ELSIF p_action='nickname' THEN
    name:=btrim(coalesce(p_payload->>'nickname',''));
    IF length(name) NOT BETWEEN 3 AND 20 THEN
      RAISE EXCEPTION 'Nickname must be between 3 and 20 characters.' USING ERRCODE='P0400';
    END IF;
    IF a.nickname_updated_at>now()-interval '30 days' THEN
      RAISE EXCEPTION 'You can only change your nickname once every 30 days.' USING ERRCODE='P0429';
    END IF;
    IF EXISTS(SELECT 1 FROM public.paper_accounts WHERE lower(nickname)=lower(name) AND user_id<>p_user_id AND NOT is_demo) THEN
      RAISE EXCEPTION 'This nickname is already taken.' USING ERRCODE='P0409';
    END IF;
    UPDATE public.paper_accounts SET nickname=name,nickname_updated_at=now() WHERE user_id=p_user_id;
    result:=jsonb_build_object('ok',true,'nickname',name);

  ELSIF p_action='claim_reward' THEN
    challenge_id:=nullif(p_payload->>'challenge_id','')::bigint;
    SELECT * INTO ch FROM public.paper_challenges WHERE user_id=p_user_id
      AND (CASE WHEN challenge_id IS NOT NULL THEN id=challenge_id ELSE paper_challenges.week_start=week_start END)
      ORDER BY id DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No challenge found' USING ERRCODE='P0404'; END IF;
    IF ch.status<>'completed' THEN RAISE EXCEPTION 'Challenge not yet completed' USING ERRCODE='P0400'; END IF;
    IF ch.reward_claimed THEN
      result:=jsonb_build_object('ok',true,'claimed',true,'reward',0,'alreadyClaimed',true,'cashBalance',a.cash_balance);
    ELSE
      reward:=greatest(0,coalesce(ch.reward_usd,0));
      UPDATE public.paper_accounts SET cash_balance=cash_balance+reward WHERE user_id=p_user_id RETURNING cash_balance INTO balance;
      UPDATE public.paper_challenges SET reward_claimed=true WHERE id=ch.id;
      result:=jsonb_build_object('ok',true,'claimed',true,'reward',reward,'cashBalance',balance);
    END IF;

  ELSIF p_action='challenge_submit' THEN
    SELECT * INTO ch FROM public.paper_challenges WHERE user_id=p_user_id AND paper_challenges.week_start=week_start FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No challenge found for this week' USING ERRCODE='P0404'; END IF;
    IF ch.status<>'active' THEN RAISE EXCEPTION 'Challenge already submitted or expired' USING ERRCODE='P0400'; END IF;
    IF now() >= private.paper_challenge_deadline(ch.week_end) THEN
      RAISE EXCEPTION 'Deadline passed (Friday market close)' USING ERRCODE='P0400';
    END IF;
    picks:=p_payload->'picks';
    IF jsonb_typeof(picks) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Submit exactly five predictions' USING ERRCODE='P0400';
    END IF;
    IF jsonb_array_length(picks)<>5
      OR (SELECT count(DISTINCT x->>'ticker') FROM jsonb_array_elements(picks)x)<>5
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(picks)x WHERE x->>'direction' IS NULL OR x->>'direction' NOT IN ('up','down')
        OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(ch.picks)y WHERE y->>'ticker'=x->>'ticker')) THEN
      RAISE EXCEPTION 'Submit one direction for each of the five assigned picks' USING ERRCODE='P0400';
    END IF;
    SELECT jsonb_agg(x||jsonb_build_object('direction',(SELECT y->>'direction' FROM jsonb_array_elements(picks)y WHERE y->>'ticker'=x->>'ticker')))
      INTO picks FROM jsonb_array_elements(ch.picks)x;
    UPDATE public.paper_challenges SET picks=paper_action.picks,status='pending',submitted_at=now() WHERE id=ch.id;
    result:=jsonb_build_object('ok',true,'status','pending','picks',picks);

  ELSIF p_action='challenge_create' THEN
    SELECT * INTO ch FROM public.paper_challenges WHERE user_id=p_user_id AND paper_challenges.week_start=week_start;
    IF FOUND AND (ch.status<>'active' OR jsonb_array_length(coalesce(ch.picks,'[]'))=5) THEN RETURN to_jsonb(ch); END IF;
    SELECT jsonb_agg(jsonb_build_object('ticker',x.ticker,'base_price',x.price,'base_fetched_at',x.fetched_at,'direction',NULL,'final_price',NULL,'correct',NULL))
      INTO picks FROM (SELECT s.ticker,quotes.price,quotes.fetched_at FROM public.stocks s JOIN public.stock_prices quotes USING(ticker)
        WHERE s.is_active AND s.ticker IN (SELECT jsonb_array_elements_text(coalesce(p_payload->'eligible_tickers','[]'::jsonb))) AND quotes.price>0 AND quotes.fetched_at>now()-(CASE WHEN s.sector='Cryptocurrency' THEN interval '20 minutes' ELSE interval '4 days' END)
        ORDER BY random() LIMIT 5)x;
    IF coalesce(jsonb_array_length(picks),0)<5 THEN RAISE EXCEPTION 'Not enough price data to generate challenge' USING ERRCODE='P0503'; END IF;
    IF ch.id IS NOT NULL THEN DELETE FROM public.paper_challenges WHERE id=ch.id AND status='active'; END IF;
    challenge_deadline:=private.paper_challenge_deadline(week_start+4);
    INSERT INTO public.paper_challenges(user_id,ticker,challenge_type,target_pct,week_start,week_end,entry_price,picks,status,reward_usd)
    VALUES(p_user_id,picks->0->>'ticker','prediction',0,week_start,week_start+4,(picks->0->>'base_price')::numeric,picks,CASE WHEN now()>=challenge_deadline THEN 'expired' ELSE 'active' END,0)
    RETURNING * INTO ch;
    result:=to_jsonb(ch);

  ELSIF p_action='admin_adjust' THEN
    reward:=(p_payload->>'delta')::numeric;
    IF reward IS NULL OR reward NOT IN (-1000000,-100000,-10000,-1000,1000,10000,100000,1000000) THEN
      RAISE EXCEPTION 'Invalid adjustment' USING ERRCODE='P0400'; END IF;
    UPDATE public.paper_accounts SET cash_balance=greatest(0,cash_balance+reward) WHERE user_id=p_user_id RETURNING cash_balance INTO balance;
    result:=jsonb_build_object('cashBalance',balance);

  ELSIF p_action='admin_revive' THEN
    UPDATE public.paper_accounts SET cash_balance=greatest(1000,cash_balance),status='active',margin_call_at=NULL,suspended_until=NULL
      WHERE user_id=p_user_id RETURNING cash_balance INTO balance;
    result:=jsonb_build_object('status','active','cashBalance',balance);

  ELSIF p_action='liquidation' THEN
    IF a.status IN ('suspended','liquidated') THEN
      IF a.suspended_until IS NOT NULL AND a.suspended_until<=(now() AT TIME ZONE 'UTC')::date THEN
        DELETE FROM public.paper_positions WHERE user_id=p_user_id;
        UPDATE public.paper_accounts SET cash_balance=greatest(cash_balance,1000),status='active',margin_call_at=NULL,suspended_until=NULL
          WHERE user_id=p_user_id RETURNING cash_balance INTO balance;
        result:=jsonb_build_object('status','restarted','cashBalance',balance,'message','Suspension ended. Your account is active.');
      ELSE
        result:=jsonb_build_object('status','suspended','suspendedUntil',a.suspended_until,'cashBalance',a.cash_balance,
          'message','Account suspended. Daily check-ins remain available.');
      END IF;
    ELSE
      SELECT count(*) FILTER(WHERE quotes.ticker IS NULL OR quotes.price<=0 OR quotes.fetched_at IS NULL OR quotes.fetched_at<now()-(CASE WHEN p.ticker LIKE '%-USD' THEN interval '20 minutes' ELSE interval '4 days' END)),
        coalesce(sum(CASE WHEN p.side='short' THEN p.shares*p.avg_cost-p.borrowed+(p.avg_cost-quotes.price)*p.shares ELSE p.shares*quotes.price-p.borrowed END),0)
        INTO missing_quotes,total_value FROM public.paper_positions p LEFT JOIN public.stock_prices quotes USING(ticker) WHERE p.user_id=p_user_id;
      IF missing_quotes>0 THEN
        result:=jsonb_build_object('status','price_unavailable','message','Liquidation check is waiting for fresh quotes.');
      ELSE
        total_value:=a.cash_balance+total_value;
        IF total_value<50 AND a.status='margin_call' AND a.margin_call_at<=now()-interval '24 hours' THEN
          SELECT coalesce(jsonb_agg(jsonb_build_object('ticker',p.ticker,'shares',p.shares,'avg_cost',p.avg_cost,'side',p.side,
            'borrowed',p.borrowed,'leverage',p.leverage,'current_price',quotes.price,'market_value',p.shares*quotes.price)), '[]'::jsonb)
            INTO snapshot FROM public.paper_positions p JOIN public.stock_prices quotes USING(ticker) WHERE p.user_id=p_user_id;
          INSERT INTO public.paper_graveyard(user_id,final_value,cash_at_death,positions_json,liquidated_at,month)
            VALUES(p_user_id,total_value,a.cash_balance,snapshot,now(),to_char(now() AT TIME ZONE 'UTC','YYYY-MM'));
          INSERT INTO public.paper_transactions(user_id,ticker,side,shares,price,total,leverage)
            SELECT p_user_id,p.ticker,CASE WHEN p.side='short' THEN 'cover' ELSE 'sell' END,p.shares,quotes.price,
              CASE WHEN p.side='short' THEN p.shares*p.avg_cost-p.borrowed+(p.avg_cost-quotes.price)*p.shares ELSE p.shares*quotes.price-p.borrowed END,p.leverage
            FROM public.paper_positions p JOIN public.stock_prices quotes USING(ticker) WHERE p.user_id=p_user_id;
          DELETE FROM public.paper_positions WHERE user_id=p_user_id;
          until_date:=(date_trunc('month',now() AT TIME ZONE 'UTC')+interval '1 month')::date;
          balance:=greatest(0,total_value);
          UPDATE public.paper_accounts SET cash_balance=balance,status='suspended',margin_call_at=NULL,liquidation_count=liquidation_count+1,
            last_liquidation_at=now(),suspended_until=until_date WHERE user_id=p_user_id;
          result:=jsonb_build_object('status','suspended','suspendedUntil',until_date,'cashBalance',balance,'lossWriteOff',greatest(0,-total_value),
            'liquidationCount',a.liquidation_count+1,'message','Liquidated. Trading resumes next month.');
        ELSIF total_value<50 THEN
          IF a.status<>'margin_call' THEN
            UPDATE public.paper_accounts SET status='margin_call',margin_call_at=now() WHERE user_id=p_user_id;
            hours_left:=24;
          ELSE hours_left:=greatest(0,24-extract(epoch FROM now()-a.margin_call_at)/3600); END IF;
          result:=jsonb_build_object('status','margin_call','totalValue',total_value,'hoursLeft',round(hours_left,1),
            'message','Recover above $50 before the margin-call timer expires.');
        ELSE
          IF a.status='margin_call' THEN UPDATE public.paper_accounts SET status='active',margin_call_at=NULL WHERE user_id=p_user_id; END IF;
          result:=jsonb_build_object('status',CASE WHEN total_value<100 THEN 'warning' ELSE 'ok' END,'totalValue',total_value);
        END IF;
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported paper action' USING ERRCODE='P0400';
  END IF;
  IF p_request_id IS NOT NULL THEN
    INSERT INTO private.paper_action_receipts(user_id,request_id,payload_hash,result)
    VALUES(p_user_id,p_request_id,fingerprint,result);
  END IF;
  RETURN result;
END;
$action$;
REVOKE ALL ON FUNCTION public.execute_paper_action(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.execute_paper_action(uuid,text,jsonb,uuid) TO service_role;

-- Settle all ended weeks using that week's recorded daily closes, never today's
-- quote. Crypto Friday daily closes become available at Saturday 00:00 UTC.
CREATE OR REPLACE FUNCTION public.resolve_paper_challenges(p_user_id uuid DEFAULT NULL, p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $resolve$
DECLARE
  c public.paper_challenges%ROWTYPE; candidate record; pick jsonb; updated_picks jsonb;
  final_close numeric; final_date date; correct_count integer; missing boolean;
  settled integer:=0; expired integer:=0; waiting integer:=0;
BEGIN
  FOR candidate IN SELECT id,user_id FROM public.paper_challenges
    WHERE status IN ('active','pending') AND (p_user_id IS NULL OR user_id=p_user_id)
      AND now() >= ((week_end+1)::text||' 00:00:00 UTC')::timestamptz
    ORDER BY user_id,id LIMIT least(greatest(p_limit,1),500)
  LOOP
    -- Same lock order as trade, claim and check-in.
    PERFORM 1 FROM public.paper_accounts WHERE user_id=candidate.user_id FOR UPDATE;
    SELECT * INTO c FROM public.paper_challenges WHERE id=candidate.id FOR UPDATE;
    IF c.status NOT IN ('active','pending') THEN CONTINUE; END IF;
    IF c.status='active' THEN
      UPDATE public.paper_challenges SET status='expired',resolution_error=NULL WHERE id=c.id;
      expired:=expired+1; CONTINUE;
    END IF;
    IF jsonb_typeof(c.picks) IS DISTINCT FROM 'array' OR jsonb_array_length(c.picks)<>5 THEN
      UPDATE public.paper_challenges SET resolution_error='Missing original prediction picks' WHERE id=c.id;
      waiting:=waiting+1; CONTINUE;
    END IF;
    updated_picks:='[]'::jsonb; correct_count:=0; missing:=false;
    FOR pick IN SELECT value FROM jsonb_array_elements(c.picks) LOOP
      SELECT h.close,h.date INTO final_close,final_date FROM public.price_history_long h
        WHERE h.ticker=pick->>'ticker' AND h.date<=c.week_end AND h.date>=c.week_end-7
          AND (h.ticker LIKE '%-USD' OR (extract(isodow FROM h.date)<=5 AND NOT EXISTS(SELECT 1 FROM private.market_holidays x WHERE x.date=h.date)))
        ORDER BY h.date DESC LIMIT 1;
      IF final_close IS NULL OR final_close<=0 OR coalesce((pick->>'base_price')::numeric,0)<=0 THEN
        missing:=true; EXIT;
      END IF;
      pick:=pick||jsonb_build_object('final_price',final_close,'final_date',final_date,
        'correct',CASE WHEN pick->>'direction'='up' THEN final_close>(pick->>'base_price')::numeric
          WHEN pick->>'direction'='down' THEN final_close<(pick->>'base_price')::numeric ELSE false END);
      IF (pick->>'correct')::boolean THEN correct_count:=correct_count+1; END IF;
      updated_picks:=updated_picks||jsonb_build_array(pick);
    END LOOP;
    IF missing THEN
      UPDATE public.paper_challenges SET resolution_error='Historical closing price unavailable; reward remains unclaimed' WHERE id=c.id;
      waiting:=waiting+1;
    ELSE
      UPDATE public.paper_challenges SET picks=updated_picks,status='completed',resolution_error=NULL,
        reward_usd=CASE correct_count WHEN 5 THEN 1000 WHEN 4 THEN 600 ELSE correct_count*100 END WHERE id=c.id;
      settled:=settled+1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('settled',settled,'expired',expired,'waiting',waiting);
END;
$resolve$;
REVOKE ALL ON FUNCTION public.resolve_paper_challenges(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_paper_challenges(uuid,integer) TO service_role;

NOTIFY pgrst, 'reload schema';
