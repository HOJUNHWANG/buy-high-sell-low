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
