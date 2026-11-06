# Market cap failures and automatic page refresh

The [November 5, 8 PM ET run](https://github.com/HOJUNHWANG/buy-high-sell-low/actions/runs/42140821086)
updated 130 of 132 assets. LRCX and SNDK failed the existing 15% price × shares
check with differences of 19.6% and 28.9%. The Supabase `market_caps` log recorded
`partial`, two failures, and preservation of the prior values. The scheduler's
nonzero exit was intentional and must remain visible for genuine failures.

The stored provider notes identify November 5's 4 PM ET close. Nasdaq summary
market cap is independently live: on November 6 before opening, it tracked
premarket prices while the quote parser deliberately selected the labelled
regular-session close. This supports a mismatch of quote instants as the cause
of the two formula failures. Yahoo's explicit market caps agreed with the dated
price × share-count calculation. The failed run did not retain the original
candidate amounts, so the exact original primary caps cannot be reconstructed
from its log.

The updater now derives an aligned observation only when the Nasdaq cap fails
the formula guard and Yahoo's explicit cap confirms both the dated formula and
Yahoo's own price × shares. It records the original summary cap, quote timestamp,
derived source, and Yahoo cross-check. It preserves existing thresholds and
rejects unconfirmed or internally inconsistent share counts.

Pages had no timer or lifecycle refresh. In addition, fixed-key Next data caches
returned stale data to the first request after expiry. Time-window cache keys
now await the first fresh public read in each window; subsequent visitors share
that window's result. Screener and brief explicitly render per request while
their public DB reads remain shared. No user-specific data enters that cache.

Home, screener, stock detail, news, brief (including its empty state), and authorized
Data Health refresh server components every minute while visible and online.
Focus, visibility, pageshow and reconnect events refresh overdue data and deduplicate
overlapping events. Router refresh preserves client state and scroll. Provider
ingestion cadence is unchanged; automatic display refresh does not fetch new
provider quotes on demand. Public data can remain within the current one-minute
cache window, with an additional refresh interval before an open page displays it.

Changes are local until deployed. No production data writes were performed during
investigation; the two-ticker provider/DB validation used `--dry-run`.

## Validation

- Vitest: 206 tests passed, including cache-window freshness, ticker isolation,
  error recovery, visible/hidden/offline lifecycle, listener cleanup, and clock skew.
- Python: all 175 tests in tests_py passed with Python UTF-8 mode; the market-cap
  suite includes the two observed discrepancy ratios and rejection of unsupported
  formula corrections. The initial default Windows CP949 run failed while printing
  an existing em dash; the UTF-8 run passed without application changes.
- TypeScript, targeted ESLint, git diff --check, and the final production build passed.
- Live provider/DB dry run for LRCX and SNDK: two validated, zero failed, zero writes.
  At that later observation the Nasdaq values were already within the existing
  guard; the new correction branch is covered by the failure-reproduction tests.
- Local production browser: actual one-minute refresh (excluding prefetch requests),
  overdue-focus refresh, preserved screener search, home/news/AAPL/brief rendering,
  mobile overflow check, and zero page errors. See
  [browser check results](2026-11-06-refresh-smoke.json).
- Native browser automation could not start because the local process-security
  environment failed. Verification used the project's installed Playwright/Chrome.
- Authorized Data Health received the same refresh component; its signed-in/admin
  screen was not exercised. No test account or production row was created.
