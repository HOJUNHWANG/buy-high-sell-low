# Database gateway failures — September 12, 2026

Price/news Actions failed intermittently with Supabase PostgREST `Gateway Timeout`. Provider HTTP retries did not cover the separate database client. News failed reading existing URLs; prices failed reading membership/previous closes or saving data. Later runs recovered on the same commit.

`scripts/db_requests.py` now wraps reviewed pipeline database calls:

- Explicitly replay-safe reads, fixed-value keyed upserts and updates: at most three attempts, with 1/2-second exponential backoff plus up to 0.5-second jitter.
- Retry only known gateway/service-unavailable API errors or HTTPX timeout/network/remote-protocol failures. Authentication, constraint and programming errors fail immediately. Duplicate SQL code 23505 remains available to existing dedup handling.
- Reuse the built query and payload, including timestamps. Do not rerun providers or AI generation while retrying a save.
- Ordinary inserts into news, intraday history and logs are not automatically replayed: a timeout can occur after a successful commit. Existing news dedup and summary backfill recover on later runs. News insert failures now count as partial failure and return a nonzero exit; duplicate skips are not failures.
- Logs include `[database]`, the module/table and attempt/recovery information. Transient exception bodies, credentials, URL filters and row payloads are omitted. Exhausted retries raise a database-specific error. Existing explicitly optional history/anomaly warnings remain warnings.

Applied to prices, news, S&P 100 sync/readiness, previous-close/anomaly queries, and retention reference reads. No schema, permissions or provider settings changed. This reduces transient failures; it does not fix persistent Supabase infrastructure or database capacity problems. Investigate repeated exhausted retries instead of increasing the budget without a bound.

Validation covers transient recovery, exhaustion, non-replayable ambiguous inserts, auth/constraint failures, and committed-upsert response loss without duplicate rows, alongside existing transition and pipeline tests.
