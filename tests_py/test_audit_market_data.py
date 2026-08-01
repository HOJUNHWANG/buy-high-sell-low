import json
import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from audit_market_data import (  # noqa: E402
    ASSET_CRYPTO,
    ASSET_EQUITY,
    ASSET_ETF,
    EXIT_CRITICAL,
    EXIT_INCOMPLETE,
    EXIT_OK,
    AssetComparison,
    AuditConfig,
    AuditReport,
    Finding,
    ReferenceQuote,
    StoredAsset,
    SupabaseAuditLogWriter,
    SupabaseReader,
    audit_assets,
    build_audit_log_payload,
    classify_asset,
    parse_coingecko_payload,
    parse_nasdaq_etf_aum,
    parse_nasdaq_etf_payload,
    parse_nasdaq_stock_payload,
    parse_number,
    render_human,
    signed_deviation_pct,
)


NOW = datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc)


def stored_asset(
    ticker="AAPL",
    asset_class=ASSET_EQUITY,
    price=100.0,
    market_cap=1_000_000_000.0,
    price_age_hours=1.0,
    cap_age_days=1,
):
    return StoredAsset(
        ticker=ticker,
        name=ticker,
        asset_class=asset_class,
        price=price,
        price_fetched_at=(
            NOW - timedelta(hours=price_age_hours)
            if price_age_hours is not None
            else None
        ),
        market_cap=market_cap,
        market_cap_as_of=(
            NOW.date() - timedelta(days=cap_age_days)
            if cap_age_days is not None
            else None
        ),
        market_cap_updated_at=(
            NOW - timedelta(days=cap_age_days)
            if cap_age_days is not None
            else None
        ),
        market_cap_source="test-provider",
        market_cap_metric={
            ASSET_EQUITY: "equity_market_cap",
            ASSET_ETF: "aum",
            ASSET_CRYPTO: "circulating_market_cap",
        }[asset_class],
    )


def reference_quote(
    ticker="AAPL",
    price=100.0,
    market_cap=1_000_000_000.0,
    source="Nasdaq",
    age_hours=None,
):
    return ReferenceQuote(
        ticker=ticker,
        source=source,
        price=price,
        market_cap=market_cap,
        as_of=NOW - timedelta(hours=age_hours) if age_hours is not None else None,
    )


class NumberParsingTests(unittest.TestCase):
    def test_parses_provider_formats(self):
        self.assertEqual(parse_number("$1,234.50"), 1234.5)
        self.assertEqual(parse_number("2.5B"), 2_500_000_000)
        self.assertEqual(parse_number("(4.2M)"), -4_200_000)

    def test_rejects_missing_and_non_finite_values(self):
        self.assertIsNone(parse_number("N/A"))
        self.assertIsNone(parse_number("nan"))
        self.assertIsNone(parse_number(float("inf")))
        self.assertIsNone(parse_number(True))

    def test_signed_deviation_retains_direction(self):
        self.assertEqual(signed_deviation_pct(90, 100), -10)
        self.assertEqual(signed_deviation_pct(110, 100), 10)
        self.assertIsNone(signed_deviation_pct(100, 0))


class ClassificationTests(unittest.TestCase):
    def test_classifies_known_asset_shapes(self):
        self.assertEqual(classify_asset("aapl"), ASSET_EQUITY)
        self.assertEqual(classify_asset("voo"), ASSET_ETF)
        self.assertEqual(classify_asset("btc-usd"), ASSET_CRYPTO)


class NasdaqParsingTests(unittest.TestCase):
    def test_parses_stock_price_cap_and_class_share_symbol(self):
        payload = {
            "data": {
                "rows": [
                    {
                        "symbol": "BRK/B",
                        "lastsale": "$511.54",
                        "marketCap": "1128616518721.00",
                    },
                    {
                        "symbol": "MU",
                        "lastsale": "$823.03",
                        "marketCap": "929524445068.00",
                    },
                ]
            }
        }

        quotes = parse_nasdaq_stock_payload(payload, ["BRK.B", "MU"])

        self.assertEqual(set(quotes), {"BRK.B", "MU"})
        self.assertEqual(quotes["BRK.B"].price, 511.54)
        self.assertEqual(quotes["MU"].market_cap, 929_524_445_068)
        self.assertEqual(quotes["MU"].source, "Nasdaq")

    def test_parses_nested_etf_screener_and_as_of(self):
        payload = {
            "data": {
                "dataAsOf": "7/31/2026 8:00:00 PM",
                "data": {
                    "rows": [
                        {"symbol": "VOO", "lastSalePrice": "$681.7900"},
                        {"symbol": "QQQ", "lastSalePrice": "$683.5500"},
                    ]
                },
            }
        }

        quotes = parse_nasdaq_etf_payload(payload, ["VOO"])

        self.assertEqual(list(quotes), ["VOO"])
        self.assertEqual(quotes["VOO"].price, 681.79)
        self.assertEqual(
            quotes["VOO"].as_of,
            datetime(2026, 8, 1, 0, 0, tzinfo=timezone.utc),
        )

    def test_converts_nasdaq_etf_aum_from_thousands(self):
        payload = {
            "data": {
                "summaryData": {
                    "AUM": {
                        "label": "Assets Under Management (,000)",
                        "value": "971,952,960",
                    }
                }
            }
        }

        self.assertEqual(parse_nasdaq_etf_aum(payload), 971_952_960_000)

    def test_returns_none_for_missing_etf_aum(self):
        self.assertIsNone(parse_nasdaq_etf_aum({"data": {"summaryData": {}}}))


