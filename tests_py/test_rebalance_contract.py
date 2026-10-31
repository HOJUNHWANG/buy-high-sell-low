"""Catch drift between independently deployed UI, pipeline and backfill settings."""
import json
import re
import sys
import unittest
from datetime import datetime, time, timedelta
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from tickers import SP100_ADDITIONS, SP100_REMOVALS, SP100_REBALANCE_DATE, RETAINED_EQUITY_TICKERS, get_sp100_tickers
from asset_retention import RETIREMENT_DATES
from tickers import ALL_TICKERS, CRYPTO_TICKERS, ETF_TICKERS


class RebalanceContractTests(unittest.TestCase):
    def test_ui_and_pipeline_lists_and_effective_instant_match(self):
        source = (ROOT / "lib/sp100-transition.ts").read_text(encoding="utf-8")
        for name, expected in (("SP100_ADDITIONS", SP100_ADDITIONS), ("SP100_REMOVALS", SP100_REMOVALS)):
            match = re.search(rf"{name}\s*=\s*(\[.*?\])", source)
            self.assertIsNotNone(match, name)
            self.assertEqual(json.loads(match[1]), list(expected))
        instant = datetime.fromisoformat(re.search(r'SP100_EFFECTIVE_AT\s*=\s*"([^"]+)"', source)[1].replace("Z", "+00:00"))
        self.assertEqual(instant, datetime.combine(SP100_REBALANCE_DATE, time(), ZoneInfo("America/New_York")))
        for now, day in ((instant - timedelta(seconds=1), SP100_REBALANCE_DATE - timedelta(days=1)), (instant, SP100_REBALANCE_DATE)):
            with patch("tickers.datetime", wraps=datetime) as clock:
                clock.now.return_value = now
                self.assertEqual(get_sp100_tickers(), get_sp100_tickers(day))

    def test_backfill_defaults_cover_current_reviewed_additions(self):
        source = (ROOT / ".github/workflows/seed-market-history.yml").read_text(encoding="utf-8")
        default = re.search(r'default:\s*"([^"]+)"', source)[1]
        fallback = re.search(r"inputs.tickers\s*\|\|\s*'([^']+)'", source)[1]
        additions = {"SOXQ", "VXUS", "NEAR-USD", "UNI-USD"}
        self.assertEqual(set(default.split()), additions)
        self.assertEqual(set(fallback.split()), additions)
        self.assertTrue(additions <= set(ETF_TICKERS + CRYPTO_TICKERS))

    def test_refresh_keeps_active_counts_and_retired_collection_candidates(self):
        self.assertEqual(len(set(ETF_TICKERS)), 11)
        self.assertEqual(len(set(CRYPTO_TICKERS)), 19)
        retired = {"SPY", "OEF", "DOT-USD", "XMR-USD"}
        self.assertTrue(retired.isdisjoint(ETF_TICKERS + CRYPTO_TICKERS))
        self.assertTrue(retired <= set(ALL_TICKERS))

    def test_retirement_ledger_and_collection_candidates_stay_in_sync(self):
        self.assertTrue(set(RETIREMENT_DATES) <= set(RETAINED_EQUITY_TICKERS))
        for ticker in SP100_REMOVALS:
            self.assertEqual(RETIREMENT_DATES[ticker], SP100_REBALANCE_DATE)


if __name__ == "__main__": unittest.main()
