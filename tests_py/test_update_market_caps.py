import sys
import unittest
from pathlib import Path
from unittest.mock import ANY, MagicMock, patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from update_market_caps import (  # noqa: E402
    ASSET_CRYPTO,
    ASSET_EQUITY,
    ASSET_ETF,
    CRYPTO_COINGECKO_IDS,
    MarketDataProvider,
    MarketCapObservation,
    MarketCapProviderError,
    PreviousMarketData,
    build_log_details,
    log_result,
    observation_from_provider_data,
    process_ticker,
    resolve_tickers,
    update_market_cap,
    validate_market_cap,
    _nasdaq_etf_aum,
)


class ProviderNormalizationTests(unittest.TestCase):
    def test_equity_uses_company_market_cap(self):
        observation = observation_from_provider_data(
            "MU",
            {
                "marketCap": 930_000_000_000,
                "currentPrice": 823.0,
                "sharesOutstanding": 1_130_000_000,
                "totalAssets": 70_000_000_000,
            },
        )

        self.assertEqual(observation.asset_class, ASSET_EQUITY)
        self.assertEqual(observation.semantic, "equity_market_cap")
        self.assertEqual(observation.market_cap, 930_000_000_000)
        self.assertEqual(observation.source, "yfinance.info.marketCap")

    def test_etf_uses_aum_and_ignores_ambiguous_market_cap(self):
        observation = observation_from_provider_data(
            "QQQ",
            {
                "totalAssets": 410_000_000_000,
                "marketCap": 12_000_000,
                "navPrice": 600.0,
            },
        )

        self.assertEqual(observation.asset_class, ASSET_ETF)
        self.assertEqual(observation.semantic, "aum")
        self.assertEqual(observation.market_cap, 410_000_000_000)
        self.assertEqual(observation.source, "yfinance.info.totalAssets")

    def test_crypto_can_derive_circulating_market_cap(self):
        observation = observation_from_provider_data(
            "DOGE-USD",
            {"regularMarketPrice": 0.07, "circulatingSupply": 150_000_000_000},
        )

        self.assertEqual(observation.asset_class, ASSET_CRYPTO)
        self.assertEqual(observation.semantic, "circulating_market_cap")
        self.assertEqual(observation.market_cap, 10_500_000_000)
        self.assertEqual(
            observation.source, "derived.price_x_circulating_supply"
        )


class MarketCapValidationTests(unittest.TestCase):
    def test_rejects_micron_sized_drop_without_price_or_share_support(self):
        observation = MarketCapObservation(
            ticker="MU",
            asset_class=ASSET_EQUITY,
            semantic="equity_market_cap",
            market_cap=145_000_000_000,
            source="test",
        )

        result = validate_market_cap(
            observation,
            PreviousMarketData(market_cap=930_000_000_000, price=823.0),
        )

        self.assertFalse(result.accepted)
        self.assertIn("unexplained change", result.reason)

    def test_rejects_provider_cap_inconsistent_with_price_and_shares(self):
        observation = MarketCapObservation(
            ticker="MU",
            asset_class=ASSET_EQUITY,
            semantic="equity_market_cap",
            market_cap=145_000_000_000,
            source="test",
            price=823.0,
            quantity=1_130_000_000,
            quantity_name="shares_outstanding",
        )

        result = validate_market_cap(
            observation,
            PreviousMarketData(market_cap=930_000_000_000, price=823.0),
        )

        self.assertFalse(result.accepted)
        self.assertIn("price x shares_outstanding", result.reason)

    def test_accepts_large_correction_supported_by_price_and_shares(self):
        observation = MarketCapObservation(
            ticker="MU",
            asset_class=ASSET_EQUITY,
            semantic="equity_market_cap",
            market_cap=930_000_000_000,
            source="test",
            price=823.0,
            quantity=1_130_000_000,
            quantity_name="shares_outstanding",
        )

        result = validate_market_cap(
            observation,
            PreviousMarketData(market_cap=145_000_000_000, price=823.0),
        )

        self.assertTrue(result.accepted)
        self.assertIn("price x shares_outstanding", result.reason)

    def test_accepts_trusted_primary_correction_of_unverified_legacy_value(self):
        observation = MarketCapObservation(
            ticker="MU",
            asset_class=ASSET_EQUITY,
            semantic="equity_market_cap",
            market_cap=929_500_000_000,
            source="nasdaq.screener.marketCap",
        )

        result = validate_market_cap(
            observation,
            PreviousMarketData(
                market_cap=145_000_000_000,
                price=823.0,
                source="legacy:unverified",
                metric="equity_market_cap",
            ),
        )

        self.assertTrue(result.accepted)
        self.assertIn("unverified legacy", result.reason)

    def test_rejects_equity_cap_when_independent_provider_disagrees(self):
        observation = MarketCapObservation(
            ticker="MU",
            asset_class=ASSET_EQUITY,
            semantic="equity_market_cap",
            market_cap=1_300_000_000,
            source="nasdaq.screener.marketCap",
            cross_check_market_cap=1_000_000_000,
            cross_check_source="yfinance.info.marketCap",
        )

        result = validate_market_cap(
            observation,
            PreviousMarketData(market_cap=1_000_000_000, price=100),
        )

        self.assertFalse(result.accepted)
        self.assertIn("providers disagree", result.reason)


