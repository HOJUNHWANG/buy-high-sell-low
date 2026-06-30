import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from price_adjustments import normalize_change_pct  # noqa: E402


class NormalizeChangePctTests(unittest.TestCase):
    def test_applies_known_corporate_action_override(self):
        value, note = normalize_change_pct("HON", "2026-06-29", -50.96895)

        self.assertEqual(value, -6.45)
        self.assertIn("corporate-action override", note or "")

    def test_suppresses_unreviewed_extreme_equity_change(self):
        value, note = normalize_change_pct("AAPL", "2026-07-01", 45.2)

        self.assertIsNone(value)
        self.assertIn("suppressed", note or "")

    def test_keeps_normal_equity_change(self):
        value, note = normalize_change_pct("AAPL", "2026-07-01", -3.25)

        self.assertEqual(value, -3.25)
        self.assertIsNone(note)

    def test_keeps_extreme_crypto_change(self):
        value, note = normalize_change_pct(
            "BTC-USD", "2026-07-01", 42.0, is_crypto=True
        )

        self.assertEqual(value, 42.0)
        self.assertIsNone(note)

    def test_keeps_missing_provider_change(self):
        value, note = normalize_change_pct("AAPL", "2026-07-01", None)

        self.assertIsNone(value)
        self.assertIsNone(note)


if __name__ == "__main__":
    unittest.main()
