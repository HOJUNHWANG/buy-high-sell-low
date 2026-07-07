import sys
import unittest
from datetime import date
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from market_calendar import (  # noqa: E402
    get_market_holiday,
    is_market_holiday,
    previous_market_day,
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


if __name__ == "__main__":
    unittest.main()
