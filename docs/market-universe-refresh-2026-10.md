# ETF and crypto universe refresh — October 30, 2026

Approved tracking-list replacements:

| Retired | Replacement | Purpose |
| --- | --- | --- |
| SPY | SOXQ | Keep VOO as the S&P 500 proxy; add PHLX semiconductor coverage. |
| OEF | VXUS | Add developed/emerging markets outside the US. |
| DOT-USD | NEAR-USD | Add a larger, liquid asset supported by Twelve Data. |
| XMR-USD | UNI-USD | Replace the active Monero quote that remains flat on HitBTC. |

The active list remains 11 ETFs and 19 crypto assets. S&P 100 membership and
the independently tracked SPCX equity are unchanged. The homepage S&P 500 card
uses VOO. Market briefs share the central crypto list and exclude inactive movers.

## Rollout

1. Register SOXQ, VXUS, NEAR-USD, and UNI-USD as inactive. Do not rename or delete
   the retired stock rows or transfer user holdings between symbols.
2. Prepare daily history from Twelve Data, current quotes using
   `fetch_selected_prices`, and validated values using
   `python scripts/update_market_caps.py SOXQ VXUS NEAR-USD UNI-USD`.
3. Publish the collection/retention changes before applying the
   `refresh_etf_crypto_universe` migration. That migration changes all eight
   membership flags in one transaction. It refuses activation until every new
   asset has a positive recent quote, a fresh provider-verified market value
   with the correct AUM/circulating-cap metric, and at least 200 daily bars with
   recent history. Missing/stale data causes the whole transaction to roll back.
4. Verify all eight flags, active asset counts, live detail pages and screening
   results, and user-ledger fingerprints.

Prepared production data before activation: SOXQ/VXUS each have 251 daily bars;
NEAR/UNI each have 365. Four current quotes and four validated market values
were written successfully. The automatic targeted backfill uses Twelve Data
because Yahoo does not resolve UNI-USD. Existing dates are skipped on reruns.

No paper account, position, transaction, challenge, or watchlist row is changed
by this migration. Existing challenges reference OEF, DOT, and XMR; these remain
eligible for background quote collection while referenced. Once no open
challenge, position, or watchlist needs a retired asset, collection stops without
an extra grace period. Existing ordinary historical-data retention still applies.

## Validation

- App regression tests, Python ingestion/retention tests, type checking, lint for
  the changed UI/tests, and the production build passed.
- Isolated PostgreSQL tests verify rollback for absent preparation, stale crypto
  quotes, insufficient history, and an incorrect ETF metric. Successful activation
  preserves the real user ledger and all existing price/history rows.
- Paper buy/short API tests reject all four inactive retired assets.

## Production verification

The refresh migration was applied as `20261031032753_refresh_etf_crypto_universe.sql`
after commit `44e2c73` deployed successfully. All eight flags are correct; active
counts are 102 equities, 11 ETFs, and 19 crypto assets. All four new symbols are
returned by public search and all four retired symbols are excluded. Each new
stock detail page returns HTTP 200.

Fingerprints of all paper accounts, positions, transactions, challenges, and
watchlist rows matched before and after activation. Account/position/transaction
counts remain 32 / 305 / 53. Targeted external-reference audit passed with zero
critical findings and full price/value coverage; its UNI time-alignment warning
was checked against live CoinGecko simple-price and markets responses, both of
which confirmed the stored approximately $4.38 billion capitalization.

GitHub's index configuration, ingestion/SQL checks, and Twelve history seed all
succeeded on the published commit.
