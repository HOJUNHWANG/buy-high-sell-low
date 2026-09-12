"""Bounded retries for explicitly reviewed, replay-safe database requests."""
import random
import time

import httpx
from postgrest.exceptions import APIError


class DatabaseRequestError(RuntimeError):
    """A database request failed; never label this a market-provider error."""


def transient_db_error(exc: Exception) -> bool:
    if isinstance(exc, (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError)):
        return True
    if isinstance(exc, APIError):
        # The pinned PostgREST SDK may discard the HTTP status. Match only
        # known gateway messages/codes, never arbitrary validation failures.
        code = str(getattr(exc, "code", ""))
        message = str(getattr(exc, "message", "")).strip().lower()
        return code in {"502", "503", "504", "520"} or message in {
            "gateway timeout", "gateway time-out", "bad gateway", "service unavailable",
        }
    return False


def execute_db(query, *, operation: str, retry_safe: bool = False):
    """Reuse the same built query/payload; never replay inserts or RPCs by default.

    Call sites must explicitly approve reads or fixed-value keyed upserts/updates.
    Retry at most twice; persistent failures still fail the operation/job.
    Logs omit exception bodies, query parameters, credentials and row payloads.
    """
    attempts = 3 if retry_safe else 1
    for attempt in range(1, attempts + 1):
        try:
            result = query.execute()
            if attempt > 1:
                print(f"[database] {operation}: recovered on attempt {attempt}/{attempts}")
            return result
        except Exception as exc:
            transient = transient_db_error(exc)
            if not transient:
                # URL duplicates are expected and counted by the caller.
                if not (isinstance(exc, APIError) and str(exc.code) == "23505"):
                    print(f"[database] {operation}: non-retryable {type(exc).__name__}")
                raise  # Preserve SQL codes such as 23505 for duplicate handling.
            if attempt == attempts:
                reason = "retries exhausted" if retry_safe else "unsafe to replay"
                raise DatabaseRequestError(
                    f"[database] {operation}: transient failure; {reason} ({attempts} attempt(s))"
                ) from None
            delay = 2 ** (attempt - 1) + random.uniform(0, 0.5)
            print(f"[database] {operation}: transient failure; retry {attempt + 1}/{attempts} in {delay:.1f}s")
            time.sleep(delay)
