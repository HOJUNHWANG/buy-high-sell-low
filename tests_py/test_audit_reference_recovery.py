"""Regressions for weekend ETF references and differently timed crypto snapshots."""

import sys
import unittest
from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from audit_market_data import (
    ASSET_CRYPTO, ASSET_ETF, AuditConfig, CoinGeckoReferenceProvider,
    EXIT_CRITICAL, EXIT_INCOMPLETE, EXIT_OK, NasdaqReferenceProvider,
    ReferenceQuote, StoredAsset, align_crypto_references, audit_assets,
    nearest_crypto_observation, parse_nasdaq_etf_history,
)


def instant(value):
    return datetime.fromisoformat(value).replace(tzinfo=timezone.utc)


def live_quote(timestamp, price="100"):
    return {"data": {"primaryData": {
        "lastSalePrice": price, "lastTradeTimestamp": timestamp,
    }}}


def history_row(session, price="100"):
    return {"data": {"tradesTable": {"rows": [
        {"date": session, "close": price},
    ]}}}


AUM = {"data": {"summaryData": {"AUM": {
    "label": "Assets Under Management (,000)", "value": "1000000",
}}}}


class NasdaqRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.sleep = patch("audit_market_data.sleep").start()
        self.addCleanup(patch.stopall)

    def provider(self, live, history, aum=AUM):
        provider = NasdaqReferenceProvider()
        calls = []

        def get_json(url, *, params):
            calls.append((url.rsplit("/", 1)[-1], params))
            return {"info": live, "historical": history, "summary": aum}[calls[-1][0]]

        provider._get_json = get_json
        return provider, calls

    def test_weekend_thursday_quote_uses_exact_friday_close(self):
        for audit_time in ("2026-08-30T00:30:00", "2026-08-31T01:00:00"):
            with self.subTest(audit_time=audit_time):
                now = instant(audit_time)
                provider, calls = self.provider(live_quote("Aug 27, 2026", "90"),
                                                history_row("08/28/2026"))
                quotes, errors = provider.fetch_etfs(["SPY"], now=now)
                self.assertEqual(errors, [])
                self.assertEqual(quotes["SPY"].price, 100)
                self.assertEqual(quotes["SPY"].as_of, instant("2026-08-28T20:00:00"))
                history_params = next(params for endpoint, params in calls if endpoint == "historical")
                self.assertEqual(history_params["fromdate"], "2026-08-28")
                self.assertEqual(history_params["todate"], "2026-08-29")
                asset = StoredAsset("SPY", "SPY", ASSET_ETF, 100,
                                    instant("2026-08-28T20:55:00"), 1e9, now.date(),
                                    now, "nasdaq.etf.summary.AUM", "aum")
                self.assertEqual(audit_assets([asset], quotes, now=now).exit_code, EXIT_OK)

    def test_holiday_and_premarket_use_last_market_session(self):
        for audit_time, expected in (
            ("2026-09-07T18:00:00", "09/04/2026"),  # Labor Day
            ("2026-09-08T12:00:00", "09/04/2026"),  # Before Tuesday open
            ("2026-04-03T18:00:00", "04/02/2026"),  # Good Friday
        ):
            with self.subTest(audit_time=audit_time):
                provider, _ = self.provider({"data": None}, history_row(expected))
                quotes, errors = provider.fetch_etfs(["SPY"], now=instant(audit_time))
                self.assertEqual(errors, [])
                self.assertEqual(quotes["SPY"].price, 100)

    def test_open_market_never_falls_back_to_prior_close(self):
        provider, calls = self.provider(live_quote("Sep 4, 2026"), history_row("09/04/2026"))
        quotes, errors = provider.fetch_etfs(["SPY"], now=instant("2026-09-08T13:30:00"))
        self.assertTrue(errors)
        self.assertIsNone(quotes["SPY"].price)
        self.assertEqual(quotes["SPY"].market_cap, 1e9)
        self.assertNotIn("historical", [endpoint for endpoint, _ in calls])

    def test_wrong_historical_date_stays_incomplete_but_keeps_aum(self):
        now = instant("2026-08-30T00:30:00")
        provider, calls = self.provider(live_quote("Aug 27, 2026"), history_row("08/27/2026"))
        quotes, errors = provider.fetch_etfs(["SPY"], now=now)
        self.assertIsNone(quotes["SPY"].price)
        self.assertEqual(quotes["SPY"].market_cap, 1e9)
        self.assertEqual(sum(endpoint == "historical" for endpoint, _ in calls), 2)
        asset = StoredAsset("SPY", "SPY", ASSET_ETF, 100,
                            instant("2026-08-28T20:55:00"), 1e9, now.date(),
                            now, "nasdaq.etf.summary.AUM", "aum")
        report = audit_assets([asset], quotes, now=now, provider_errors=errors)
        self.assertEqual(report.exit_code, EXIT_INCOMPLETE)
        self.assertEqual(report.comparisons[0].market_cap_deviation_pct, 0)

    def test_regular_close_preferred_over_extended_hours(self):
        live = live_quote("Sep 3, 2026 7:45 PM ET", "105")
        live["data"]["secondaryData"] = {
            "lastSalePrice": "100", "lastTradeTimestamp": "Closed at Sep 3, 2026 4:00 PM ET",
        }
        provider, calls = self.provider(live, {"data": None})
        quotes, errors = provider.fetch_etfs(["SPY"], now=instant("2026-09-03T23:50:00"))
        self.assertEqual(errors, [])
        self.assertEqual(quotes["SPY"].price, 100)
        self.assertNotIn("historical", [endpoint for endpoint, _ in calls])

    def test_secondary_close_can_recover_stale_primary(self):
        live = live_quote("Aug 27, 2026", "90")
        live["data"]["secondaryData"] = {
            "lastSalePrice": "100", "lastTradeTimestamp": "Closed at Aug 28, 2026 4:00 PM ET",
        }
        provider, _ = self.provider(live, {"data": None})
        quotes, errors = provider.fetch_etfs(["SPY"], now=instant("2026-08-30T00:30:00"))
        self.assertEqual(errors, [])
        self.assertEqual(quotes["SPY"].price, 100)

    def test_empty_and_malformed_200_responses_are_retried(self):
        for initial in ({"data": None}, [], live_quote("unparseable")):
            with self.subTest(initial=initial):
                responses = iter([initial, live_quote("Sep 3, 2026 3:50 PM ET")])
                session = Mock()

                def get(url, **kwargs):
                    response = Mock()
                    response.json.return_value = next(responses) if url.endswith("/info") else AUM
                    return response

                session.get.side_effect = get
                quotes, errors = NasdaqReferenceProvider(session=session).fetch_etfs(
                    ["SPY"], now=instant("2026-09-03T19:55:00"))
                self.assertEqual(errors, [])
                self.assertEqual(quotes["SPY"].price, 100)
                self.assertEqual(session.get.call_count, 3)

    def test_aum_empty_response_recovers_on_retry(self):
        provider, _ = self.provider(live_quote("Sep 3, 2026 3:50 PM ET"), {})
        original = provider._get_json
        responses = iter([{"data": None}, AUM])
        provider._get_json = lambda url, params: next(responses) if url.endswith("/summary") else original(url, params=params)
        quotes, errors = provider.fetch_etfs(["SPY"], now=instant("2026-09-03T19:55:00"))
        self.assertEqual(errors, [])
        self.assertEqual(quotes["SPY"].market_cap, 1e9)

    def test_historical_close_winter_timezone_and_invalid_values(self):
        quote = parse_nasdaq_etf_history(history_row("01/02/2026"), "SPY", date(2026, 1, 2))
        self.assertEqual(quote.as_of, instant("2026-01-02T21:00:00"))
        for value in ("N/A", "NaN", "0", "-1"):
            self.assertIsNone(parse_nasdaq_etf_history(history_row("01/02/2026", value), "SPY", date(2026, 1, 2)))


