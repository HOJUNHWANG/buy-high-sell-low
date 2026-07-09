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


def main():
    print("Running cleanup...")
    total_deleted = 0

    # Delete price history older than 30 days (intraday data)
    cutoff_30d_history = (datetime.utcnow() - timedelta(days=30)).isoformat()
    result = supabase.table("stock_price_history").delete().lt("recorded_at", cutoff_30d_history).execute()
    deleted = len(result.data) if result.data else 0
    total_deleted += deleted
    print(f"  Price history cleanup done ({deleted} rows deleted)")

    # Delete daily chart history older than 1 year.
    cutoff_1y_daily = (datetime.utcnow() - timedelta(days=366)).date().isoformat()
    result = supabase.table("price_history_long").delete().lt("date", cutoff_1y_daily).execute()
    deleted = len(result.data) if result.data else 0
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
    deleted = len(result.data) if result.data else 0
    total_deleted += deleted
    print(f"  Fetch logs cleanup done ({deleted} rows deleted)")

    # Delete news articles older than 90 days
    cutoff_90d = (datetime.utcnow() - timedelta(days=90)).isoformat()
    result = supabase.table("news_articles").delete().lt("fetched_at", cutoff_90d).execute()
    deleted = len(result.data) if result.data else 0
    total_deleted += deleted
    print(f"  News articles cleanup done ({deleted} rows deleted)")

    print(f"Cleanup complete. Total rows deleted: {total_deleted}")
    log_result("cleanup", "success", total_deleted, 0)


if __name__ == "__main__":
    main()