class SafeWriteTests(unittest.TestCase):
    def test_provider_error_never_calls_updater(self):
        updater = MagicMock()

        outcome = process_ticker(
            "MU",
            MagicMock(),
            fetcher=MagicMock(side_effect=RuntimeError("provider offline")),
            state_loader=MagicMock(),
            updater=updater,
        )

        self.assertEqual(outcome.status, "failed")
        self.assertEqual(outcome.fallback_action, "preserved_last_known_good")
        updater.assert_not_called()

    def test_dry_run_validates_but_never_calls_updater(self):
        updater = MagicMock()
        observation = MarketCapObservation(
            ticker="MU",
            asset_class=ASSET_EQUITY,
            semantic="equity_market_cap",
            market_cap=930_000_000_000,
            source="test",
            price=823.0,
            quantity=1_130_000_000,
            quantity_name="shares_outstanding",
        )

        outcome = process_ticker(
            "MU",
            MagicMock(),
            dry_run=True,
            fetcher=MagicMock(return_value=observation),
            state_loader=MagicMock(
                return_value=PreviousMarketData(145_000_000_000, 823.0)
            ),
            updater=updater,
        )

        self.assertEqual(outcome.status, "would_update")
        updater.assert_not_called()

    def test_validated_write_passes_source_and_metric(self):
        updater = MagicMock()
        observation = MarketCapObservation(
            ticker="QQQ",
            asset_class=ASSET_ETF,
            semantic="aum",
            market_cap=410_000_000_000,
            source="yfinance.info.totalAssets",
        )

        outcome = process_ticker(
            "QQQ",
            MagicMock(),
            fetcher=MagicMock(return_value=observation),
            state_loader=MagicMock(
                return_value=PreviousMarketData(400_000_000_000, 590.0)
            ),
            updater=updater,
        )

        self.assertEqual(outcome.status, "updated")
        updater.assert_called_once_with(
            "QQQ",
            410_000_000_000,
            ANY,
            source="yfinance.info.totalAssets",
            metric="aum",
        )


class PrimaryProviderTests(unittest.TestCase):
    def test_all_tracked_crypto_have_explicit_coingecko_ids(self):
        from update_market_caps import CRYPTO_TICKERS

        self.assertEqual(set(CRYPTO_TICKERS), set(CRYPTO_COINGECKO_IDS))

    def test_equity_uses_nasdaq_primary_with_yfinance_cross_check(self):
        provider = MarketDataProvider(session=MagicMock())
        provider._nasdaq_rows = {
            "MU": {
                "symbol": "MU",
                "lastsale": "$823.00",
                "marketCap": "930000000000.00",
            }
        }
        provider._try_yfinance = MagicMock(
            return_value=(
                MarketCapObservation(
                    ticker="MU",
                    asset_class=ASSET_EQUITY,
                    semantic="equity_market_cap",
                    market_cap=929_500_000_000,
                    source="yfinance.info.marketCap",
                    price=823.0,
                    quantity=1_130_000_000,
                    quantity_name="shares_outstanding",
                ),
                None,
            )
        )

        observation = provider.fetch_observation("MU")

        self.assertEqual(observation.market_cap, 930_000_000_000)
        self.assertEqual(observation.source, "nasdaq.screener.marketCap")
        self.assertEqual(observation.cross_check_market_cap, 929_500_000_000)

    @patch("update_market_caps.time.time", return_value=1_000)
    def test_crypto_uses_coingecko_market_cap_and_price(self, _time):
        provider = MarketDataProvider(session=MagicMock())
        provider._coingecko_rows = {
            "dogecoin": {
                "usd": 0.07,
                "usd_market_cap": 10_500_000_000,
                "last_updated_at": 995,
            }
        }
        provider._try_yfinance = MagicMock(return_value=(None, "offline"))

        observation = provider.fetch_observation("DOGE-USD")

        self.assertEqual(observation.market_cap, 10_500_000_000)
        self.assertEqual(observation.price, 0.07)
        self.assertEqual(
            observation.source, "coingecko.simple.usd_market_cap"
        )

    @patch("update_market_caps.time.time", return_value=2_000)
    def test_crypto_rejects_stale_coingecko_response(self, _time):
        provider = MarketDataProvider(session=MagicMock())
        provider._coingecko_rows = {
            "dogecoin": {
                "usd": 0.07,
                "usd_market_cap": 10_500_000_000,
                "last_updated_at": 1_000,
            }
        }

        with self.assertRaisesRegex(MarketCapProviderError, "stale"):
            provider.fetch_observation("DOGE-USD")

    def test_crypto_never_writes_yahoo_market_cap_when_coingecko_is_unavailable(self):
        provider = MarketDataProvider(session=MagicMock())
        provider._coingecko_rows = {}
        provider._coingecko_error = "rate limited"
        provider._try_yfinance = MagicMock()

        with self.assertRaisesRegex(
            MarketCapProviderError, "preserving last-known-good"
        ):
            provider.fetch_observation("DOGE-USD")

        provider._try_yfinance.assert_not_called()

    def test_parses_nasdaq_etf_aum_thousands_unit(self):
        self.assertEqual(
            _nasdaq_etf_aum(
                {
                    "data": {
                        "summaryData": {
                            "AUM": {
                                "label": "Assets Under Management (,000)",
                                "value": "$656,570,000.00",
                            }
                        }
                    }
                }
            ),
            656_570_000_000,
        )

    def test_etf_uses_nasdaq_share_class_aum_not_yahoo_total_assets(self):
        response = MagicMock()
        response.json.return_value = {
            "data": {
                "summaryData": {
                    "AUM": {
                        "label": "Assets Under Management (,000)",
                        "value": "$656,570,000.00",
                    }
                }
            }
        }
        session = MagicMock()
        session.get.return_value = response
        provider = MarketDataProvider(session=session)
        provider._try_yfinance = MagicMock(
            return_value=(
                MarketCapObservation(
                    ticker="VTI",
                    asset_class=ASSET_ETF,
                    semantic="aum",
                    market_cap=2_297_268_322_304,
                    source="yfinance.info.totalAssets",
                    price=368.0,
                ),
                None,
            )
        )

        observation = provider.fetch_observation("VTI")

        self.assertEqual(observation.market_cap, 656_570_000_000)
        self.assertEqual(observation.source, "nasdaq.etf.summary.AUM")
        self.assertEqual(observation.cross_check_market_cap, 2_297_268_322_304)

    def test_etf_never_falls_back_to_broader_yahoo_fund_assets(self):
        response = MagicMock()
        response.json.return_value = {"data": {"summaryData": {}}}
        session = MagicMock()
        session.get.return_value = response
        provider = MarketDataProvider(session=session)
        provider._try_yfinance = MagicMock()

        with self.assertRaisesRegex(
            MarketCapProviderError, "preserving last-known-good"
        ):
            provider.fetch_observation("VTI")

        provider._try_yfinance.assert_not_called()


