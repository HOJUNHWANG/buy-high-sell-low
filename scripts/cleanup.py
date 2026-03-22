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


def main():
    print("Running cleanup...")

    # Delete price history older than 400 days (1Y charts + buffer)
    cutoff_400d = (datetime.utcnow() - timedelta(days=400)).isoformat()
    result = supabase.table("stock_price_history").delete().lt("recorded_at", cutoff_400d).execute()
    deleted = len(result.data) if result.data else 0
    print(f"  Price history cleanup done ({deleted} rows deleted)")

    # Delete fetch logs older than 30 days
    cutoff_30d = (datetime.utcnow() - timedelta(days=30)).isoformat()
    result = supabase.table("fetch_logs").delete().lt("executed_at", cutoff_30d).execute()
    deleted = len(result.data) if result.data else 0
    print(f"  Fetch logs cleanup done ({deleted} rows deleted)")

    # Delete news articles older than 90 days
    cutoff_90d = (datetime.utcnow() - timedelta(days=90)).isoformat()
    result = supabase.table("news_articles").delete().lt("fetched_at", cutoff_90d).execute()
    deleted = len(result.data) if result.data else 0
    print(f"  News articles cleanup done ({deleted} rows deleted)")

    print("Cleanup complete.")


if __name__ == "__main__":
    main()
