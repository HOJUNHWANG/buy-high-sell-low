"""Exercise the real PostgREST request builder without sending network requests."""
import json
import importlib.util
import io
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from postgrest import SyncPostgrestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from market_storage import delete_with_count, existing_news_urls, persist_price_batch


class MarketStorageTests(unittest.TestCase):
    def load_worker(self, name):
        spec = importlib.util.spec_from_file_location(
            name + "_io_test", Path(__file__).resolve().parents[1] / "scripts" / (name + ".py"),
        )
        module = importlib.util.module_from_spec(spec)
        with patch.dict(os.environ, {
            "SUPABASE_URL": "https://example.invalid", "SUPABASE_SERVICE_ROLE_KEY": "test-key",
            "TWELVE_DATA_API_KEY": "test-provider-key", "NEWSAPI_KEY": "test-news-key", "GROQ_API_KEY": "",
        }), patch("dotenv.load_dotenv"), patch("supabase.create_client", return_value=self.client):
            spec.loader.exec_module(module)
        return module

    def setUp(self):
        self.requests = []
        self.history = []
        self.news = []
        self.fail_table = None
        self.rest = SyncPostgrestClient("https://example.invalid")
        self.rest.session.close()
        self.rest.session = httpx.Client(
            base_url="https://example.invalid",
            transport=httpx.MockTransport(self.handle),
        )
        self.client = SimpleNamespace(table=self.rest.from_)
        self.addCleanup(self.rest.session.close)
        self.current = [
            {"ticker": f"TEST{i}", "price": 100, "volume": None,
             "change_pct": None, "fetched_at": "2026-10-15T12:00:00+00:00"}
            for i in range(25)
        ]
        self.daily = [
            {"ticker": row["ticker"], "date": "2026-10-15", "close": row["price"]}
            for row in self.current
        ]

    def handle(self, request):
        self.requests.append(request)
        table = request.url.path.rsplit("/", 1)[-1]
        if table == self.fail_table:
            raise httpx.ReadTimeout("response lost", request=request)
        if request.method == "GET":
            if table == "stock_price_history":
                offset = int(request.url.params.get("offset", 0))
                return httpx.Response(200, json=self.history[offset:offset + 1000])
            return httpx.Response(200, json=self.news)
        if request.method == "DELETE":
            return httpx.Response(204, headers={"content-range": "*/1234"})
        return httpx.Response(201, json=[])

    def persist(self, **overrides):
        args = dict(current_rows=self.current, daily_rows=self.daily,
                    history_cutoff="2026-10-15T11:56:00+00:00")
        args.update(overrides)
        return persist_price_batch(self.client, **args)

    def writes(self, table):
        return [request for request in self.requests
                if request.method == "POST" and request.url.path.endswith("/" + table)]

    def test_25_quotes_use_four_requests_and_keep_every_unchanged_price(self):
        self.assertEqual(self.persist(), 25)
        self.assertEqual(len(self.requests), 4)  # Previously 25 * 4.
        current = self.writes("stock_prices")[0]
        self.assertEqual(json.loads(current.content), self.current)
        self.assertIn("return=minimal", current.headers["prefer"])
        history = json.loads(self.writes("stock_price_history")[0].content)
        self.assertEqual(len(history), 25)
        self.assertEqual(history[0]["recorded_at"], self.current[0]["fetched_at"])
        self.assertTrue(all(row["price"] == 100 for row in history))

    def test_overlap_dedup_does_not_suppress_current_price_or_daily_refresh(self):
        self.history = [{"ticker": "TEST0", "id": 1}]
        self.persist()
        history = json.loads(self.writes("stock_price_history")[0].content)
        self.assertNotIn("TEST0", [row["ticker"] for row in history])
        self.assertEqual(len(json.loads(self.writes("stock_prices")[0].content)), 25)
        self.assertEqual(len(json.loads(self.writes("price_history_long")[0].content)), 25)

    def test_settlement_forces_history_even_when_recent_data_exists(self):
        self.history = [{"ticker": "TEST0", "id": 1}]
        self.persist(force_history=True)
        self.assertEqual(len(self.requests), 3)
        self.assertEqual(len(json.loads(self.writes("stock_price_history")[0].content)), 25)

    def test_missing_ohlc_and_volume_do_not_become_null_in_mixed_batches(self):
        self.daily[0].update(open=99, high=101, low=98, volume=500)
        self.persist()
        groups = [json.loads(request.content) for request in self.writes("price_history_long")]
        self.assertEqual(sorted(map(len, groups)), [1, 24])
        for rows in groups:
            self.assertTrue(all(set(row) == set(rows[0]) for row in rows))
        sparse = next(rows for rows in groups if len(rows) == 24)
        self.assertNotIn("volume", sparse[0])
        self.assertNotIn("open", sparse[0])

    def test_dedup_read_paginates_past_the_postgrest_row_cap(self):
        self.history = [{"ticker": "TEST0", "id": i} for i in range(1000)]
        self.history.append({"ticker": "TEST1", "id": 1001})
        self.persist()
        history = json.loads(self.writes("stock_price_history")[0].content)
        self.assertNotIn("TEST0", [row["ticker"] for row in history])
        self.assertNotIn("TEST1", [row["ticker"] for row in history])

    def test_ambiguous_history_timeout_is_not_replayed_and_daily_still_saves(self):
        self.fail_table = "stock_price_history"
        # Force skips the history GET so only the INSERT times out.
        self.assertEqual(self.persist(force_history=True), 25)
        self.assertEqual(len(self.writes("stock_price_history")), 1)
        self.assertEqual(len(self.writes("price_history_long")), 1)

    def test_current_price_failure_stops_history_and_daily_writes(self):
        self.fail_table = "stock_prices"
        with patch("db_requests.time.sleep"), self.assertRaises(RuntimeError):
            self.persist()
        self.assertFalse(self.writes("stock_price_history"))
        self.assertFalse(self.writes("price_history_long"))

    def test_empty_batch_does_not_query_database(self):
        self.assertEqual(self.persist(current_rows=[], daily_rows=[]), 0)
        self.assertEqual(self.requests, [])

    def test_worker_maps_crypto_and_isolates_malformed_quotes_before_batch_write(self):
        worker = self.load_worker("fetch_prices")
        with patch.object(worker, "get_previous_closes", return_value=({"BTC-USD": 100}, None)):
            fetched, failed = worker.upsert_prices({
                "BTC/USD": {"close": "100"},
                "BAD": {"close": "nan"},
                "BAD_VOLUME": {"close": "100", "volume": "invalid"},
                "BAD_CHANGE": {"close": "100", "percent_change": "nan"},
            }, ticker_map={"BTC/USD": "BTC-USD"})
        self.assertEqual(fetched, 1)
        self.assertEqual(failed, ["BAD", "BAD_VOLUME", "BAD_CHANGE"])
        rows = json.loads(self.writes("stock_prices")[0].content)
        self.assertEqual([row["ticker"] for row in rows], ["BTC-USD"])

    def test_news_race_duplicate_does_not_generate_ai_or_count_as_new(self):
        worker = self.load_worker("fetch_news")
        articles = [{"url": "https://example.com/race", "title": "Existing story"}] * 10
        with patch.object(worker, "fetch_from_rss", return_value=articles), \
             patch.object(worker, "generate_ai_summary") as ai, \
             patch("sys.stdout", new_callable=io.StringIO) as output:
            self.assertEqual(worker.main(), 0)
        ai.assert_not_called()
        self.assertIn("Skipped duplicates: 1", output.getvalue())
        request = self.writes("news_articles")[0]
        self.assertIn("resolution=ignore-duplicates", request.headers["prefer"])
        self.assertEqual(request.url.params["on_conflict"], "url")

    def test_url_lookup_checks_old_articles_and_deduplicates_candidates(self):
        self.news = [{"url": "https://example.com/old-retained-story"}]
        urls = [f"https://example.com/{i}" for i in range(26)]
        urls += [self.news[0]["url"], urls[0], ""]
        self.assertEqual(existing_news_urls(self.client, urls), {self.news[0]["url"]})
        self.assertEqual(len(self.requests), 2)
        self.assertTrue(all("fetched_at" not in request.url.params for request in self.requests))
        self.assertTrue(all("url" in request.url.params for request in self.requests))

    def test_delete_count_is_returned_without_expired_row_payloads(self):
        result = delete_with_count(self.client.table("stock_price_history").delete(
            count="exact", returning="minimal",
        ).lt("recorded_at", "2026-09-01"))
        self.assertEqual(result.count, 1234)
        self.assertEqual(result.data, [])
        self.assertIn("return=minimal", self.requests[0].headers["prefer"])

    def test_long_news_urls_do_not_overflow_a_single_lookup_request(self):
        urls = [f"https://example.com/{i}/" + "a" * 1000 for i in range(20)]
        existing_news_urls(self.client, urls)
        self.assertGreater(len(self.requests), 1)
        self.assertTrue(all(len(str(request.url)) < 6000 for request in self.requests))

    def test_delete_with_missing_count_fails_instead_of_logging_zero(self):
        with patch.object(self.rest.session, "request", return_value=httpx.Response(
            204, request=httpx.Request("DELETE", "https://example.invalid"),
        )), self.assertRaisesRegex(RuntimeError, "omitted"):
            delete_with_count(self.client.table("news_articles").delete(count="exact", returning="minimal"))


if __name__ == "__main__":
    unittest.main()
