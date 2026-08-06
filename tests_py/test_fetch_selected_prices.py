import os
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo


os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ.setdefault("TWELVE_DATA_API_KEY", "test-provider-key")

SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

with patch("supabase.create_client", return_value=MagicMock()):
    import fetch_prices  # noqa: E402


class FetchSelectedPricesTests(unittest.TestCase):
    def test_current_price_freshness_uses_ingestion_not_provider_time(self):
        ingested_at = datetime(2026, 8, 6, 19, 36, tzinfo=timezone.utc)

        row = fetch_prices.build_current_price_row(
            ticker="GLD",
            price=388.665,
            change_pct=1.2,
            volume=123,
            ingested_at=ingested_at,
        )

        self.assertEqual(row["fetched_at"], "2026-08-06T19:36:00+00:00")

    def test_settlement_catchup_remains_available_until_next_session(self):
        et = ZoneInfo("America/New_York")

        self.assertEqual(
            fetch_prices.get_post_market_stock_fetch_mode(
                datetime(2026, 8, 6, 20, 0, tzinfo=et)
            ),
            "settlement_catchup",
        )
        self.assertEqual(
            fetch_prices.get_post_market_stock_fetch_mode(
                datetime(2026, 8, 8, 12, 0, tzinfo=et)
            ),
            "settlement_catchup",
        )
        self.assertEqual(
            fetch_prices.get_post_market_stock_fetch_mode(
                datetime(2026, 8, 10, 8, 0, tzinfo=et)
            ),
            "settlement_catchup",
        )

    def test_settlement_target_rolls_to_latest_completed_session(self):
        et = ZoneInfo("America/New_York")

        self.assertEqual(
            fetch_prices.settlement_market_date(
                datetime(2026, 8, 8, 12, 0, tzinfo=et)
            ).isoformat(),
            "2026-08-07",
        )
        self.assertEqual(
            fetch_prices.settlement_market_date(
                datetime(2026, 8, 10, 8, 0, tzinfo=et)
            ).isoformat(),
            "2026-08-07",
        )
        self.assertEqual(
            fetch_prices.settlement_market_date(
                datetime(2026, 8, 10, 18, 0, tzinfo=et)
            ).isoformat(),
            "2026-08-10",
        )

    def test_settlement_completion_requires_full_success(self):
        client = MagicMock()
        builder = MagicMock()
        client.table.return_value = builder
        builder.select.return_value = builder
        builder.eq.return_value = builder
        builder.gte.return_value = builder
        builder.limit.return_value = builder
        builder.execute.return_value.data = [{"id": 1}]
        et = ZoneInfo("America/New_York")

        with patch.object(fetch_prices, "supabase", client):
            completed = fetch_prices.already_completed_settlement_close_today(
                datetime(2026, 8, 6, 20, 0, tzinfo=et)
            )

        self.assertTrue(completed)
        builder.eq.assert_any_call("status", "success")
        builder.eq.assert_any_call("records_failed", 0)
        builder.gte.assert_any_call(
            "records_fetched",
            len(fetch_prices.ALL_EQUITY_TICKERS) + len(fetch_prices.ETF_TICKERS),
        )

    def test_provider_errors_redact_api_key(self):
        error = RuntimeError(
            f"request failed?apikey={fetch_prices.TWELVE_DATA_API_KEY}"
        )

        message = fetch_prices.safe_provider_error(error)

        self.assertNotIn(fetch_prices.TWELVE_DATA_API_KEY, message)
        self.assertIn("[redacted]", message)

    @patch("fetch_prices.upsert_prices")
    @patch("fetch_prices.fetch_batch")
    def test_refreshes_mixed_tickers_and_normalizes_crypto_failures(
        self, fetch_batch, upsert_prices
    ):
        fetch_batch.side_effect = [
            {"MU": {"close": "100"}},
            {"BTC/USD": {"close": "100000"}},
        ]
        upsert_prices.side_effect = [(1, []), (0, ["BTC/USD"])]

        fetched, failed = fetch_prices.fetch_selected_prices(
            ["BTC-USD", "MU", "MU"]
        )

        self.assertEqual(fetched, 1)
        self.assertEqual(failed, ["BTC-USD"])
        self.assertEqual(fetch_batch.call_args_list[0].args[0], ["MU"])
        self.assertEqual(fetch_batch.call_args_list[1].args[0], ["BTC/USD"])
        self.assertEqual(
            upsert_prices.call_args_list[1].kwargs["ticker_map"],
            {"BTC/USD": "BTC-USD"},
        )

    @patch("fetch_prices.upsert_prices", return_value=(1, []))
    @patch("fetch_prices.fetch_batch")
    def test_marks_symbols_missing_from_provider_response_as_failed(
        self, fetch_batch, _upsert_prices
    ):
        fetch_batch.return_value = {"MU": {"close": "100"}}

        fetched, failed = fetch_prices.fetch_selected_prices(["MU", "AAPL"])

        self.assertEqual(fetched, 1)
        self.assertEqual(failed, ["AAPL"])

    @patch("fetch_prices.fetch_batch", side_effect=RuntimeError("provider down"))
    def test_batch_exception_fails_only_requested_tickers(self, _fetch_batch):
        fetched, failed = fetch_prices.fetch_selected_prices(
            ["MU", "BTC-USD"]
        )

        self.assertEqual(fetched, 0)
        self.assertEqual(failed, ["BTC-USD", "MU"])


if __name__ == "__main__":
    unittest.main()