class ProvenanceWriteTests(unittest.TestCase):
    def test_writes_current_and_snapshot_through_atomic_rpc(self):
        client = MagicMock()

        update_market_cap(
            "QQQ",
            410_000_000_000,
            client,
            source="yfinance.info.totalAssets",
            metric="aum",
        )

        rpc_name, params = client.rpc.call_args.args
        self.assertEqual(rpc_name, "upsert_market_cap_observation")
        self.assertEqual(params["p_ticker"], "QQQ")
        self.assertEqual(params["p_market_cap"], 410_000_000_000)
        self.assertEqual(params["p_metric"], "aum")
        self.assertEqual(params["p_source"], "yfinance.info.totalAssets")
        self.assertIn("p_observed_at", params)
        client.rpc.return_value.execute.assert_called_once()

    @patch("update_market_caps.time.sleep")
    def test_retries_the_atomic_rpc_as_one_idempotent_operation(self, _sleep):
        client = MagicMock()
        client.rpc.return_value.execute.side_effect = [
            RuntimeError("transient"),
            MagicMock(data=[]),
        ]

        update_market_cap(
            "QQQ",
            410_000_000_000,
            client,
            source="yfinance.info.totalAssets",
            metric="aum",
        )

        self.assertEqual(client.rpc.return_value.execute.call_count, 2)


class TickerSelectionTests(unittest.TestCase):
    def test_explicit_tickers_are_normalized_deduplicated_and_ordered(self):
        tickers = resolve_tickers(["mu,btc-usd", "MU"], ["qqq"], "all")

        self.assertEqual(tickers, ["MU", "BTC-USD", "QQQ"])

    def test_asset_class_mismatch_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "do not belong to crypto"):
            resolve_tickers(["MU"], [], "crypto")


class FetchLogTests(unittest.TestCase):
    def test_log_records_failed_tickers_and_structured_source_details(self):
        client = MagicMock()
        details = {
            "source_by_ticker": {"MU": "yfinance.info.marketCap"},
            "fallback_policy": "disabled",
        }

        log_result(
            "market_caps",
            "partial",
            1,
            1,
            failed_tickers=["QQQ"],
            source_details=details,
            client=client,
        )

        payload = client.table.return_value.insert.call_args.args[0]
        self.assertEqual(payload["failed_tickers"], ["QQQ"])
        self.assertIn('"source_by_ticker"', payload["error_message"])

    def test_build_log_details_includes_preservation_action(self):
        from update_market_caps import RunSummary, TickerOutcome

        summary = RunSummary(
            outcomes=[
                TickerOutcome(
                    ticker="MU",
                    asset_class=ASSET_EQUITY,
                    semantic="equity_market_cap",
                    status="failed",
                    reason="provider failure",
                    source="provider.error",
                    fallback_action="preserved_last_known_good",
                )
            ]
        )

        details = build_log_details(summary)

        self.assertEqual(
            details["fallback_action_by_ticker"]["MU"],
            "preserved_last_known_good",
        )


if __name__ == "__main__":
    unittest.main()
