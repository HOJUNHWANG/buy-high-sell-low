# 2026-10-31 전체 개선 작업

대상: [전체 감사](audits/2026-10-31/review.md), [뉴스 감사](audits/2026-10-31/news-review.md).
기준 운영 코드 `7c48184`, 작업 브랜치 `codex/full-app-remediation`.

**코드·복구 마이그레이션은 구현했고, 새 운영 DB 변경·main 배포·운영 재처리는 아직 실행하지 않았다.** Supabase 마이그레이션 도구 확인이 두 차례 만료됐고 CLI 로그인 토큰은 없다. 아래 코드 검증과 운영 적용 결과를 구분한다. 기존 감사 문서는 수정 전 증거로 보존한다.

## 구현

| 항목 | 변경 |
| --- | --- |
| 원장 권한·동시 주문 | 계정을 먼저 잠근 SQL 트랜잭션으로 현금·포지션·거래 기록을 함께 변경한다. API는 세션에서 소유자를 정하고 클라이언트 현금/가격 입력을 버린다. 롱/숏을 분리하고 요청 ID+의도로 중복 체결을 차단한다. 호환 API 배포 후 클라이언트 변경 권한을 회수한다. |
| 레버리지 손실·시세 | 개별 손실 정산을 0으로 잘라 양방향 보유에서 현금을 만들어내는 문제도 수정했다. 전체 청산에서 계좌 순자산을 정산한다. 지연·누락 시세로 거래/강제 청산하지 않으며 추정 평가를 표시한다. |
| 출석·챌린지·관리 | 출석/보상은 한 번만 지급하고 정확히 배정된 5종목만 제출한다. 과거 챌린지는 실제 해당 주 종가로 정산한다. 자료가 없으면 사유와 함께 보류하고 현재 가격을 대신 쓰지 않는다. 미청구 과거 보상, 닉네임, 관리자 작업, AI 사용량도 동일 잠금으로 처리한다. |
| 더미 참가자 | 시드 패턴과 일치하는 신원만 표시/집계에서 제외한다. 원본을 비공개 보관 후 격리하며 실제 사용자 잔액이 변하면 중단한다. 별도 도구로 해당 Auth 신원을 차단한다. QA 계정도 공개 랭킹에서 제외한다. |
| ADA 시총 | CoinGecko 두 엔드포인트의 가격·시총·공급량·시각을 교차 검증한다. 실패 시 마지막 정상 값을 유지하고 실패를 기록한다. 크립토의 불필요한 Yahoo 호출을 제거했다. |
| 분할·일봉 | Twelve Data 분할 보정 시계열로 BKNG를 복구할 RPC/도구와 주간 불연속 검사를 추가했다. 변경 전 원본을 보관하고 변경된 행만 쓴다. 잘못된 OHLC·미래/휴장일 입력을 차단한다. 기존 휴장일 행, ABT 오류, OP 챌린지 종가 누락의 복구 SQL을 준비했다. |
| 메타데이터·보존 | 누락 8종목/섹터 분류를 보완하고 EXC/TGT/BK의 과거 이름을 복원한다. 만료 챌린지가 은퇴 종목 수집을 계속 붙잡지 않게 했다. 은퇴 종목 일봉은 정상 보존 기간까지 유지한다. 생성 SQL은 사용자 원장을 삭제하지 않는다. |
| 뉴스 수집 | 피드별 HTTP/파싱/빈 피드 상태, DB 오류, AI 제한을 노출한다. 기존 NewsAPI 계정으로 주식 발행사 검색을 순환한다. URL 정규화, 실행/AI 예산, 미처리 재시도를 추가했다. |
| 종목 매칭 | 회사명·별칭·티커 경계를 적용한다. 제목 직접 관계/본문의 실질적인 금융 관계만 공개 태그로 쓰고 배경 언급은 근거에 남긴다. Intel/SpaceX/Circle 누락과 I-bond→TLT, 범죄→BTC/ETH 추정을 수정했다. |
| 요약 사실성 | 공개 원문의 기사 문단을 추출하고 광고/위젯을 제외한다. AI가 고른 완전한 문장이 원문과 정확히 일치하고 총 25단어 이내일 때만 검증된 요약으로 저장한다. 실패하면 짧은 발췌 또는 제목만 표시한다. 기존 미검증 요약·감성은 회원 등급/이전 해제 여부와 관계없이 숨긴다. |
| 뉴스 노출/AI | 최근성·관련성·사건/소스 다양성을 적용한다. Trending은 관련 종목 배열과 서로 다른 사건을 집계하고 GOOG/GOOGL은 합친다. 감성은 최근 검증 기사만 집계한다. 주가 설명은 72시간 이내 원문 근거/날짜를 사용하고 제목뿐이면 사용 횟수를 차감하지 않는다. 시장 브리프도 날짜/중요도/다양성을 반영한다. |
| UI·인증 | Workspace 기본값, Original 선택 보존, 표 25/50행 페이지 이동, 모바일 시총/AUM·정보 순서, 밝음/어두움 대비, 버튼 이름을 개선했다. 검색 방향키/Enter/Escape/combobox 상태와 안전한 로그인 복귀를 추가했다. 신규/재설정 비밀번호는 12자 이상이다. |
| I/O·보안 | 오래된 cron 로그 정리와 이후 배치 보존, RLS 사용자 함수 평가 최적화, pg_trgm 스키마 이동을 준비했다. 변경 없는 시장 데이터 재기록 방지를 유지한다. Next 16.4.3/sharp 0.35.5로 업데이트했다. 자동 audit은 중지 상태를 유지한다. |

