-- ============================================================
-- Reset dummy/test leaderboard users to safe portfolios
-- 청산 위험 없는 랜덤 포트폴리오 + 높은 현금으로 초기화
--
-- ⚠️  실행 전 주의:
--   1. 아래 WHERE 절을 확인해 적용 범위 조절 가능
--   2. 실제 유저 제외하려면 WHERE user_id NOT IN ('실제-uuid-here') 추가
--   3. 트랜잭션 히스토리도 같이 지워짐
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────
-- Step 1: 계정 상태 초기화 + 안전한 현금 잔액 부여
--   hashtext를 이용해 유저마다 다른 금액 ($2,500 ~ $9,500)
-- ──────────────────────────────────────────────
UPDATE paper_accounts SET
  cash_balance       = 2500 + (ABS(hashtext(user_id::text)) % 7000),
  status             = 'active',
  margin_call_at     = NULL,
  suspended_until    = NULL,
  liquidation_count  = 0,
  last_liquidation_at = NULL;

-- ──────────────────────────────────────────────
-- Step 2: 기존 포지션 + 거래 내역 초기화
-- ──────────────────────────────────────────────
DELETE FROM paper_positions;
DELETE FROM paper_transactions;

-- ──────────────────────────────────────────────
-- Step 3: 유저마다 랜덤하게 3~4개 블루칩 long 포지션 부여
--   - leverage=1, borrowed=0 → 청산 위험 없음
--   - hashtext 기반 결정론적 랜덤 → 같은 유저면 항상 같은 포지션
--   - 보유 주식 수: 2~9주 (유저+티커 해시 기반)
--
--   ticker pool: 15개 대형주 중 각 유저에게 ~4개 할당
--   slot = (urow + ticker_idx) % 4 < 2  → 4개 주기로 2개 선택
--   추가로 hashtext % 5 < 3 필터로 ticker마다 독립 60% 확률 적용
-- ──────────────────────────────────────────────
INSERT INTO paper_positions (user_id, ticker, shares, avg_cost, leverage, borrowed, side)
WITH ticker_pool AS (
  SELECT
    sp.ticker,
    sp.price,
    ROW_NUMBER() OVER (ORDER BY sp.ticker) - 1 AS tidx
  FROM stock_prices sp
  WHERE sp.ticker IN (
    'AAPL', 'AMZN', 'GOOGL', 'JNJ', 'JPM',
    'KO',   'META', 'MSFT',  'NVDA', 'PG',
    'TSLA', 'UNH',  'V',     'WMT',  'XOM'
  )
),
user_rows AS (
  SELECT
    user_id,
    ROW_NUMBER() OVER (ORDER BY user_id) - 1 AS urow
  FROM paper_accounts
),
assignments AS (
  SELECT
    ur.user_id,
    tp.ticker,
    tp.price                                                      AS avg_cost,
    2 + (ABS(hashtext(ur.user_id::text || tp.ticker)) % 8)       AS shares,
    (ur.urow + tp.tidx) % 4                                       AS slot,
    ABS(hashtext(ur.user_id::text || tp.ticker || 'x')) % 5      AS coin
  FROM user_rows ur
  CROSS JOIN ticker_pool tp
)
SELECT
  user_id,
  ticker,
  shares,
  avg_cost,
  1    AS leverage,
  0    AS borrowed,
  'long' AS side
FROM assignments
WHERE slot < 2        -- ~2개/유저 (4주기 중 2)
   OR coin < 2        -- 추가 독립 40% 확률로 더 선택 (총 3~4개 예상)
ON CONFLICT (user_id, ticker, side) DO NOTHING;

-- ──────────────────────────────────────────────
-- 확인용 (실행 후 Supabase SQL Editor에서 결과 확인)
-- ──────────────────────────────────────────────
-- SELECT pa.user_id, pa.cash_balance, pa.status, COUNT(pp.id) AS positions
-- FROM paper_accounts pa
-- LEFT JOIN paper_positions pp ON pp.user_id = pa.user_id
-- GROUP BY pa.user_id, pa.cash_balance, pa.status
-- ORDER BY pa.cash_balance DESC;

COMMIT;
