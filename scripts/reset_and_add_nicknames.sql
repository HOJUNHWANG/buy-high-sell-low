-- 실행 전 주의: 기존 모의투자 거래 기록, 포트폴리오, 챌린지가 모두 삭제되고 초기화됩니다.

-- 1. 모든 모의투자(Paper Trading) 및 계산기 데이터 대청소
TRUNCATE TABLE paper_transactions RESTART IDENTITY CASCADE;
TRUNCATE TABLE paper_positions RESTART IDENTITY CASCADE;
TRUNCATE TABLE paper_challenges RESTART IDENTITY CASCADE;
TRUNCATE TABLE whatif_scenarios RESTART IDENTITY CASCADE;

-- 2. 유저 테이블(paper_accounts)에 닉네임 기능 추가
ALTER TABLE paper_accounts ADD COLUMN IF NOT EXISTS nickname TEXT UNIQUE;
ALTER TABLE paper_accounts ADD COLUMN IF NOT EXISTS nickname_updated_at TIMESTAMPTZ;

-- 3. 기존 테스트 유저들 강제 리셋 (현금 1,000달러, 상태 복구) 및 디폴트 닉네임 부여
UPDATE paper_accounts 
SET 
  cash_balance = 1000,
  status = 'active',
  nickname = COALESCE(nickname, 'Trader_' || UPPER(SUBSTRING(user_id::text, 1, 6)))
WHERE user_id IS NOT NULL;