class CryptoObservationTests(unittest.TestCase):
    def setUp(self):
        self.now = instant("2026-09-03T01:00:00")
        self.asset = StoredAsset(
            "XMR-USD", "Monero", ASSET_CRYPTO, 100,
            self.now - timedelta(minutes=10), 1e9, self.now.date(),
            self.now - timedelta(minutes=30), "coingecko.simple.usd_market_cap", "circulating_market_cap",
        )
        self.quote = ReferenceQuote("XMR-USD", "CoinGecko", 103, 1e9, self.now)
        self.provider = Mock(spec=CoinGeckoReferenceProvider)

    def point(self, at, value):
        return [at.timestamp() * 1000, value]

    def run_alignment(self, asset=None, quote=None):
        asset, quote = asset or self.asset, quote or self.quote
        references, errors = align_crypto_references(
            [asset], {asset.ticker: quote}, now=self.now, config=AuditConfig(), provider=self.provider)
        return audit_assets([asset], references, now=self.now, provider_errors=errors)

    def test_normal_movement_since_price_ingestion_is_not_corruption(self):
        self.provider.fetch_history.return_value = {"prices": [self.point(self.asset.price_fetched_at, 100)]}
        report = self.run_alignment()
        self.assertEqual(report.exit_code, EXIT_OK)
        self.assertEqual(report.comparisons[0].price_deviation_pct, 0)
        self.assertEqual(report.comparisons[0].price_reference_as_of, self.asset.price_fetched_at)
        self.assertIn("reference_time_aligned", [finding.code for finding in report.findings])

    def test_persistent_provider_disagreement_still_fails(self):
        asset = replace(self.asset, price=97.4)
        self.provider.fetch_history.return_value = {"prices": [self.point(asset.price_fetched_at, 100)]}
        report = self.run_alignment(asset=asset, quote=replace(self.quote, price=100))
        self.assertEqual(report.exit_code, EXIT_CRITICAL)
        self.assertAlmostEqual(report.comparisons[0].price_deviation_pct, -2.6)

    def test_daily_market_cap_compares_to_its_own_timestamp(self):
        asset = replace(self.asset, market_cap_updated_at=self.now - timedelta(hours=23))
        quote = replace(self.quote, price=100, market_cap=1.1e9)
        self.provider.fetch_history.return_value = {"market_caps": [self.point(asset.market_cap_updated_at, 1e9)]}
        report = self.run_alignment(asset=asset, quote=quote)
        self.assertEqual(report.exit_code, EXIT_OK)
        self.assertEqual(report.comparisons[0].market_cap_reference_as_of, asset.market_cap_updated_at)

    def test_corrupt_cap_is_not_hidden_by_time_alignment(self):
        asset = replace(self.asset, market_cap=1.1e9)
        quote = replace(self.quote, price=100, market_cap=1.3e9)
        self.provider.fetch_history.return_value = {"market_caps": [self.point(asset.market_cap_updated_at, 1e9)]}
        report = self.run_alignment(asset=asset, quote=quote)
        self.assertEqual(report.exit_code, EXIT_CRITICAL)
        self.assertAlmostEqual(report.comparisons[0].market_cap_deviation_pct, 10)

    def test_nearest_time_is_used_even_when_farther_value_matches(self):
        self.provider.fetch_history.return_value = {"prices": [
            self.point(self.asset.price_fetched_at - timedelta(minutes=4), 100),
            self.point(self.asset.price_fetched_at, 103),
        ]}
        self.assertEqual(self.run_alignment().exit_code, EXIT_CRITICAL)

    def test_history_failure_or_missing_nearby_point_keeps_original_failure(self):
        for history in ({}, {"prices": [self.point(self.asset.price_fetched_at - timedelta(minutes=6), 100)]}):
            self.provider.fetch_history.return_value = history
            report = self.run_alignment()
            self.assertEqual(report.exit_code, EXIT_CRITICAL)
            self.assertTrue(report.provider_errors)
        self.provider.fetch_history.side_effect = ValueError("provider unavailable")
        self.assertEqual(self.run_alignment().exit_code, EXIT_CRITICAL)

    def test_stale_storage_and_simultaneous_quotes_are_not_relaxed(self):
        for asset in (replace(self.asset, price_fetched_at=self.now - timedelta(hours=2)),
                      replace(self.asset, price_fetched_at=self.now - timedelta(minutes=2))):
            with self.subTest(asset=asset):
                self.assertEqual(self.run_alignment(asset=asset).exit_code, EXIT_CRITICAL)
        self.provider.fetch_history.assert_not_called()

    def test_no_extra_requests_for_matching_quotes(self):
        self.assertEqual(self.run_alignment(quote=replace(self.quote, price=100)).exit_code, EXIT_OK)
        self.provider.fetch_history.assert_not_called()

    def test_missing_crypto_timestamp_cannot_pass(self):
        self.assertEqual(self.run_alignment(quote=replace(self.quote, as_of=None)).exit_code, EXIT_INCOMPLETE)

    def test_bad_historical_rows_and_future_observations_are_rejected(self):
        rows = [None, [], [1, 2, 3], [1e100, 100], [0, 100],
                self.point(self.now, float("nan")), self.point(self.now, -1),
                self.point(self.now + timedelta(seconds=1), 100)]
        self.assertIsNone(nearest_crypto_observation(rows, self.now, now=self.now))

    def test_unrelated_historical_timestamp_cannot_pass(self):
        quote = replace(self.quote, price=100, price_as_of=self.now - timedelta(hours=1))
        report = audit_assets([self.asset], {self.asset.ticker: quote}, now=self.now)
        self.assertEqual(report.exit_code, EXIT_INCOMPLETE)
        self.assertIsNone(report.comparisons[0].price_deviation_pct)


if __name__ == "__main__":
    unittest.main()
