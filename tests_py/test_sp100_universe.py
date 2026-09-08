import json
import sys
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from tickers import ALL_EQUITY_TICKERS, COMPANY_NAMES, SP100_ADDITIONS, SP100_REMOVALS, get_sp100_tickers
from sync_sp100 import plan_sync


class Sp100Tests(unittest.TestCase):
    def test_automatic_switch_uses_eastern_midnight(self):
        with patch("tickers.datetime") as clock:
            clock.side_effect = datetime
            clock.now.return_value = datetime(2026, 9, 21, 3, 59, tzinfo=timezone.utc)
            self.assertIn("NKE", get_sp100_tickers())
            clock.now.return_value = datetime(2026, 9, 21, 4, tzinfo=timezone.utc)
            self.assertNotIn("NKE", get_sp100_tickers())

    def test_current_members_match_complete_oef_snapshot(self):
        snapshot = json.loads((ROOT / "data/sp100-2026-09-04.json").read_text())
        current = get_sp100_tickers(date(2026, 9, 8))
        self.assertEqual(set(current), set(snapshot["tickers"]))
        self.assertEqual(len(current), 101)

    def test_effective_date_and_full_rebalance(self):
        before = set(get_sp100_tickers(date(2026, 9, 20)))
        after_list = get_sp100_tickers(date(2026, 9, 21))
        after = set(after_list)
        self.assertEqual(after - before, set(SP100_ADDITIONS))
        self.assertEqual(before - after, set(SP100_REMOVALS))
        self.assertEqual(len(after_list), 101)
        self.assertEqual(len(after), 101)
        self.assertTrue(after <= COMPANY_NAMES.keys())

    def test_sync_preserves_unrelated_assets_and_only_updates_status(self):
        existing = [{"ticker": t, "is_active": True} for t in get_sp100_tickers(date(2026, 9, 8))]
        existing += [{"ticker": t, "is_active": True} for t in ("HON", "SPCX", "SPY", "BTC-USD", "CUSTOM")]
        changes = plan_sync(existing, date(2026, 9, 21))
        disabled = [r for r in changes if not r["is_active"]]
        self.assertEqual({r["ticker"] for r in disabled}, set(SP100_REMOVALS) | {"HON"})
        self.assertTrue(all(set(r) == {"ticker", "is_active"} for r in disabled))
        self.assertEqual({r["ticker"] for r in changes if r["is_active"]}, set(SP100_ADDITIONS))
        merged = {r["ticker"]: r for r in existing}
        for row in changes:
            merged[row["ticker"]] = row
        self.assertEqual(plan_sync(list(merged.values()), date(2026, 9, 21)), [])

    def test_announced_additions_are_inactive_before_effective_date(self):
        changes = plan_sync([], date(2026, 9, 8))
        self.assertEqual({r["ticker"] for r in changes if not r["is_active"]}, set(SP100_ADDITIONS))
        self.assertTrue(set(SP100_ADDITIONS) <= set(ALL_EQUITY_TICKERS))
        self.assertEqual(len(ALL_EQUITY_TICKERS), len(set(ALL_EQUITY_TICKERS)))


if __name__ == "__main__":
    unittest.main()
