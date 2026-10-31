import sys
import unittest
from datetime import date,datetime,timezone
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from market_calendar import (  # noqa: E402
    get_market_holiday,
    is_market_holiday,
    previous_market_day, quote_session_date, session_close_minutes,
)


class MarketCalendarTests(unittest.TestCase):
    def test_independence_day_observed_is_closed(self):
        self.assertTrue(is_market_holiday(date(2026, 7, 3)))
        self.assertEqual(
            get_market_holiday(date(2026, 7, 3)),
            "Independence Day observed",
        )

    def test_normal_weekday_is_not_holiday(self):
        self.assertFalse(is_market_holiday(date(2026, 7, 2)))

    def test_previous_market_day_skips_weekend_and_observed_holiday(self):
        self.assertEqual(
            previous_market_day(date(2026, 7, 6)),
            date(2026, 7, 2),
        )

    def test_quote_session_uses_provider_date_on_weekend(self):
        received=datetime(2026,10,31,12,tzinfo=timezone.utc)
        self.assertEqual(quote_session_date({"datetime":"2026-10-30"},observed_at=received.isoformat(),ingested_at=received,is_crypto=False),date(2026,10,30))
        with self.assertRaises(ValueError):quote_session_date({"datetime":"2026-04-03"},observed_at=received.isoformat(),ingested_at=received,is_crypto=False)
        with self.assertRaises(ValueError):quote_session_date({"datetime":"2026-11-02"},observed_at=received.isoformat(),ingested_at=received,is_crypto=False)
        self.assertEqual(quote_session_date({"datetime":"2026-10-31"},observed_at=received.isoformat(),ingested_at=received,is_crypto=True),date(2026,10,31))
    def test_early_closes_match_nyse(self):
        self.assertEqual(session_close_minutes(date(2026,11,27)),780)
        self.assertEqual(session_close_minutes(date(2026,7,2)),960)


if __name__ == "__main__":
    unittest.main()
