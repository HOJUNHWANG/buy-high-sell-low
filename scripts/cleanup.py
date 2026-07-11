"""
cleanup.py — Delete stale data.
Schedule: 0 2 * * 0 (every Sunday 02:00 UTC)
"""
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
load_dotenv()  # fallback to .env

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
supabase = create_client(SUPABASE_URL, os.environ["SUPABASE_SERVICE_ROLE_KEY"])

# Keep the asset row and user records when a symbol is retired. The weekly
# cleanup only removes market data once no active paper-trading or watchlist
# feature still relies on it.
INACTIVE_DATA_TABLES = (
    "stock_prices",
    "stock_price_history",
    "price_history_long",
    "price_anomalies",
)


def log_result(job: str, status: str, fetched: int, failed: int, error: str = ""):
    try:
        supabase.table("fetch_logs").insert({
            "job_name":        job,
            "status":          status,
            "records_fetched": fetched,
            "records_failed":  failed,
            "error_message":   error or None,
        }).execute()
    except Exception as e:
        print(f"Failed to log result to Supabase: {e}")


def deleted_count(result) -> int:
    """Supabase returns deleted rows only when the API is configured to do so."""
    return len(result.data) if result.data else 0


def get_protected_inactive_tickers(inactive_tickers: list[str]) -> set[str]:
    """Keep data for user-visible inactive assets until they are no longer in use."""
    if not inactive_tickers:
        return set()

    protected: set[str] = set()
    checks = (
        supabase.table("paper_positions")
        .select("ticker")
        .in_("ticker", inactive_tickers)
        .gt("shares", 0),
        supabase.table("paper_challenges")
        .select("ticker")
        .in_("ticker", inactive_tickers)
        .eq("status", "active"),
        supabase.table("watchlist")
        .select("ticker")
        .in_("ticker", inactive_tickers),
    )

    for check in checks:
        result = check.execute()
        protected.update(row["ticker"] for row in (result.data or []))

    return protected


def cleanup_inactive_asset_data() -> int:
    """Purge market data for retired assets without removing their history rows.

    Rows are deleted a ticker at a time. With the existing retention windows,
    this keeps each operation small enough to avoid a long-running table lock.
    """
    result = (
        supabase.table("stocks")
        .select("ticker")
        .eq("is_active", False)
        .execute()
    )
    inactive_tickers = [row["ticker"] for row in (result.data or [])]
    if not inactive_tickers:
        print("  Inactive asset cleanup skipped (no inactive tickers)")
        return 0

    protected = get_protected_inactive_tickers(inactive_tickers)
    purge_tickers = [ticker for ticker in inactive_tickers if ticker not in protected]
    if not purge_tickers:
        print(f"  Inactive asset cleanup skipped ({len(protected)} protected ticker(s))")
        return 0

    total_deleted = 0
    for ticker in purge_tickers:
        ticker_deleted = 0
        for table in INACTIVE_DATA_TABLES:
            deleted = deleted_count(
                supabase.table(table).delete().eq("ticker", ticker).execute()
            )
            ticker_deleted += deleted
        total_deleted += ticker_deleted
        print(f"  Retired {ticker}: {ticker_deleted} market-data row(s) deleted")

    if protected:
        print(
            "  Protected inactive assets retained until no longer in use: "
            + ", ".join(sorted(protected))
        )
    return total_deleted


def main():
    print("Running cleanup...")
    total_deleted = 0

    # Delete price history older than 30 days (intraday data)
    cutoff_30d_history = (datetime.utcnow() - timedelta(days=30)).isoformat()
    result = supabase.table("stock_price_history").delete().lt("recorded_at", cutoff_30d_history).execute()
    deleted = deleted_count(result)
    total_deleted += deleted
    print(f"  Price history cleanup done ({deleted} rows deleted)")

    # Delete daily chart history older than 1 year.
    cutoff_1y_daily = (datetime.utcnow() - timedelta(days=366)).date().isoformat()
    result = supabase.table("price_history_long").delete().lt("date", cutoff_1y_daily).execute()
    deleted = deleted_count(result)
    total_deleted += deleted
    print(f"  Daily chart history cleanup done ({deleted} rows deleted)")

    # Fictional market cleanup follows the same retention model:
    # 30 days intraday/events, 45 days fictional news, 366 days daily OHLCV.
    try:
        supabase.rpc("cleanup_fictional_market_data").execute()
        print("  Fictional market cleanup done")
    except Exception as e:
        print(f"  Fictional market cleanup skipped: {e}")

    # Delete fetch logs older than 30 days
    cutoff_30d = (datetime.utcnow() - timedelta(days=30)).isoformat()
    result = supabase.table("fetch_logs").delete().lt("executed_at", cutoff_30d).execute()
    deleted = deleted_count(result)
    total_deleted += deleted
    print(f"  Fetch logs cleanup done ({deleted} rows deleted)")

    # Delete news articles older than 90 days
    cutoff_90d = (datetime.utcnow() - timedelta(days=90)).isoformat()
    result = supabase.table("news_articles").delete().lt("fetched_at", cutoff_90d).execute()
    deleted = deleted_count(result)
    total_deleted += deleted
    print(f"  News articles cleanup done ({deleted} rows deleted)")

    # Retired tickers keep the `stocks` record for foreign-key integrity and
    # historical transactions, while their market data is burned every week.
    inactive_deleted = cleanup_inactive_asset_data()
    total_deleted += inactive_deleted

    print(f"Cleanup complete. Total rows deleted: {total_deleted}")
    log_result("cleanup", "success", total_deleted, 0)


if __name__ == "__main__":
    main()
