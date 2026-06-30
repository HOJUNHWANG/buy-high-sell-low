import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from price_adjustments import (  # noqa: E402
    get_reviewed_anomaly_override,
    normalize_change_pct,
    record_price_anomaly,
)


class NormalizeChangePctTests(unittest.TestCase):
    def test_applies_known_corporate_action_override(self):
        value, note, reason = normalize_change_pct(
            "HON", "2026-06-29", -50.96895
        )

        self.assertEqual(value, -6.45)
        self.assertIn("corporate-action override", note or "")
        self.assertEqual(reason, "corporate_action_override")

    def test_suppresses_unreviewed_extreme_equity_change(self):
        value, note, reason = normalize_change_pct(
            "AAPL", "2026-07-01", 45.2
        )

        self.assertIsNone(value)
        self.assertIn("suppressed", note or "")
        self.assertEqual(reason, "extreme_change_suppressed")

    def test_keeps_normal_equity_change(self):
        value, note, reason = normalize_change_pct(
            "AAPL", "2026-07-01", -3.25
        )

        self.assertEqual(value, -3.25)
        self.assertIsNone(note)
        self.assertIsNone(reason)

    def test_keeps_extreme_crypto_change(self):
        value, note, reason = normalize_change_pct(
            "BTC-USD", "2026-07-01", 42.0, is_crypto=True
        )

        self.assertEqual(value, 42.0)
        self.assertIsNone(note)
        self.assertIsNone(reason)

    def test_keeps_missing_provider_change(self):
        value, note, reason = normalize_change_pct(
            "AAPL", "2026-07-01", None
        )

        self.assertIsNone(value)
        self.assertIsNone(note)
        self.assertIsNone(reason)

    def test_records_anomaly_once_with_review_fields_preserved(self):
        client = MagicMock()

        error = record_price_anomaly(
            client,
            ticker="hon",
            market_date="2026-06-29",
            price=227.71,
            provider_change_pct=-50.97,
            applied_change_pct=-6.45,
            reason="corporate_action_override",
            details="adjusted",
        )

        self.assertIsNone(error)
        client.table.assert_called_once_with("price_anomalies")
        _, kwargs = client.table.return_value.upsert.call_args
        self.assertEqual(kwargs["on_conflict"], "ticker,market_date,reason")
        self.assertTrue(kwargs["ignore_duplicates"])

    def test_anomaly_persistence_failure_does_not_raise(self):
        client = MagicMock()
        client.table.return_value.upsert.side_effect = RuntimeError("offline")

        error = record_price_anomaly(
            client,
            ticker="AAPL",
            market_date="2026-07-01",
            price=100.0,
            provider_change_pct=45.0,
            applied_change_pct=None,
            reason="extreme_change_suppressed",
            details="suppressed",
        )

        self.assertEqual(error, "offline")

    def test_returns_admin_reviewed_override(self):
        client = MagicMock()
        builder = MagicMock()
        client.table.return_value = builder
        builder.select.return_value = builder
        builder.eq.return_value = builder
        builder.limit.return_value = builder
        builder.execute.return_value.data = [{"applied_change_pct": -6.45}]

        value, error = get_reviewed_anomaly_override(
            client,
            ticker="hon",
            market_date="2026-06-29",
            reason="extreme_change_suppressed",
        )

        self.assertEqual(value, -6.45)
        self.assertIsNone(error)
        builder.eq.assert_any_call("status", "reviewed")

    def test_review_lookup_failure_does_not_raise(self):
        client = MagicMock()
        client.table.side_effect = RuntimeError("offline")

        value, error = get_reviewed_anomaly_override(
            client,
            ticker="AAPL",
            market_date="2026-07-01",
            reason="extreme_change_suppressed",
        )

        self.assertIsNone(value)
        self.assertEqual(error, "offline")


if __name__ == "__main__":
    unittest.main()
