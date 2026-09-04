-- Run after the Fictional paper migration. Every fixture and trade rolls back.
BEGIN;
DO $test$
DECLARE
  u UUID := gen_random_uuid();
  other_u UUID := gen_random_uuid();
  symbol TEXT := '__PAPER_TEST_' || upper(replace(gen_random_uuid()::text, '-', ''));
  request_id UUID := gen_random_uuid();
  fill JSONB;
  replay JSONB;
  board JSONB;
  n INTEGER;
  balance NUMERIC;
BEGIN
  INSERT INTO auth.users(id, email) VALUES
    (u, u::text || '@fictional-test.invalid'), (other_u, other_u::text || '@fictional-test.invalid');
  INSERT INTO public.fictional_companies(ticker, name, source, exchange, sector, risk,
    market_cap, base_price, float_shares, volatility, influence, technology, color, accent, note)
  SELECT symbol, name, source, exchange, sector, risk, market_cap, base_price,
    float_shares, volatility, influence, technology, color, accent, note
  FROM public.fictional_companies LIMIT 1;
  INSERT INTO public.fictional_prices(ticker, price, change_pct, volume, fetched_at)
    VALUES (symbol, 100, 0, 0, now());
  EXECUTE 'SET LOCAL ROLE service_role';

  -- The first order initializes the independent account and fills at stored price.
  fill := public.execute_fictional_paper_trade(u, symbol, 'buy', 'dollars', 500, request_id);
  ASSERT (fill->>'shares')::numeric = 5 AND (fill->>'price')::numeric = 100;
  ASSERT (fill->>'cash_balance_after')::numeric = 500;
  ASSERT NOT fill ? 'user_id' AND NOT fill ? 'request_id';

  UPDATE public.fictional_prices SET fetched_at = now() - interval '2 hours' WHERE ticker = symbol;
  replay := public.execute_fictional_paper_trade(u, symbol, 'buy', 'dollars', 500, request_id);
  ASSERT replay = fill, 'A retry must return the original fill even after quotes expire';
  BEGIN
    PERFORM public.execute_fictional_paper_trade(u, symbol, 'buy', 'dollars', 501, request_id);
    RAISE EXCEPTION 'Expected duplicate-key conflict';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  BEGIN
    PERFORM public.execute_fictional_paper_trade(other_u, symbol, 'buy', 'dollars', 100, gen_random_uuid());
    RAISE EXCEPTION 'Expected stale-quote rejection';
  EXCEPTION WHEN SQLSTATE 'PT503' THEN NULL;
  END;
  ASSERT NOT EXISTS (SELECT 1 FROM public.fictional_paper_accounts WHERE user_id = other_u),
    'Rejected initial order must roll back account creation';

  UPDATE public.fictional_prices SET price = 125, fetched_at = now() WHERE ticker = symbol;
  PERFORM public.execute_fictional_paper_trade(u, symbol, 'buy', 'shares', 2, gen_random_uuid());
  SELECT cash_balance INTO balance FROM public.fictional_paper_accounts WHERE user_id = u;
  ASSERT balance = 250;
  ASSERT (SELECT shares = 7 AND abs(avg_cost - 750::numeric / 7) < 0.000000000001
    FROM public.fictional_paper_positions WHERE user_id = u AND ticker = symbol);
  BEGIN
    PERFORM public.execute_fictional_paper_trade(u, symbol, 'buy', 'dollars', 10000, gen_random_uuid());
    RAISE EXCEPTION 'Expected insufficient-cash rejection';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL;
  END;
  BEGIN
    PERFORM public.execute_fictional_paper_trade(u, symbol, 'sell', 'shares', 8, gen_random_uuid());
    RAISE EXCEPTION 'Expected insufficient-shares rejection';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL;
  END;
  SELECT count(*) INTO n FROM public.fictional_paper_transactions WHERE user_id = u;
  ASSERT n = 2, 'Retries and rejected orders cannot add ledger entries';
  ASSERT (SELECT cash_balance = 250 FROM public.fictional_paper_accounts WHERE user_id = u);

  UPDATE public.fictional_prices SET price = 150 WHERE ticker = symbol;
  fill := public.execute_fictional_paper_trade(u, symbol, 'sell', 'shares', 2, gen_random_uuid());
  ASSERT (fill->>'cash_balance_after')::numeric = 550;
  ASSERT abs((fill->>'realized_pnl')::numeric - 85.71428571) < 0.00000001;
  fill := public.execute_fictional_paper_trade(u, symbol, 'sell', 'all', 0, gen_random_uuid());
  ASSERT (fill->>'shares')::numeric = 5 AND (fill->>'cash_balance_after')::numeric = 1300;
  ASSERT NOT EXISTS (SELECT 1 FROM public.fictional_paper_positions WHERE user_id = u);
  fill := public.execute_fictional_paper_trade(other_u, symbol, 'buy', 'dollars', 100, gen_random_uuid());
  ASSERT (fill->>'shares')::numeric = 0.66666666, 'Dollar orders must support fractional shares';
  ASSERT NOT EXISTS (SELECT 1 FROM public.paper_accounts WHERE user_id IN (u, other_u));

  board := public.fictional_paper_leaderboard(u);
  ASSERT board->>'myRank' IS NOT NULL;
  ASSERT NOT board::text LIKE '%' || u::text || '%', 'Rankings cannot expose auth IDs';
  ASSERT NOT board::text LIKE '%@fictional-test.invalid%';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(board->'entries') e
    WHERE (e->>'isMe')::boolean AND (e->>'totalValue')::numeric = 1300);

  -- Real authenticated-role checks: own rows readable, writes and RPCs denied.
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.fictional_paper_accounts;
  ASSERT n = 1, 'RLS must hide other accounts';
  SELECT count(*) INTO n FROM public.fictional_paper_transactions;
  ASSERT n = 4, 'RLS must hide other trade histories';
  ASSERT NOT EXISTS (SELECT 1 FROM public.fictional_paper_positions);
  BEGIN
    UPDATE public.fictional_paper_accounts SET cash_balance = 999999 WHERE user_id = u;
    RAISE EXCEPTION 'Expected direct-write rejection';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.execute_fictional_paper_trade(other_u, symbol, 'buy', 'shares', 1, gen_random_uuid());
    RAISE EXCEPTION 'Expected RPC privilege rejection';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.fictional_paper_leaderboard(other_u);
    RAISE EXCEPTION 'Expected ranking RPC privilege rejection';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
END;
$test$;
ROLLBACK;
SELECT 'Fictional ledger, idempotency, valuation, rollback and RLS checks passed' AS result;