## 검증

- TypeScript 19개 파일 **178개**, Python `tests_py` **153개** 및 `tests` **15개** 통과. ESLint, 타입 검사, Next 프로덕션 빌드 통과.
- PostgreSQL 17/PGlite에서 기존 I/O 회귀와 새 6개 마이그레이션 실행 통과. 계좌 보존, 롱/숏 분리, 전체 롤백, 요청 재시도, 보상 중복 차단, 서비스 권한, OHLC/휴장일 차단, 뉴스 원본 보관, 더미 격리, 분할 이력 교체·재실행을 검증했다. 단일 연결 검사는 운영 다중 연결 동시성 증명을 대신하지 않는다.
- 깨끗한 Chrome에서 2레이아웃×2테마×2화면×6경로를 검사한다. 최종 화면/흐름 결과는 `audits/2026-10-31/remediation-validation.json`에 저장한다. 자동 접근성 검사로 사용성 전체를 보증하지 않는다.
- 실제 기사 5건을 쓰기 없이 재분석했다. 잘못된 I-bond/범죄 태그 제거와 INTC/SPCX/USDC 매칭을 확인했다. Circle 기사의 24단어 문장이 원문과 일치했다. Intel 본문은 접근 제한으로 확보하지 못해 제목만 표시한다. 표본에서 전체 정밀도를 추정하지 않는다.
- `npm audit --omit=dev`: **0개**. 개발 도구의 minimatch 관련 moderate 16개는 남아 있다. 강제 수정은 ESLint를 호환되지 않는 버전으로 되돌려 적용하지 않았다.
- 격리 QA 신원으로 실제 로그인/동시 주문/원장 권한 차단/출석을 확인하는 도구를 준비했다. 기본 실행은 신원을 만들지 않는다. **아직 운영에서 실행하지 않았다.** 실행 시 생성한 계정과 기록만 정리한다.

## 운영 적용 순서

1. 확장 마이그레이션 `add_atomic_paper_actions`, `add_news_quality_and_data_archive`, `enforce_market_history_quality`를 먼저 적용한다.
2. 검증한 앱 커밋을 main에 반영하고 호환 API의 배포 완료를 확인한다. 오래된 서버 인스턴스가 끝나기 전에 권한을 회수하지 않는다.
3. `restrict_paper_writes_and_optimize_policies` 적용.
4. `quarantine_seeded_demo_ledger`, `repair_verified_legacy_market_data` 적용. 실제 사용자 잔액 비교가 다르면 격리 트랜잭션은 중단된다.
5. 배포 코드와 기존 서버 비밀값으로 순서대로 실행한다.

```text
python scripts/ban_demo_identities.py --apply
python scripts/update_market_caps.py ADA-USD
python scripts/refresh_daily_history.py BKNG
python scripts/repair_news_quality.py --all --recent-source-limit 150 --ai-limit 20
python scripts/fetch_news.py
python scripts/cleanup.py
```

`cleanup.py`가 과거 챌린지 정산과 보존 기간을 적용한다. 뉴스는 수정 전 전체 행을 백업하고 최근/확인 사례의 원문 확보를 우선한다. 모든 과거 기사 본문을 새로 확보했다고 주장하지 않는다.

6. `PAPER_QA_BASE_URL`을 배포 URL로 설정하고 `node tests/e2e/paper-actions.mjs --allow-live-test`를 실행한다. 생성한 QA 신원만 정리됐는지 확인한다.
7. 실제 원장 보존, 공개 더미 계정/포지션 0, 챌린지 보류 사유, ADA/BKNG/ABT/휴장일, 뉴스 사례, 수집 실행, Supabase advisories를 재검사한다. 도구가 기록한 마이그레이션 버전과 로컬 파일명을 맞춘다. 기존 CLI 순서로 무조건 일괄 적용하지 않는다.

## 남은 제한

- DISK IO 경고는 운영 적용 후 지표를 확인해야 한다. 불필요한 수집/재기록/로그를 줄이는 코드를 준비했지만 아직 경고가 해소됐다고 판단하지 않는다.
- Supabase 유출 비밀번호 차단은 Pro 이상이다. 유료 업그레이드를 하지 않았다. 앱의 비밀번호 길이 검증과는 별도다. [공식 안내](https://supabase.com/docs/guides/auth/password-security)
- `legacy:unverified` 시총은 검증된 일별 리더 집계에서 계속 제외한다. 과거 관측값을 발명하지 않는다.
- 기존 주식/ETF/크립토와 실제 사용자 모의투자 이력은 보존한다. Fictional 객체를 다시 만들지 않는다.
- 뉴스 매칭은 근거를 보관하는 규칙 기반 방식이다. 새 별칭/관계와 소스 커버리지는 지속적인 표본 확인이 필요하다.

## 원천

[NYSE 거래 달력](https://www.nyse.com/trade/hours-calendars), [Twelve Data 조정 가격](https://support.twelvedata.com/en/articles/5179064-are-the-prices-adjusted), [CoinGecko markets](https://docs.coingecko.com/reference/coins-markets), [Next 보안 업데이트](https://nextjs.org/blog/nextjs-security-update-october-14-2026).
