"""Bounded database requests for market ingestion; quote cadence is unchanged."""
from collections import defaultdict
from collections.abc import Sequence
from types import SimpleNamespace
from urllib.parse import quote

from db_requests import execute_db


def delete_with_count(query):
    """Read exact deletion count from the header without returning expired rows.

    postgrest-py 0.16 (pinned by supabase 2.7.4) otherwise returns count=0 for
    an empty 204 response, ignoring Content-Range. Do not retry a DELETE after
    an ambiguous transport failure, and never silently invent a missing count.
    """
    response = query.session.request(
        query.http_method, query.path, json=query.json,
        params=query.params, headers=query.headers,
    )
    response.raise_for_status()
    count = response.headers.get("content-range", "").rsplit("/", 1)[-1]
    if not count.isdigit():
        raise RuntimeError("Database omitted the exact deletion count")
    return SimpleNamespace(data=[], count=int(count))


def persist_price_batch(
    client, *, current_rows: list[dict], daily_rows: list[dict],
    history_cutoff: str, force_history: bool = False,
) -> int:
    """Retain freshness and chart observations while batching database writes.

    Group daily rows by supplied columns so missing OHLC/volume fields are not
    replaced with NULL. Current-price and dedup-read failures propagate;
    history/daily write failures remain warnings, as in the existing worker.
    """
    if not current_rows:
        return 0

    execute_db(
        client.table("stock_prices").upsert(
            current_rows, on_conflict="ticker", returning="minimal",
        ), operation="fetch_prices:stock_prices", retry_safe=True,
    )

    recent_tickers: set[str] = set()
    if not force_history:
        offset, page_size = 0, 1000
        while True:
            result = execute_db(
                client.table("stock_price_history").select("ticker,id")
                .in_("ticker", [row["ticker"] for row in current_rows])
                .gte("recorded_at", history_cutoff).order("id")
                .range(offset, offset + page_size - 1),
                operation="fetch_prices:stock_price_history", retry_safe=True,
            )
            rows = result.data or []
            recent_tickers.update(row["ticker"] for row in rows)
            if len(rows) < page_size:
                break
            offset += page_size

    history_rows = [
        {"ticker": row["ticker"], "price": row["price"], "recorded_at": row["fetched_at"]}
        for row in current_rows if row["ticker"] not in recent_tickers
    ]
    if history_rows:
        try:
            execute_db(
                client.table("stock_price_history").insert(history_rows, returning="minimal"),
                operation="fetch_prices:stock_price_history", retry_safe=False,
            )
        except Exception as exc:
            # A timeout may mean the INSERT committed. Never replay this batch.
            print(f"  Warning: failed to record price history batch: {type(exc).__name__}")

    by_columns: dict[tuple[str, ...], list[dict]] = defaultdict(list)
    for row in daily_rows:
        by_columns[tuple(sorted(row))].append(row)
    for rows in by_columns.values():
        try:
            execute_db(
                client.table("price_history_long").upsert(
                    rows, on_conflict="ticker,date", returning="minimal",
                ), operation="fetch_prices:price_history_long", retry_safe=True,
            )
        except Exception as exc:
            print(f"  Warning: failed to record daily price batch: {type(exc).__name__}")
    return len(current_rows)


def existing_news_urls(client, candidate_urls: Sequence[str]) -> set[str]:
    """Use the URL unique index across the full retention window, in small batches."""
    candidates = list(dict.fromkeys(url for url in candidate_urls if url))
    existing: set[str] = set()
    batches: list[list[str]] = []
    batch: list[str] = []
    encoded_size = 0
    for url in candidates:
        size = len(quote(url, safe="")) + 8
        if batch and (len(batch) >= 25 or encoded_size + size > 5000):
            batches.append(batch)
            batch, encoded_size = [], 0
        batch.append(url)
        encoded_size += size
    if batch:
        batches.append(batch)
    for batch in batches:
        result = execute_db(
            client.table("news_articles").select("url")
            .in_("url", batch),
            operation="fetch_news:existing_urls", retry_safe=True,
        )
        existing.update(row["url"] for row in (result.data or []))
    return existing
