"""Read-only S&P 100 membership/readiness check and September 21 rehearsal."""
import json
import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from supabase import create_client

from sync_sp100 import check_addition_readiness, plan_sync
from tickers import (
    ALL_TICKERS, SP100_ADDITIONS, SP100_REMOVALS,
    SP100_REBALANCE_DATE, get_sp100_tickers,
)


def check_sp100(client) -> dict:
    today = datetime.now(ZoneInfo("America/New_York")).date()
    stocks = client.table("stocks").select("ticker,name,is_active,sector,exchange,logo_url,market_cap").execute().data
    changes = plan_sync(stocks, today)
    if changes:
        raise RuntimeError("Unexpected membership changes required: " + repr(changes))
    check_addition_readiness(client, stocks, today)
    future = get_sp100_tickers(SP100_REBALANCE_DATE)
    if len(future) != 101 or len(set(future)) != 101:
        raise RuntimeError("Post-rebalance universe is not 101 unique symbols")
    if not (set(SP100_ADDITIONS) | set(SP100_REMOVALS)) <= set(ALL_TICKERS):
        raise RuntimeError("Replacement or retained tickers missing from collection")
    # Build the future write plan in memory only. Never apply a future date.
    return {
        "as_of": today.isoformat(), "current_index_tickers": len(get_sp100_tickers(today)),
        "replacement_data_ready": True, "post_rebalance_tickers": len(future),
        "remaining_transition": plan_sync(stocks, SP100_REBALANCE_DATE),
    }


if __name__ == "__main__":
    load_dotenv(Path(__file__).resolve().parents[1] / ".env.local")
    load_dotenv()
    client = create_client(
        os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    print(json.dumps(check_sp100(client), indent=2))
