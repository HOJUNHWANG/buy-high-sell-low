"""Collect retired assets through a grace period and while users need them."""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from tickers import ALL_TICKERS, SP100_REBALANCE_DATE, SP100_REMOVALS

RETIREMENT_DATES = {"HON": date(2026, 9, 8), **{t: SP100_REBALANCE_DATE for t in SP100_REMOVALS}}
RETIREMENT_GRACE_DAYS = 30


def expired_retirements(as_of: date | None = None) -> set[str]:
    today = as_of or datetime.now(ZoneInfo("America/New_York")).date()
    return {t for t, retired in RETIREMENT_DATES.items() if today >= retired + timedelta(days=RETIREMENT_GRACE_DAYS)}


def paged_rows(make_query):
    offset = 0
    while True:
        rows = make_query().range(offset, offset + 499).execute().data or []
        yield from rows
        if len(rows) < 500:
            return
        offset += 500


def referenced_tickers(client, candidates: list[str]) -> set[str]:
    """Include every pick in active/pending challenges, not just their lead ticker."""
    if not candidates:
        return set()
    referenced = set()
    for table, extra in (("paper_positions", True), ("watchlist", False)):
        def query(table=table, extra=extra):
            q = client.table(table).select("ticker").in_("ticker", candidates).order("id")
            return q.gt("shares", 0) if extra else q
        referenced.update(row["ticker"] for row in paged_rows(query))
    def challenges():
        return client.table("paper_challenges").select("ticker,picks").in_("status", ["active", "pending"]).order("id")
    for row in paged_rows(challenges):
        referenced.add(row["ticker"])
        referenced.update(pick["ticker"] for pick in (row.get("picks") or []) if isinstance(pick, dict) and pick.get("ticker"))
    return referenced & set(candidates)


def protected_inactive_tickers(client, candidates: list[str], as_of: date | None = None) -> set[str]:
    # Announced additions and unexpired retired members are always protected.
    protected = set(candidates) & (set(ALL_TICKERS) - expired_retirements(as_of))
    return protected | referenced_tickers(client, candidates)


def filter_collectable_tickers(client, tickers: list[str], as_of: date | None = None) -> list[str]:
    expired = set(tickers) & expired_retirements(as_of)
    if not expired:
        return list(tickers)
    # A delayed/failed membership transition must never stop an active asset.
    inactive = client.table("stocks").select("ticker").in_("ticker", sorted(expired)).eq("is_active", False).execute().data or []
    retired = {row["ticker"] for row in inactive}
    removable = retired - referenced_tickers(client, sorted(retired))
    return [ticker for ticker in tickers if ticker not in removable]
