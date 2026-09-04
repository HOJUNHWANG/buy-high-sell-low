-- A separate simulated ledger: no balances, symbols, or rankings are shared
-- with the real-market paper_* tables.
CREATE TABLE public.fictional_paper_accounts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  cash_balance NUMERIC(28,8) NOT NULL DEFAULT 1000
    CHECK (cash_balance >= 0 AND cash_balance < 'Infinity'::numeric),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.fictional_paper_positions (
  user_id UUID NOT NULL REFERENCES public.fictional_paper_accounts(user_id) ON DELETE CASCADE,
  ticker TEXT NOT NULL REFERENCES public.fictional_companies(ticker),
  shares NUMERIC(28,8) NOT NULL CHECK (shares > 0 AND shares < 'Infinity'::numeric),
  avg_cost NUMERIC(28,12) NOT NULL CHECK (avg_cost > 0 AND avg_cost < 'Infinity'::numeric),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ticker)
);
CREATE INDEX fictional_paper_positions_ticker_idx ON public.fictional_paper_positions(ticker);

CREATE TABLE public.fictional_paper_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.fictional_paper_accounts(user_id) ON DELETE CASCADE,
  ticker TEXT NOT NULL REFERENCES public.fictional_companies(ticker),
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  shares NUMERIC(28,8) NOT NULL CHECK (shares > 0 AND shares < 'Infinity'::numeric),
  price NUMERIC NOT NULL CHECK (price > 0 AND price < 'Infinity'::numeric),
  total NUMERIC(28,8) NOT NULL CHECK (total > 0 AND total < 'Infinity'::numeric),
  realized_pnl NUMERIC(28,8) NOT NULL DEFAULT 0,
  cash_balance_after NUMERIC(28,8) NOT NULL,
  price_fetched_at TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_id UUID NOT NULL,
  request_unit TEXT NOT NULL CHECK (request_unit IN ('dollars', 'shares', 'all')),
  request_amount NUMERIC NOT NULL,
  UNIQUE (user_id, request_id)
);
CREATE INDEX fictional_paper_tx_user_time_idx ON public.fictional_paper_transactions(user_id, executed_at DESC, id DESC);
CREATE INDEX fictional_paper_tx_ticker_idx ON public.fictional_paper_transactions(ticker);

ALTER TABLE public.fictional_paper_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fictional_paper_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fictional_paper_transactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.fictional_paper_accounts, public.fictional_paper_positions,
  public.fictional_paper_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fictional_paper_accounts, public.fictional_paper_positions,
  public.fictional_paper_transactions TO authenticated;
GRANT ALL ON public.fictional_paper_accounts, public.fictional_paper_positions,
  public.fictional_paper_transactions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.fictional_paper_transactions_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.fictional_paper_transactions_id_seq FROM PUBLIC, anon, authenticated;

