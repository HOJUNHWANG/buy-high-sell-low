# Disk I/O 개선 기록 — 2026-10-15

## 적용 상태

- 운영 Supabase `GlobalStock` (`idapkkkixnbdsfrvwzde`)에 두 마이그레이션 적용 완료.
  - `20261015213638_reduce_market_ingestion_io.sql`
  - `20261015213711_remove_duplicate_daily_price_constraint.sql`
- 운영 DB에서 서비스 역할로 SQL 회귀 검증 완료. 테스트 행과 유지보수 마커는 모두 롤백됨.
- 운영 수집기는 GitHub main의 코드를 사용한다. 배치 저장·뉴스·삭제 최적화는 이 변경이 main에 반영된 뒤 해당 워크플로가 실행될 때 적용된다.

## 유지하는 동작

실제 주식·ETF·코인 가격 수집은 10분 주기를 유지한다. 공급자 호출 수, 대기시간, 장 운영시간 필터, 장 마감·최종 정산 재조회는 바꾸지 않는다. 현재가는 가격이 같아도 `fetched_at`을 갱신하며, 장중 차트 기록도 가격이 같다는 이유로 생략하지 않는다. 기존 4분 중복 기록 방지 구간과 강제 정산 기록을 유지한다.

## 변경 내용

### 가격 저장

`scripts/market_storage.py`에서 공급자 배치 하나의 현재가 갱신, 최근 이력 확인, 이력 추가, 일봉 저장을 묶는다. 동일한 필드를 가진 정상 25종목에서는 기본 저장·중복 확인 요청이 100회에서 4회로 줄어든다. 이전 종가·이상치 관련 조회는 이 숫자에서 제외된다. 배치화가 저장 행 수나 전체 Disk I/O를 같은 비율로 줄인다는 뜻은 아니다.

일봉은 공급자가 보낸 필드 구성별로 나눠 저장한다. `open/high/low/volume`이 누락된 종목의 기존 값은 다른 종목의 필드 때문에 NULL로 덮어쓰지 않는다. 잘못된 가격·등락률·거래량은 종목별로 제외한다. 현재가 저장 실패는 작업 실패로 전파하며, 결과가 불명확한 이력 INSERT는 자동 재실행하지 않는다.

운영 DB의 두 BEFORE UPDATE 트리거는 실제·가상시장 일봉의 **전체 행 값이 동일할 때만** 행 갱신을 건너뛴다. 값이 달라지면 즉시 저장한다. 현재가 테이블에는 이 트리거를 설치하지 않는다. 행 잠금·트랜잭션 관련 I/O까지 없어지는 것은 아니다.

### 뉴스

수신한 후보 URL만 고유 인덱스로 조회한다. 이전의 7일 조회 제한을 없애 보존기간 전체에서 중복을 확인하고, 긴 URL은 요청 길이를 고려해 분할한다. 조회 이후 경합한 중복은 `ON CONFLICT (url) DO NOTHING`으로 처리한다. 기존 뉴스의 제목·요약·수신 시각을 덮어쓰지 않으며, 새 행이 추가되지 않으면 신규 기사 AI 생성도 하지 않는다. 기존 미요약 기사 보충 처리 정책은 유지한다.

### 정리와 인덱스

- Python 만료 데이터 삭제는 `return=minimal,count=exact`로 전체 행 반환을 피한다. 운영 SDK인 postgrest-py 0.16은 빈 204 응답의 count를 0으로 처리하므로, 응답 헤더의 정확한 건수를 읽는 작은 호환 처리를 사용한다. 건수 헤더가 없으면 성공 건수를 임의로 0이라고 기록하지 않는다.
- 가상시장 정리 RPC는 트랜잭션 advisory lock과 비공개 완료 마커로 최대 시간당 한 번 실행한다. 실패하면 완료 마커도 롤백된다. 기존 호출자는 그대로 사용할 수 있다. 기존 30일 장중 이력·이벤트, 45일 가상 뉴스, 366일 일봉 보존기간을 유지하며 정리 시점은 최대 한 시간 늦어질 수 있다.
- 완료 마커는 `private.market_maintenance_state`에 둔다. RLS를 켜고 서비스 역할에만 필요한 권한을 부여했다. 정리 함수는 SECURITY INVOKER이며 anon/authenticated에서 실행할 수 없다.
- `price_history_long_new_ticker_date_key` 중복 UNIQUE 제약조건과 그 인덱스를 제거했다. `(ticker,date)` 기본키와 고유성은 유지된다. 외래키 의존성이 없음을 확인했고 CASCADE를 사용하지 않았다.

