import os
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
with patch("supabase.create_client", return_value=MagicMock()):
    import seed_history
    import seed_etfs


class TwelveHistoryTests(unittest.TestCase):
    def test_crypto_history_uses_provider_pair_and_writes_db_ticker_within_one_year(self):
        today = datetime.utcnow().date()
        rows = [{"ticker": "UNI/USD", "date": (today-timedelta(days=days)).isoformat(), "close": 7}
                for days in [400, 1]]
        with patch.object(seed_history, "HISTORY_SOURCE", "twelve"), \
             patch.object(seed_etfs, "fetch_twelve_history", return_value=rows) as fetch, \
             patch.object(seed_history, "upsert_daily_rows") as upsert, \
             patch.object(seed_history.time, "sleep"), \
             patch.object(seed_history.yf, "download") as yahoo:
            seed_history.seed_ticker_history(["UNI-USD"])
        fetch.assert_called_once_with("UNI/USD")
        upsert.assert_called_once_with("UNI-USD", [{**rows[1], "ticker": "UNI-USD"}])
        yahoo.assert_not_called()

    def test_empty_provider_history_fails_the_workflow(self):
        with patch.object(seed_history, "HISTORY_SOURCE", "twelve"), \
             patch.object(seed_etfs, "fetch_twelve_history", return_value=[]), \
             patch.object(seed_history, "upsert_daily_rows") as upsert, \
             patch.object(seed_history.time, "sleep"):
            with self.assertRaisesRegex(RuntimeError, "UNI-USD"):
                seed_history.seed_ticker_history(["UNI-USD"])
        upsert.assert_not_called()


if __name__ == "__main__":
    unittest.main()
