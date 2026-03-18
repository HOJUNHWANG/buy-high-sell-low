"""
cleanup.py — Delete stale data.
Schedule: 0 2 * * 0 (every Sunday 02:00 UTC)
"""
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def main():
    print("Running cleanup...")

    # Delete price history older than 90 days
    result = supabase.rpc("cleanup_old_prices").execute()
    print(f"  Price history cleanup done")

    # Delete fetch logs older than 30 days
    result = supabase.rpc("cleanup_old_logs").execute()
    print(f"  Fetch logs cleanup done")

    print("Cleanup complete.")


if __name__ == "__main__":
    main()
