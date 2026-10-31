# Fictional market retirement — 2026-10-30 ET

The user requested complete removal to eliminate its background database workload.

## Scope

- Remove the listings, company details, Fictional paper-trading desk, APIs, account
  switch, navigation, simulation data/engines, seed/update scripts, and obsolete secret example.
- Keep the old scheduler endpoint as an inert HTTP 410 response with no DB imports.
  The external scheduler may still call it, but it cannot generate or persist data.
- Remove Fictional retention calls from weekly cleanup so dropping its RPC does
  not break real-market data retention.
- Drop the nine dedicated market/ledger tables and three dedicated functions.
  Clear only the Fictional maintenance marker. Preserve the shared daily-price
  trigger function, generic private table, auth users, and real paper-trading ledgers.
- Preserve historical migration files and append the explicit retirement migration.
  Do not use CASCADE or VACUUM FULL.

## Rollout and verification

1. Run app/Python regressions, type/lint checks, build, and disposable PostgreSQL tests.
2. Publish and verify the live former scheduler endpoint returns 410.
3. Apply the retirement migration to GlobalStock (`idapkkkixnbdsfrvwzde`).
4. Verify no dedicated tables/functions remain and real ledger/user counts match.

The SQL regression seeds both ledgers, proves an unexpected external dependency
rolls back the entire drop, then verifies successful removal preserves the real
users, cash balances, positions, and transaction rows byte-for-byte.

Removing these writes does not by itself prove that every Disk IO warning or
system-disk swap problem has been resolved. Disk and memory metrics need a later
comparison over comparable collection windows.


## Applied result

- Main deployment and Check Market Ingestion CI succeeded for commit `78228b8`.
- The live old scheduler endpoint returns 410. Former listings, details, and
  Fictional trading APIs return 404; the real paper-trading workspace remains available.
- Production migration history recorded `20261031025045_retire_fictional_market`.
  The CLI-created local migration was renamed to that authoritative production
  version so subsequent migration comparisons stay aligned.
- Verified zero Fictional tables, dedicated functions, and retention markers remain.
- Auth user IDs and all real paper-account, position, and transaction contents
  have identical before/after aggregate hashes and row counts.
- DB size fell from 190,114,963 to 151,694,483 bytes (about 36.6 MiB reclaimed).
- Local validation: app 159 tests, Python 149 tests, type check, changed-file lint,
  production build, and isolated PostgreSQL removal/rollback/preservation checks passed.
- Security/performance advisors report no new findings introduced by the removal.
- The external Cronjob.org entry could not be edited because the browser tool's
  launcher still fails on its D: volume. Its former target is proven inert for
  both GET and POST, and the underlying tables/functions are removed, so those
  calls cannot resume Fictional database writes.