class CoinGeckoParsingTests(unittest.TestCase):
    def test_maps_ids_to_database_tickers(self):
        payload = {
            "bitcoin": {
                "usd": 115_000,
                "usd_market_cap": 2_290_000_000_000,
                "last_updated_at": 1_775_217_600,
            },
            "dogecoin": {
                "usd": 0.07,
                "usd_market_cap": 10_800_000_000,
                "last_updated_at": 1_775_217_600,
            },
        }

        quotes = parse_coingecko_payload(payload, ["BTC-USD", "DOGE-USD"])

        self.assertEqual(quotes["BTC-USD"].price, 115_000)
        self.assertEqual(quotes["DOGE-USD"].market_cap, 10_800_000_000)
        self.assertEqual(quotes["DOGE-USD"].source, "CoinGecko")


class AuditEvaluationTests(unittest.TestCase):
    def test_matching_fresh_asset_passes(self):
        asset = stored_asset()
        quote = reference_quote()

        report = audit_assets([asset], {asset.ticker: quote}, now=NOW)

        self.assertEqual(report.exit_code, EXIT_OK)
        self.assertEqual(report.status, "PASS")
        self.assertEqual(report.findings, [])
        self.assertEqual(report.comparisons[0].price_deviation_pct, 0)

    def test_warning_deviations_do_not_fail_audit(self):
        asset = stored_asset(price=101.0, market_cap=1_030_000_000)
        quote = reference_quote()

        report = audit_assets([asset], {asset.ticker: quote}, now=NOW)

        self.assertEqual(report.exit_code, EXIT_OK)
        self.assertEqual(report.warning_count, 2)
        self.assertEqual(report.critical_count, 0)

    def test_doge_sized_cap_deviation_is_critical(self):
        asset = stored_asset(
            ticker="DOGE-USD", price=0.07, market_cap=11_889_000_000
        )
        quote = reference_quote(
            ticker="DOGE-USD",
            price=0.07,
            market_cap=10_839_000_000,
            source="CoinGecko",
        )

        report = audit_assets([asset], {asset.ticker: quote}, now=NOW)

        self.assertEqual(report.exit_code, EXIT_CRITICAL)
        self.assertEqual(report.critical_count, 1)

    def test_critical_price_and_cap_deviations_fail(self):
        asset = stored_asset(price=90, market_cap=800_000_000)
        quote = reference_quote()

        report = audit_assets([asset], {asset.ticker: quote}, now=NOW)

        self.assertEqual(report.exit_code, EXIT_CRITICAL)
        self.assertEqual(report.critical_count, 2)
        codes = {finding.code for finding in report.findings}
        self.assertEqual(codes, {"price_deviation", "market_cap_deviation"})

    def test_micron_scale_regression_is_critical(self):
        asset = stored_asset(ticker="MU", price=823.03, market_cap=145_000_000_000)
        quote = reference_quote(
            ticker="MU", price=823.03, market_cap=929_524_445_068
        )

        report = audit_assets([asset], {asset.ticker: quote}, now=NOW)

        cap_finding = next(
            finding
            for finding in report.findings
            if finding.code == "market_cap_deviation"
        )
        self.assertEqual(report.exit_code, EXIT_CRITICAL)
        self.assertAlmostEqual(cap_finding.deviation_pct, -84.4004, places=3)

    def test_missing_and_stale_stored_values_are_critical(self):
        asset = StoredAsset(
            ticker="BTC-USD",
            name="Bitcoin",
            asset_class=ASSET_CRYPTO,
            price=None,
            price_fetched_at=NOW - timedelta(hours=2),
            market_cap=None,
            market_cap_as_of=None,
        )
        quote = reference_quote(
            ticker="BTC-USD",
            price=100_000,
            market_cap=2_000_000_000_000,
            source="CoinGecko",
            age_hours=0.1,
        )

        report = audit_assets([asset], {asset.ticker: quote}, now=NOW)

        codes = {finding.code for finding in report.findings}
        self.assertTrue(
            {
                "stored_price_missing",
                "stored_price_stale",
                "stored_market_cap_missing",
                "market_cap_timestamp_missing",
            }.issubset(codes)
        )
        self.assertEqual(report.exit_code, EXIT_CRITICAL)

    def test_old_market_cap_snapshot_is_critical(self):
        asset = stored_asset(cap_age_days=10)
        quote = reference_quote()

        report = audit_assets([asset], {asset.ticker: quote}, now=NOW)

        self.assertIn(
            "stored_market_cap_stale",
            {finding.code for finding in report.findings},
        )
        self.assertEqual(report.exit_code, EXIT_CRITICAL)

    def test_missing_reference_is_incomplete_not_mismatch(self):
        asset = stored_asset()

        report = audit_assets([asset], {}, now=NOW)

        self.assertEqual(report.critical_count, 0)
        self.assertEqual(report.exit_code, EXIT_INCOMPLETE)
        self.assertEqual(report.findings[0].code, "reference_missing")

    def test_stale_reference_is_not_used_for_deviation(self):
        asset = stored_asset(price=50, market_cap=500_000_000)
        quote = reference_quote(age_hours=200)

        report = audit_assets([asset], {asset.ticker: quote}, now=NOW)

        self.assertEqual(report.exit_code, EXIT_INCOMPLETE)
        self.assertEqual(report.critical_count, 0)
        self.assertIsNone(report.comparisons[0].price_deviation_pct)
        self.assertIsNone(report.comparisons[0].market_cap_deviation_pct)

    def test_crypto_uses_shorter_freshness_window(self):
        asset = stored_asset(
            ticker="BTC-USD",
            asset_class=ASSET_CRYPTO,
            price_age_hours=2,
        )
        quote = reference_quote(
            ticker="BTC-USD", source="CoinGecko", age_hours=0.1
        )

        report = audit_assets([asset], {asset.ticker: quote}, now=NOW)

        self.assertIn(
            "stored_price_stale", {finding.code for finding in report.findings}
        )

    def test_critical_finding_takes_precedence_over_provider_error(self):
        asset = stored_asset(price=None)
        report = audit_assets(
            [asset], {}, now=NOW, provider_errors=["provider unavailable"]
        )

        self.assertEqual(report.exit_code, EXIT_CRITICAL)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class GetOnlySession:
    def __init__(self):
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if url.endswith("/stocks"):
            return FakeResponse(
                [
                    {
                        "ticker": "AAPL",
                        "name": "Apple",
                        "market_cap": "1000000000",
                        "market_cap_updated_at": "2026-08-01T10:00:00Z",
                        "market_cap_source": "nasdaq.screener.marketCap",
                        "market_cap_metric": "equity_market_cap",
                    },
                    {
                        "ticker": "BTC-USD",
                        "name": "Bitcoin",
                        "market_cap": "2000000000000",
                        "market_cap_updated_at": "2026-08-01T11:50:00Z",
                        "market_cap_source": "coingecko.simple.usd_market_cap",
                        "market_cap_metric": "circulating_market_cap",
                    },
                ]
            )
        if url.endswith("/stock_prices"):
            return FakeResponse(
                [
                    {
                        "ticker": "AAPL",
                        "price": "100",
                        "fetched_at": "2026-08-01T11:00:00Z",
                    },
                    {
                        "ticker": "BTC-USD",
                        "price": "100000",
                        "fetched_at": "2026-08-01T11:55:00Z",
                    },
                ]
            )
        if url.endswith("/market_cap_snapshots"):
            return FakeResponse(
                [
                    {"ticker": "AAPL", "date": "2026-07-31", "market_cap": 1},
                    {
                        "ticker": "BTC-USD",
                        "date": "2026-07-31",
                        "market_cap": 1,
                    },
                ]
            )
        raise AssertionError(url)


