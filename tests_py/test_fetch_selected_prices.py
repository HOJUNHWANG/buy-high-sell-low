import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ.setdefault("TWELVE_DATA_API_KEY", "test-provider-key")

SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

import fetch_prices  # noqa: E402


class FetchSelectedPricesTests(unittest.TestCase):
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
