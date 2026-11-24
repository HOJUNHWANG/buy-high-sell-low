import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import ANY, MagicMock, patch

import requests


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from update_market_caps import (  # noqa: E402
    ASSET_CRYPTO,
    ASSET_EQUITY,
    ASSET_ETF,
    CRYPTO_COINGECKO_IDS,
    EtfAumUnavailable,
    MarketDataProvider,
    MarketCapObservation,
    MarketCapProviderError,
    PreviousMarketData,
    RunSummary,
    build_log_details,
    log_result,
    observation_from_provider_data,
    process_ticker,
    resolve_tickers,
    update_market_cap,
    validate_market_cap,
)
from audit_market_data import ReferenceQuote, parse_nasdaq_etf_aum
from etf_aum import ETFIQ_AUM_URL, EtfAumProvider


ETF_RUN_TIME = datetime(2026, 11, 24, 1, tzinfo=timezone.utc)


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

    @patch("update_market_caps.datetime", wraps=datetime)
    def test_bulk_run_retains_recent_verified_etf_aum_without_writing(self, clock):
        clock.now.return_value = ETF_RUN_TIME
        fetcher = MagicMock(side_effect=EtfAumUnavailable("providers unavailable"))
        state_loader = MagicMock(return_value=PreviousMarketData(
            market_cap=991_417_024_000,
            price=None,
            metric="aum",
            source="nasdaq.etf.summary.AUM",
            observed_at=datetime(2026, 11, 23, 1, tzinfo=timezone.utc),
        ))
        updater = MagicMock()

        outcome = process_ticker(
            "VOO", MagicMock(), fetcher=fetcher, state_loader=state_loader,
            updater=updater, allow_recent_etf_retention=True,
        )

        self.assertEqual(outcome.status, "retained")
        summary = RunSummary(outcomes=[outcome])
        self.assertEqual((summary.updated, summary.retained, summary.failed), (0, 1, 0))
        self.assertIn("VOO", build_log_details(summary)["retained"])
        updater.assert_not_called()

        clock.now.return_value = datetime(2026, 11, 25, 1, tzinfo=timezone.utc)
        stale = process_ticker(
            "VOO", MagicMock(), fetcher=fetcher, state_loader=state_loader,
            updater=updater, allow_recent_etf_retention=True,
        )
        self.assertEqual(stale.status, "failed")
        updater.assert_not_called()

        clock.now.return_value = ETF_RUN_TIME
        targeted = process_ticker(
            "VOO", MagicMock(), fetcher=fetcher, state_loader=state_loader, updater=updater,
        )
        self.assertEqual(targeted.status, "failed")
        updater.assert_not_called()
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
        from update_market_caps import ALL_CRYPTO_TICKERS

        self.assertEqual(set(ALL_CRYPTO_TICKERS), set(CRYPTO_COINGECKO_IDS))

    def test_retries_empty_etf_aum_and_caches_the_valid_response(self):
        session = MagicMock()
        session.get.return_value.json.side_effect = [
            {"data": {"summaryData": {"AUM": {"value": "--"}}}},
            {"data": {"summaryData": {"AUM": {
                "label": "Assets Under Management (,000)", "value": "451,205,472",
            }}}},
        ]
        provider = MarketDataProvider(session=session)
        provider._try_yfinance = MagicMock(return_value=(None, None))

        with patch("audit_market_data.sleep") as sleep:
            for _ in range(2):
                self.assertEqual(provider.fetch_observation("QQQ").market_cap, 451_205_472_000)

        self.assertEqual(session.get.call_count, 2)
        sleep.assert_called_once()

    def test_equity_uses_nasdaq_primary_with_yfinance_cross_check(self):
        provider = MarketDataProvider(session=MagicMock())
        provider._nasdaq.fetch_equities = MagicMock(return_value=({
            "MU": ReferenceQuote(
                "MU", "Nasdaq", 823.0, 930_000_000_000,
                datetime(2026, 10, 30, 20, tzinfo=timezone.utc),
            ),
        }, []))
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
        self.assertEqual(observation.source, "nasdaq.equity.summary.MarketCap")
        self.assertEqual(observation.cross_check_market_cap, 929_500_000_000)

    def test_prefetch_batches_selected_equities_and_reuses_missing_results(self):
        provider = MarketDataProvider(session=MagicMock())
        provider._nasdaq.fetch_equities = MagicMock(return_value=(
            {}, ["Nasdaq equity live quote failed for MU: unavailable"],
        ))
        provider._try_yfinance = MagicMock(return_value=(None, "unavailable"))
        provider.prefetch_equities(["MU", "INTC", "MU", "BTC-USD", "QQQ"])
        for _ in range(2):
            with self.assertRaises(MarketCapProviderError):
                provider.fetch_observation("MU")
        provider._nasdaq.fetch_equities.assert_called_once_with(["MU", "INTC"])

    def test_equity_formula_uses_primary_price_without_mixing_sessions(self):
        provider = MarketDataProvider(session=MagicMock())
        provider._nasdaq.fetch_equities = MagicMock(return_value=({
            "INTC": ReferenceQuote(
                "INTC", "Nasdaq", 65.76, 347_546_171_043,
                datetime(2026, 10, 30, 20, tzinfo=timezone.utc),
            ),
        }, []))
        provider._try_yfinance = MagicMock(return_value=(MarketCapObservation(
            ticker="INTC", asset_class=ASSET_EQUITY, semantic="equity_market_cap",
            market_cap=486_596_349_878, source="yfinance.info.marketCap",
            price=92.07, quantity=5_310_000_000, quantity_name="shares_outstanding",
        ), None))
        observation = provider.fetch_observation("INTC")
        self.assertEqual(observation.price, 65.76)
        self.assertTrue(validate_market_cap(
            observation, PreviousMarketData(market_cap=504_882_690_386, price=65.76),
        ).accepted)

    def test_undated_primary_cap_is_not_written_as_fresh(self):
        provider = MarketDataProvider(session=MagicMock())
        provider._nasdaq.fetch_equities = MagicMock(return_value=({
            "MU": ReferenceQuote("MU", "Nasdaq", None, 930_000_000_000, None),
        }, ["quote unavailable"]))
        provider._try_yfinance = MagicMock(return_value=(None, "unavailable"))
        with self.assertRaises(MarketCapProviderError):
            provider.fetch_observation("MU")

    def test_mixed_session_caps_use_dated_formula_when_yahoo_confirms_it(self):
        for ticker, price, shares, secondary_cap, mismatch in (
            ("LRCX", 184.875, 1_251_424_362, 231_763_787_776, 1.196),
            ("SNDK", 804.79, 142_289_365, 114_746_408_960, 1.289),
        ):
            with self.subTest(ticker=ticker):
                provider = MarketDataProvider(session=MagicMock())
                aligned_cap = round(price * shares)
                provider._equity_quotes[ticker] = ReferenceQuote(
                    ticker, "Nasdaq", price, round(aligned_cap * mismatch),
                    datetime(2026, 11, 5, 21, tzinfo=timezone.utc),
                )
                provider._equity_errors[ticker] = []
                provider._try_yfinance = MagicMock(return_value=(MarketCapObservation(
                    ticker=ticker, asset_class=ASSET_EQUITY, semantic="equity_market_cap",
                    market_cap=secondary_cap, source="yfinance.info.marketCap",
                    price=secondary_cap / shares, quantity=shares,
                    quantity_name="shares_outstanding",
                ), None))

                observation = provider.fetch_observation(ticker)

                self.assertEqual(observation.market_cap, aligned_cap)
                self.assertEqual(observation.price, price)
                self.assertEqual(observation.source, "derived.nasdaq_price_x_yfinance_shares")
                self.assertEqual(observation.cross_check_market_cap, secondary_cap)
                self.assertIn("2026-11-05T21:00:00", observation.provider_note)
                self.assertTrue(validate_market_cap(
                    observation, PreviousMarketData(aligned_cap, price),
                ).accepted)

    def test_mixed_session_formula_still_rejects_unconfirmed_share_counts(self):
        for secondary_cap, secondary_price, source in (
            (200_000_000_000, 100, "yfinance.info.marketCap"),
            (100_000_000_000, 200, "yfinance.info.marketCap"),
            (100_000_000_000, 100, "derived.price_x_shares_outstanding"),
        ):
            with self.subTest(cap=secondary_cap, price=secondary_price, source=source):
                provider = MarketDataProvider(session=MagicMock())
                provider._equity_quotes["LRCX"] = ReferenceQuote(
                    "LRCX", "Nasdaq", 100, 150_000_000_000,
                    datetime(2026, 11, 5, 21, tzinfo=timezone.utc),
                )
                provider._equity_errors["LRCX"] = []
                provider._try_yfinance = MagicMock(return_value=(MarketCapObservation(
                    ticker="LRCX", asset_class=ASSET_EQUITY, semantic="equity_market_cap",
                    market_cap=secondary_cap, source=source, price=secondary_price,
                    quantity=1_000_000_000, quantity_name="shares_outstanding",
                ), None))
                observation = provider.fetch_observation("LRCX")
                self.assertFalse(validate_market_cap(
                    observation, PreviousMarketData(100_000_000_000, 100),
                ).accepted)

    @patch("update_market_caps.time.time", return_value=1_000)
    def test_crypto_uses_coingecko_market_cap_and_price(self, _time):
        provider = MarketDataProvider(session=MagicMock())
        provider._coingecko_markets = {"dogecoin": {"market_cap":10_500_000_000,"current_price":0.07,"circulating_supply":150_000_000_000,"last_updated":"1970-01-01T00:16:35+00:00"}}
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
            observation.source, "coingecko.markets.market_cap"
        )

    @patch("update_market_caps.time.time", return_value=2_000)
    def test_crypto_rejects_stale_coingecko_response(self, _time):
        provider = MarketDataProvider(session=MagicMock())
        provider._coingecko_markets = {"dogecoin": {"market_cap":10_500_000_000,"current_price":0.07,"circulating_supply":150_000_000_000,"last_updated":"1970-01-01T00:16:35+00:00"}}
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
            parse_nasdaq_etf_aum(
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

    @patch("audit_market_data.sleep")
    @patch("update_market_caps.datetime", wraps=datetime)
    def test_etf_uses_one_dated_backup_feed_after_nasdaq_failures(self, clock, _sleep):
        clock.now.return_value = ETF_RUN_TIME
        session = MagicMock()
        blank_summary = {"data": {"summaryData": {
            "AUM": {"value": "N/A"}, "MarketCap": {"value": "61648790000"},
        }}}
        response = MagicMock()
        response.json.side_effect = [
            blank_summary,
            {"funds": {
                "QQQ": {"aum": 422_872_505_013.33, "source": "issuer page",
                        "basis": "as of", "asOf": "2026-11-20"},
                "SOXQ": {"aum": 2_313_949_644, "source": "issuer page",
                         "basis": "as of", "asOf": "2026-11-20"},
            }},
            blank_summary,
            blank_summary,
        ]
        session.get.side_effect = [requests.Timeout("Nasdaq timeout")] + [response] * 4
        provider = MarketDataProvider(session=session)
        provider._try_yfinance = MagicMock()

        observation = provider.fetch_observation("QQQ")
        self.assertEqual(observation.market_cap, 422_872_505_013)
        self.assertEqual(observation.source, "etfiq.aum")
        self.assertIn("2026-11-20", observation.provider_note)
        self.assertEqual(provider.fetch_observation("SOXQ").market_cap, 2_313_949_644)
        self.assertEqual(provider.fetch_observation("QQQ"), observation)
        self.assertEqual([call.args[0] for call in session.get.call_args_list].count(ETFIQ_AUM_URL), 1)
        provider._try_yfinance.assert_not_called()

    def test_etfiq_requires_valid_share_class_aum_from_a_recent_completed_session(self):
        for changes, error in (
            ({"asOf": "2026-10-31"}, "outside the usable window"),
            ({"asOf": "2026-11-24"}, "outside the usable window"),
            ({"basis": "read on"}, "no issuer-based share-class AUM"),
            ({"source": "fund-wide assets"}, "no issuer-based share-class AUM"),
            ({"aum": float("inf")}, "no positive USD AUM"),
        ):
            with self.subTest(changes=changes):
                session = MagicMock()
                session.get.return_value.json.return_value = {"funds": {"VTI": {
                    "aum": 655_000_000_000, "source": "issuer daily",
                    "basis": "as of", "asOf": "2026-11-20", **changes,
                }}}
                with self.assertRaisesRegex(ValueError, error):
                    EtfAumProvider(session).fetch("VTI", now=ETF_RUN_TIME)

    def test_state_street_uses_the_dated_aum_and_its_unit(self):
        session = MagicMock()
        session.get.return_value.text = """
          <div><div class="label">Shares Outstanding</div><div class="data">88.74 M</div></div>
          <div><div class="label">Assets Under Management</div>
            <div class="data">$42,653.16 M</div><div class="date">as of Nov 20 2026</div>
          </div>
        """
        aum = EtfAumProvider(session).fetch("DIA", now=ETF_RUN_TIME)
        self.assertEqual((aum.amount, aum.source), (42_653_160_000, "statestreet.etf.aum"))
        self.assertEqual(aum.as_of.isoformat(), "2026-11-20")
        session.get.assert_called_once()


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
    def test_workflow_ticker_input_accepts_commas_and_spaces(self):
        self.assertEqual(resolve_tickers([], ["DIA,GLD TLT"], "all"), ["DIA", "GLD", "TLT"])
        with self.assertRaisesRegex(ValueError, "specify at least one ticker"):
            resolve_tickers([], [" , "], "all")

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