class PostSession:
    def __init__(self):
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return FakeResponse(None)


class SupabaseReaderTests(unittest.TestCase):
    def test_loads_active_assets_using_get_only(self):
        session = GetOnlySession()
        reader = SupabaseReader(
            "https://example.supabase.co", "secret-not-logged", session=session
        )

        assets = reader.fetch_assets(now=NOW)

        self.assertEqual([item.ticker for item in assets], ["AAPL", "BTC-USD"])
        self.assertEqual(assets[0].price, 100)
        self.assertEqual(assets[0].market_cap_as_of, date(2026, 7, 31))
        self.assertEqual(
            assets[0].market_cap_updated_at,
            datetime(2026, 8, 1, 10, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(assets[0].market_cap_source, "nasdaq.screener.marketCap")
        self.assertEqual(assets[1].asset_class, ASSET_CRYPTO)
        self.assertEqual(len(session.calls), 3)
        self.assertTrue(all("Authorization" in call[1]["headers"] for call in session.calls))
        self.assertFalse(hasattr(session, "post"))

    def test_api_key_is_not_put_in_query_params(self):
        session = GetOnlySession()
        reader = SupabaseReader(
            "https://example.supabase.co", "very-secret", session=session
        )

        reader.fetch_assets(now=NOW)

        for _, kwargs in session.calls:
            self.assertNotIn("very-secret", json.dumps(kwargs["params"]))


class SupabaseAuditLogWriterTests(unittest.TestCase):
    def test_builds_compact_critical_log_payload(self):
        finding = Finding(
            severity="critical",
            code="market_cap_deviation",
            ticker="MU",
            field="market_cap",
            message="Stored market cap differs from reference",
        )
        report = AuditReport(
            NOW,
            [
                AssetComparison(
                    ticker="MU",
                    asset_class=ASSET_EQUITY,
                    source="Nasdaq",
                    stored_price=823.03,
                    reference_price=823.03,
                    price_deviation_pct=0,
                    stored_market_cap=145_000_000_000,
                    reference_market_cap=929_524_445_068,
                    market_cap_deviation_pct=-84.4,
                    price_fetched_at=NOW,
                    market_cap_as_of=NOW.date(),
                    reference_as_of=None,
                )
            ],
            [finding],
            [],
        )

        payload = build_audit_log_payload(report)
        details = json.loads(payload["error_message"])

        self.assertEqual(payload["job_name"], "market_data_audit")
        self.assertEqual(payload["status"], "critical")
        self.assertEqual(payload["records_fetched"], 1)
        self.assertEqual(payload["records_failed"], 1)
        self.assertEqual(payload["failed_tickers"], ["MU"])
        self.assertEqual(details["audit_status"], "CRITICAL")
        self.assertNotIn("comparisons", details)

    def test_writer_appends_only_to_fetch_logs(self):
        session = PostSession()
        writer = SupabaseAuditLogWriter(
            "https://example.supabase.co",
            "service-secret",
            session=session,
        )
        report = AuditReport(NOW, [], [], [])

        writer.record(report)

        self.assertEqual(len(session.calls), 1)
        url, kwargs = session.calls[0]
        self.assertEqual(url, "https://example.supabase.co/rest/v1/fetch_logs")
        self.assertEqual(kwargs["json"]["status"], "success")
        self.assertNotIn("service-secret", json.dumps(kwargs["json"]))


class ReportRenderingTests(unittest.TestCase):
    def test_json_and_human_reports_contain_actionable_summary(self):
        comparison = AssetComparison(
            ticker="MU",
            asset_class=ASSET_EQUITY,
            source="Nasdaq",
            stored_price=823.03,
            reference_price=823.03,
            price_deviation_pct=0,
            stored_market_cap=145_000_000_000,
            reference_market_cap=929_524_445_068,
            market_cap_deviation_pct=-84.4,
            price_fetched_at=NOW,
            market_cap_as_of=NOW.date(),
            reference_as_of=None,
        )
        finding = Finding(
            severity="critical",
            code="market_cap_deviation",
            ticker="MU",
            field="market_cap",
            message="Stored market cap is wrong",
            stored_value=145_000_000_000,
            reference_value=929_524_445_068,
            deviation_pct=-84.4,
        )
        report = AuditReport(NOW, [comparison], [finding], [])

        payload = report.to_dict()
        human = render_human(report, verbose=True)

        self.assertEqual(payload["status"], "CRITICAL")
        self.assertEqual(payload["summary"]["market_cap_reference_coverage"], 1)
        self.assertEqual(payload["comparisons"][0]["price_fetched_at"], NOW.isoformat())
        self.assertIn("MU", human)
        self.assertIn("$145.00B", human)
        self.assertIn("source=Nasdaq", human)


if __name__ == "__main__":
    unittest.main()
