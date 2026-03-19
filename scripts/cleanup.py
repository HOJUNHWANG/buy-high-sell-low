"""
cleanup.py — Delete stale data.
Schedule: 0 2 * * 0 (every Sunday 02:00 UTC)
"""
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def main():
    print("Running cleanup...")

    # Delete price history older than 90 days
    supabase.rpc("cleanup_old_prices").execute()
    print("  Price history cleanup done")

    # Delete fetch logs older than 30 days
    supabase.rpc("cleanup_old_logs").execute()
    print("  Fetch logs cleanup done")

    # Delete news articles older than 90 days (no Supabase RPC needed — direct delete)
    # Service role key bypasses RLS, so this works even with public-read-only policy.
    ninety_days_ago = (datetime.utcnow() - timedelta(days=90)).isoformat()
    result = supabase.table("news_articles").delete().lt("fetched_at", ninety_days_ago).execute()
    deleted = len(result.data) if result.data else 0
    print(f"  News articles cleanup done ({deleted} rows deleted)")

    print("Cleanup complete.")


if __name__ == "__main__":
    main()
