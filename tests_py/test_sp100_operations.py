import copy
import os
import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
with patch("supabase.create_client", return_value=MagicMock()):
    import cleanup

import sync_sp100
from tickers import SP100_ADDITIONS, SP100_REMOVALS, get_sp100_tickers


class MemoryClient:
    def __init__(self):
        self.stocks = {t: dict(ticker=t, name=t, is_active=True, sector="sector", exchange="NYSE", logo_url="https://example.com/icon", market_cap=100) for t in get_sp100_tickers(date(2026, 9, 20))}
        self.stocks.update({t: dict(ticker=t, name=t, is_active=False, sector="sector", exchange="NYSE", logo_url="https://example.com/icon", market_cap=100) for t in SP100_ADDITIONS})
        self.history = [{"date": (date(2025, 9, 20) + timedelta(days=i)).isoformat(), "close": 10} for i in range(364)]
        self.quote = {"price": 10, "fetched_at": "2026-09-18T20:05:00+00:00"}
        self.writes = []
        self.fail = False

    def table(self, name):
        client = self

        class Query:
            payload = None
            def select(self, *args): return self
            def eq(self, *args): return self
            def gte(self, *args): return self
            def order(self, *args): return self
            def upsert(self, rows, **kwargs):
                self.payload = rows
                return self
            def execute(self):
                if self.payload is not None:
                    client.writes.append(copy.deepcopy(self.payload))
                    if client.fail:
                        raise RuntimeError("database unavailable")
                    for row in self.payload:
                        client.stocks[row["ticker"]].update(row)
                data = list(client.stocks.values()) if name == "stocks" else [client.quote] if name == "stock_prices" else client.history
                return SimpleNamespace(data=copy.deepcopy(data))
        return Query()


class TransitionOperationsTests(unittest.TestCase):
    def setUp(self):
        self.client = MemoryClient()
        self.clock = patch("sync_sp100.datetime", wraps=datetime)
        clock = self.clock.start()
        clock.now.return_value = datetime(2026, 9, 21, 4, tzinfo=timezone.utc)
        self.addCleanup(self.clock.stop)

    def test_transition_is_one_write_and_retry_is_noop(self):
        self.assertEqual(sync_sp100.sync_sp100(self.client), 8)
        self.assertEqual(len(self.client.writes), 1)
        self.assertEqual(len(self.client.writes[0]), 8)
        self.assertEqual(sum(s["is_active"] for s in self.client.stocks.values()), 101)
        self.assertEqual(sync_sp100.sync_sp100(self.client), 0)
        self.assertEqual(len(self.client.writes), 1)
        self.assertTrue(all(s["market_cap"] == 100 for s in self.client.stocks.values()))

    def test_database_failure_leaves_membership_and_retry_recovers(self):
        before = copy.deepcopy(self.client.stocks)
        self.client.fail = True
        with self.assertRaisesRegex(RuntimeError, "database unavailable"):
            sync_sp100.sync_sp100(self.client)
        self.assertEqual(self.client.stocks, before)
        self.client.fail = False
        self.assertEqual(sync_sp100.sync_sp100(self.client), 8)

    def test_stale_quote_or_missing_metadata_or_history_prevents_all_writes(self):
        for defect in ("quote", "metadata", "history", "history_gap"):
            with self.subTest(defect=defect):
                client = MemoryClient()
                if defect == "quote": client.quote["fetched_at"] = "2026-09-17T20:00:00+00:00"
                if defect == "metadata": client.stocks["DELL"]["logo_url"] = None
                if defect == "history": client.history = client.history[-10:]
                if defect == "history_gap": client.history = [r for r in client.history if r["date"] != "2026-02-03"]
                before = copy.deepcopy(client.stocks)
                with self.assertRaises(RuntimeError): sync_sp100.sync_sp100(client)
                self.assertEqual(client.writes, [])
                self.assertEqual(client.stocks, before)

    def test_cleanup_protects_pending_and_retained_even_without_user_references(self):
        client = MagicMock()
        # All user-reference queries return no rows.
        client.table.return_value.select.return_value.in_.return_value.execute.return_value.data = []
        client.table.return_value.select.return_value.in_.return_value.gt.return_value.execute.return_value.data = []
        client.table.return_value.select.return_value.in_.return_value.eq.return_value.execute.return_value.data = []
        with patch.object(cleanup, "supabase", client):
            protected = cleanup.get_protected_inactive_tickers([*SP100_ADDITIONS, *SP100_REMOVALS, "OLD"])
        self.assertEqual(protected, set(SP100_ADDITIONS) | set(SP100_REMOVALS))


if __name__ == "__main__":
    unittest.main()