## 검증

- 운영과 같은 `supabase==2.7.4`, `postgrest==0.16.11`로 실제 요청 빌더와 MockTransport를 사용한 저장·정리 회귀 테스트 17개 통과.
- 기존 `tests_py` 140개와 기존 앱 테스트 212개 통과, TypeScript 검사 통과.
- 임시 PostgreSQL 17.5에서 두 마이그레이션과 SQL 검증 실행. 이 환경은 운영 자격증명이나 운영 데이터를 사용하지 않는다.
- 운영 PostgreSQL 17에서 서비스 역할 권한, 동일 일봉 갱신 차단, 변경된 OHLC와 NULL 전환 허용, 현재가 수집 시각 갱신, 시간 내 정리 생략을 검증한 뒤 전체 테스트 트랜잭션 롤백.
- 운영 REST API에 기본키 `id IS NULL`이라는 항상 거짓인 조건으로 삭제 요청을 보내 최소 응답과 정확한 0건 처리를 확인. 실제 행 삭제 없음.
- 변경 후 Performance Advisor의 `duplicate_index` 권고 해소 확인.

로컬 실행 예시:

```powershell
.\.venv\io-optimization\Scripts\python.exe -X utf8 -m unittest discover -s tests_py -p 'test_*.py'
.\.venv\io-optimization\Scripts\python.exe -X utf8 -m unittest discover -s tests -p 'test_*.py'
node tests/sql/check-market-ingestion.mjs .venv/io-sql/node_modules/@electric-sql/pglite/dist/index.js
```

격리된 SQL 검증 환경은 `npm install --prefix .venv/io-sql --no-save --package-lock=false @electric-sql/pglite@0.3.9`로 준비한다. 운영 DB 검증 파일은 `tests/sql/market-ingestion-io.sql`이며 반드시 마지막 ROLLBACK까지 실행한다. 새 CI는 비밀값 없이 Python 및 임시 PostgreSQL 검증을 수행한다.

## 관측과 남은 제한

10월 15일 약 75초 표본에서 시스템 디스크 처리량은 약 7.04 MB/s, 데이터 디스크는 약 0.48 MB/s였다. 시스템 디스크 비중은 93.6%였고 스왑 입출력이 관측됐지만, 시스템 디스크 읽기 전체를 스왑으로 설명할 수는 없다. 별도 약 3분 DB 표본에서는 행 삽입·수정·삭제 및 체크포인트 쓰기 증가가 없었다. 이 값은 변경 전 특정 시간대의 표본이며 하루 전체나 과거 경고 시점을 대표하지 않는다.

시스템 디스크·스왑·컴퓨트 병목은 SQL 최적화만으로 해결을 보장할 수 없다. 운영 코드 게시 후 같은 수집 구간의 요청 수·WAL 증가량·디스크 지표를 비교해야 한다. 현재 잔여 Disk I/O 예산과 경고 당시 시계열은 이번 도구로 직접 확인하지 못했다.

다른 테이블의 [RLS 초기화 성능 권고](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan)와 [미사용 인덱스 정보](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)는 별도 검토 대상으로 남겼다. 사용 통계만으로 인덱스를 일괄 제거하지 않았다. 비공개 유지보수 테이블의 RLS 무정책 정보는 서비스 역할 전용 설계에 따른 것이다.

## 되돌리기

수집 코드 변경은 DB 마이그레이션과 독립적으로 되돌릴 수 있다. DB를 되돌릴 때는 두 `skip_unchanged_*` 트리거를 제거하고, 정리 함수를 `20260731024134_harden_fictional_market_cleanup.sql`의 원래 정의로 복원한다. 필요하면 제거한 UNIQUE 제약조건을 다시 추가할 수 있으나 동일 기본키가 계속 고유성을 보장하므로 기능 복구에 필수는 아니다. 새로 추가한 `private` 스키마 전체를 CASCADE로 삭제하지 않는다. 운영에서 되돌리기는 실행하지 않았다.