CREATE POLICY fictional_paper_own_account ON public.fictional_paper_accounts
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY fictional_paper_own_positions ON public.fictional_paper_positions
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY fictional_paper_own_transactions ON public.fictional_paper_transactions
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- Called only by the authenticated API with its verified user ID. Row locking
-- serializes a user's orders; any exception rolls back cash, holdings and history.
CREATE FUNCTION public.execute_fictional_paper_trade(
  p_user_id UUID, p_ticker TEXT, p_side TEXT, p_unit TEXT,
  p_amount NUMERIC, p_request_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_account public.fictional_paper_accounts%ROWTYPE;
  v_position public.fictional_paper_positions%ROWTYPE;
  v_transaction public.fictional_paper_transactions%ROWTYPE;
  v_ticker TEXT := upper(trim(p_ticker));
  v_price NUMERIC;
  v_fetched_at TIMESTAMPTZ;
  v_shares NUMERIC;
  v_total NUMERIC;
  v_pnl NUMERIC := 0;
  v_balance NUMERIC;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR v_ticker IS NULL
     OR p_side IS NULL OR p_side NOT IN ('buy', 'sell')
     OR p_unit IS NULL OR p_unit NOT IN ('dollars', 'shares', 'all')
     OR p_amount IS NULL OR p_amount::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_amount > 1000000000000
     OR (p_unit = 'all' AND (p_side <> 'sell' OR p_amount <> 0))
     OR (p_unit <> 'all' AND p_amount <= 0) THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'Invalid Fictional order.';
  END IF;

  INSERT INTO public.fictional_paper_accounts(user_id) VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO STRICT v_account FROM public.fictional_paper_accounts
    WHERE user_id = p_user_id FOR UPDATE;

  SELECT * INTO v_transaction FROM public.fictional_paper_transactions
    WHERE user_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN
    IF v_transaction.ticker <> v_ticker OR v_transaction.side <> p_side
       OR v_transaction.request_unit <> p_unit OR v_transaction.request_amount <> p_amount THEN
      RAISE SQLSTATE 'PT409' USING MESSAGE = 'This request ID belongs to a different order.';
    END IF;
    RETURN to_jsonb(v_transaction) - ARRAY['user_id', 'request_id', 'request_unit', 'request_amount'];
  END IF;

  SELECT price, fetched_at INTO v_price, v_fetched_at FROM public.fictional_prices
    WHERE ticker = v_ticker;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE = 'Fictional stock quote not found.';
  END IF;
  IF v_price IS NULL OR v_price <= 0 OR v_price >= 'Infinity'::numeric
     OR v_fetched_at IS NULL OR v_fetched_at < now() - interval '90 minutes'
     OR v_fetched_at > now() + interval '1 minute' THEN
    RAISE SQLSTATE 'PT503' USING MESSAGE = 'Trading paused while the Fictional quote refreshes.';
  END IF;

  SELECT * INTO v_position FROM public.fictional_paper_positions
    WHERE user_id = p_user_id AND ticker = v_ticker FOR UPDATE;
  IF p_unit = 'all' THEN
    v_shares := coalesce(v_position.shares, 0);
  ELSIF p_unit = 'dollars' THEN
    v_shares := trunc(p_amount / v_price, 8);
  ELSE
    v_shares := trunc(p_amount, 8);
  END IF;
  IF v_shares <= 0 THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'Order is too small or there are no shares to sell.';
  END IF;

  IF p_side = 'sell' THEN
    IF v_position.shares IS NULL OR v_shares > v_position.shares THEN
      RAISE SQLSTATE 'PT400' USING MESSAGE = 'Not enough Fictional shares to sell.';
    END IF;
    IF (v_position.shares - v_shares) * v_price < 0.01 THEN
      v_shares := v_position.shares;
    END IF;
  END IF;
  v_total := round(v_shares * v_price, 8);
  IF v_total < 0.01 THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'Minimum order value is $0.01.';
  END IF;

  IF p_side = 'buy' THEN
    IF v_total > v_account.cash_balance THEN
      RAISE SQLSTATE 'PT400' USING MESSAGE = 'Insufficient Fictional cash balance.';
    END IF;
    v_balance := v_account.cash_balance - v_total;
    INSERT INTO public.fictional_paper_positions(user_id, ticker, shares, avg_cost)
      VALUES (p_user_id, v_ticker, v_shares, v_price)
      ON CONFLICT (user_id, ticker) DO UPDATE SET
        avg_cost = (fictional_paper_positions.shares * fictional_paper_positions.avg_cost
                    + EXCLUDED.shares * EXCLUDED.avg_cost)
                   / (fictional_paper_positions.shares + EXCLUDED.shares),
        shares = fictional_paper_positions.shares + EXCLUDED.shares,
        updated_at = now();
  ELSE
    v_balance := v_account.cash_balance + v_total;
    v_pnl := round(v_shares * (v_price - v_position.avg_cost), 8);
    IF v_shares = v_position.shares THEN
      DELETE FROM public.fictional_paper_positions WHERE user_id = p_user_id AND ticker = v_ticker;
    ELSE
      UPDATE public.fictional_paper_positions SET shares = shares - v_shares, updated_at = now()
        WHERE user_id = p_user_id AND ticker = v_ticker;
    END IF;
  END IF;
  UPDATE public.fictional_paper_accounts SET cash_balance = v_balance WHERE user_id = p_user_id;
  INSERT INTO public.fictional_paper_transactions(
    user_id, ticker, side, shares, price, total, realized_pnl, cash_balance_after,
    price_fetched_at, request_id, request_unit, request_amount
  ) VALUES (
    p_user_id, v_ticker, p_side, v_shares, v_price, v_total, v_pnl, v_balance,
    v_fetched_at, p_request_id, p_unit, p_amount
  ) RETURNING * INTO v_transaction;
  RETURN to_jsonb(v_transaction) - ARRAY['user_id', 'request_id', 'request_unit', 'request_amount'];
END;
$$;
REVOKE EXECUTE ON FUNCTION public.execute_fictional_paper_trade(UUID,TEXT,TEXT,TEXT,NUMERIC,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_fictional_paper_trade(UUID,TEXT,TEXT,TEXT,NUMERIC,UUID) TO service_role;

-- Aggregate inside Postgres so the REST row limit cannot truncate valuations.
-- Only a random display alias and aggregate results leave this service-only RPC.
CREATE FUNCTION public.fictional_paper_leaderboard(p_viewer UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  WITH values_by_user AS (
    SELECT a.user_id, a.public_id, a.created_at,
           a.cash_balance + coalesce(sum(p.shares * q.price), 0) AS total_value
    FROM public.fictional_paper_accounts a
    LEFT JOIN public.fictional_paper_positions p ON p.user_id = a.user_id
    LEFT JOIN public.fictional_prices q ON q.ticker = p.ticker
    WHERE EXISTS (SELECT 1 FROM public.fictional_paper_transactions t WHERE t.user_id = a.user_id)
    GROUP BY a.user_id
    HAVING count(p.ticker) = count(q.price)
       AND coalesce(bool_and(q.price > 0 AND q.price < 'Infinity'::numeric), true)
  ), ranked AS (
    SELECT *, row_number() OVER (ORDER BY total_value DESC, created_at, public_id) AS rank
    FROM values_by_user
  ), entries AS (
    SELECT rank, jsonb_build_object(
      'rank', rank, 'name', 'Trader ' || upper(left(public_id::text, 6)),
      'totalValue', total_value, 'pnl', total_value - 1000,
      'pnlPct', (total_value - 1000) / 10, 'isMe', coalesce(user_id = p_viewer, false)
    ) AS entry FROM ranked WHERE rank <= 50
  )
  SELECT jsonb_build_object(
    'entries', coalesce((SELECT jsonb_agg(entry ORDER BY rank) FROM entries), '[]'::jsonb),
    'myRank', (SELECT rank FROM ranked WHERE user_id = p_viewer),
    'totalCount', (SELECT count(*) FROM ranked)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fictional_paper_leaderboard(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fictional_paper_leaderboard(UUID) TO service_role;
