import sys
import unittest
from datetime import date
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from asset_retention import expired_retirements, filter_collectable_tickers, protected_inactive_tickers, referenced_tickers


class Client:
    def __init__(self, **tables): self.tables = tables
    def table(self, table):
        rows = list(self.tables.get(table, []))
        class Query:
            def select(self, *_): return self
            def order(self, *_): return self
            def in_(self, key, values):
                nonlocal rows
                rows = [r for r in rows if r.get(key) in values]
                return self
            def eq(self, key, value): return self.in_(key, [value])
            def gt(self, key, value):
                nonlocal rows
                rows = [r for r in rows if r.get(key, 0) > value]
                return self
            def range(self, start, end):
                nonlocal rows
                rows = rows[start:end + 1]
                return self
            def execute(self): return SimpleNamespace(data=rows)
        return Query()


class RetentionTests(unittest.TestCase):
    def test_thirty_day_grace_boundary(self):
        self.assertNotIn("NKE", expired_retirements(date(2026, 10, 20)))
        self.assertIn("NKE", expired_retirements(date(2026, 10, 21)))
        self.assertNotIn("HON", expired_retirements(date(2026, 10, 7)))
        self.assertIn("HON", expired_retirements(date(2026, 10, 8)))

    def test_cleanup_grace_and_user_references(self):
        client = Client(paper_positions=[dict(ticker="NKE", shares=2)], watchlist=[dict(ticker="SPG")])
        candidates = ["DELL", "NKE", "SPG", "CL", "HONA", "OLD"]
        self.assertEqual(protected_inactive_tickers(client, candidates, date(2026, 10, 20)), set(candidates) - {"OLD"})
        self.assertEqual(protected_inactive_tickers(client, candidates, date(2026, 10, 21)), {"DELL", "NKE", "SPG"})

    def test_pending_secondary_pick_and_pagination(self):
        client = Client(paper_challenges=[dict(ticker="AAPL", status="active", picks=[])] * 500 + [dict(ticker="AAPL", status="pending", picks=[dict(ticker="CL")])])
        self.assertEqual(referenced_tickers(client, ["CL"]), {"CL"})

    def test_stops_only_inactive_unreferenced_collection_after_grace(self):
        client = Client(stocks=[dict(ticker=t, is_active=t == "HONA") for t in ["NKE", "SPG", "HONA"]], paper_positions=[dict(ticker="NKE", shares=1), dict(ticker="SPG", shares=0)])
        tickers = ["AAPL", "NKE", "SPG", "HONA", "DELL"]
        self.assertEqual(filter_collectable_tickers(client, tickers, date(2026, 10, 20)), tickers)
        self.assertEqual(filter_collectable_tickers(client, tickers, date(2026, 10, 21)), ["AAPL", "NKE", "HONA", "DELL"])

    def test_settled_challenges_do_not_keep_collecting(self):
        client = Client(paper_challenges=[dict(ticker="CL", status="settled", picks=[dict(ticker="NKE")])])
        self.assertEqual(referenced_tickers(client, ["CL", "NKE"]), set())


if __name__ == "__main__": unittest.main()
