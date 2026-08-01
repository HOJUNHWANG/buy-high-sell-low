"""Run the full market-data audit and safely remediate a persistent failure.

The first failed audit is observation-only. When a second consecutive full
audit fails, this wrapper records a one-time attempt marker, refreshes only the
affected price and/or market-cap rows through their canonical updaters, and
runs one final full audit. A failed remediation is never looped; the persistent
state and the recorded outcome remain visible in Admin Data Health.
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

import requests
from dotenv import load_dotenv

import audit_market_data
from audit_market_data import EXIT_INCOMPLETE, EXIT_OK, create_http_session
from tickers import ALL_TICKERS


AUDIT_JOB_NAME = audit_market_data.AUDIT_LOG_JOB_NAME
REMEDIATION_JOB_NAME = "market_data_remediation"
PERSISTENT_FAILURE_THRESHOLD = 2
DEFAULT_TIMEOUT_SECONDS = 30.0


@dataclass(frozen=True)
class RemediationTargets:
    price_tickers: tuple[str, ...] = ()
    market_cap_tickers: tuple[str, ...] = ()

    @property
    def operation_count(self) -> int:
        return len(self.price_tickers) + len(self.market_cap_tickers)


@dataclass(frozen=True)
class RemediationResult:
    targets: RemediationTargets
    price_updated: int = 0
    price_failed_tickers: tuple[str, ...] = ()
    market_cap_updated: int = 0
    market_cap_failed_tickers: tuple[str, ...] = ()
    errors: tuple[str, ...] = ()

    @property
    def updated(self) -> int:
        return self.price_updated + self.market_cap_updated

    @property
    def failed(self) -> int:
        return len(self.price_failed_tickers) + len(
            self.market_cap_failed_tickers
        )

    @property
    def failed_tickers(self) -> list[str]:
        return sorted(
            set(self.price_failed_tickers) | set(self.market_cap_failed_tickers)
        )

    @property
    def status(self) -> str:
        if self.failed == 0 and not self.errors:
            return "success"
        if self.updated > 0:
            return "partial"
        return "failed"


def _ordered_logs(logs: Sequence[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    return sorted(
        logs,
        key=lambda row: (
            int(row.get("id") or 0),
            str(row.get("executed_at") or ""),
        ),
        reverse=True,
    )


def _safe_error(error: Exception) -> str:
    message = str(error)
    for variable in ("SUPABASE_SERVICE_ROLE_KEY", "TWELVE_DATA_API_KEY"):
        secret = os.environ.get(variable)
        if secret:
            message = message.replace(secret, "[redacted]")
    return message[:500]


def has_persistent_failure(
    logs: Sequence[Mapping[str, Any]],
    threshold: int = PERSISTENT_FAILURE_THRESHOLD,
) -> bool:
    consecutive = 0
    for row in _ordered_logs(logs):
        if row.get("status") == "success":
            break
        consecutive += 1
        if consecutive >= threshold:
            return True
    return False


def extract_remediation_targets(
    audit_log: Mapping[str, Any],
    *,
    tracked_tickers: Sequence[str] = ALL_TICKERS,
) -> RemediationTargets:
    tracked = {ticker.upper() for ticker in tracked_tickers}
    try:
        details = json.loads(str(audit_log.get("error_message") or ""))
    except (TypeError, ValueError, json.JSONDecodeError):
        return RemediationTargets()

    findings = details.get("findings") if isinstance(details, dict) else None
    if not isinstance(findings, list):
        return RemediationTargets()

    prices: set[str] = set()
    market_caps: set[str] = set()
    for finding in findings:
        if not isinstance(finding, dict) or finding.get("severity") != "critical":
            continue
        ticker = str(finding.get("ticker") or "").upper()
        if ticker not in tracked:
            continue
        if finding.get("field") == "price":
            prices.add(ticker)
        elif finding.get("field") == "market_cap":
            market_caps.add(ticker)

    return RemediationTargets(tuple(sorted(prices)), tuple(sorted(market_caps)))


def remediation_already_attempted(
    latest_success: Mapping[str, Any] | None,
    latest_remediation: Mapping[str, Any] | None,
) -> bool:
    if latest_remediation is None:
        return False
    if latest_success is None:
        return True
    return int(latest_remediation.get("id") or 0) > int(
        latest_success.get("id") or 0
    )


class SupabaseRemediationStore:
    """Minimal service-role PostgREST access for operational state only."""

    def __init__(
        self,
        base_url: str,
        service_role_key: str,
        *,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        session: requests.Session | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = session or create_http_session()
        self.headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def _load_logs(
        self, job_name: str, *, limit: int, status: str | None = None
    ) -> list[dict[str, Any]]:
        params = {
            "select": (
                "id,job_name,status,records_fetched,records_failed,"
                "failed_tickers,error_message,executed_at"
            ),
            "job_name": f"eq.{job_name}",
            "order": "executed_at.desc,id.desc",
            "limit": str(limit),
        }
        if status:
            params["status"] = f"eq.{status}"
        response = self.session.get(
            f"{self.base_url}/rest/v1/fetch_logs",
            headers=self.headers,
            params=params,
            timeout=self.timeout,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, list):
            raise ValueError("Unexpected fetch_logs response type")
        return [row for row in payload if isinstance(row, dict)]

    def load_recent_audits(self, limit: int = 2) -> list[dict[str, Any]]:
        return self._load_logs(AUDIT_JOB_NAME, limit=limit)

    def load_latest_success(self) -> dict[str, Any] | None:
        rows = self._load_logs(AUDIT_JOB_NAME, limit=1, status="success")
        return rows[0] if rows else None

    def load_latest_remediation(self) -> dict[str, Any] | None:
        rows = self._load_logs(REMEDIATION_JOB_NAME, limit=1)
        return rows[0] if rows else None

    def _details(
        self,
        *,
        stage: str,
        trigger_audit: Mapping[str, Any],
        targets: RemediationTargets,
        result: RemediationResult | None = None,
        reason: str | None = None,
    ) -> dict[str, Any]:
        details: dict[str, Any] = {
            "schema_version": 1,
            "stage": stage,
            "trigger_audit_id": trigger_audit.get("id"),
            "trigger_audit_status": trigger_audit.get("status"),
            "targets": {
                "price": list(targets.price_tickers),
                "market_cap": list(targets.market_cap_tickers),
            },
        }
        if reason:
            details["reason"] = reason
        if result:
            details["result"] = {
                "price_updated": result.price_updated,
                "price_failed_tickers": list(result.price_failed_tickers),
                "market_cap_updated": result.market_cap_updated,
                "market_cap_failed_tickers": list(
                    result.market_cap_failed_tickers
                ),
                "errors": list(result.errors),
            }
        return details

    def _insert(self, payload: Mapping[str, Any]) -> int:
        response = self.session.post(
            f"{self.base_url}/rest/v1/fetch_logs",
            headers={**self.headers, "Prefer": "return=representation"},
            json=payload,
            timeout=self.timeout,
        )
        response.raise_for_status()
        rows = response.json()
        if not isinstance(rows, list) or not rows or not rows[0].get("id"):
            raise ValueError("Remediation attempt marker returned no id")
        return int(rows[0]["id"])

    def start_attempt(
        self, trigger_audit: Mapping[str, Any], targets: RemediationTargets
    ) -> int:
        now = datetime.now(timezone.utc).isoformat()
        details = self._details(
            stage="started", trigger_audit=trigger_audit, targets=targets
        )
        return self._insert(
            {
                "job_name": REMEDIATION_JOB_NAME,
                "status": "running",
                "records_fetched": 0,
                "records_failed": 0,
                "failed_tickers": None,
                "error_message": json.dumps(
                    details, sort_keys=True, separators=(",", ":")
                ),
                "executed_at": now,
            }
        )

    def finish_attempt(
        self,
        attempt_id: int,
        trigger_audit: Mapping[str, Any],
        result: RemediationResult,
    ) -> None:
        details = self._details(
            stage="finished",
            trigger_audit=trigger_audit,
            targets=result.targets,
            result=result,
        )
        response = self.session.patch(
            f"{self.base_url}/rest/v1/fetch_logs",
            headers={**self.headers, "Prefer": "return=minimal"},
            params={"id": f"eq.{attempt_id}"},
            json={
                "status": result.status,
                "records_fetched": result.updated,
                "records_failed": result.failed,
                "failed_tickers": result.failed_tickers or None,
                "error_message": json.dumps(
                    details, sort_keys=True, separators=(",", ":")
                ),
            },
            timeout=self.timeout,
        )
        response.raise_for_status()

    def record_skipped(
        self,
        trigger_audit: Mapping[str, Any],
        *,
        reason: str,
    ) -> None:
        targets = RemediationTargets()
        details = self._details(
            stage="skipped",
            trigger_audit=trigger_audit,
            targets=targets,
            reason=reason,
        )
        self._insert(
            {
                "job_name": REMEDIATION_JOB_NAME,
                "status": "skipped",
                "records_fetched": 0,
                "records_failed": 0,
                "failed_tickers": None,
                "error_message": json.dumps(
                    details, sort_keys=True, separators=(",", ":")
                ),
                "executed_at": datetime.now(timezone.utc).isoformat(),
            }
        )


def perform_remediation(targets: RemediationTargets) -> RemediationResult:
    price_updated = 0
    price_failed: list[str] = []
    market_cap_updated = 0
    market_cap_failed: list[str] = []
    errors: list[str] = []

    if targets.price_tickers:
        try:
            from fetch_prices import fetch_selected_prices

            price_updated, price_failed = fetch_selected_prices(
                targets.price_tickers, force_history=True
            )
        except Exception as exc:
            price_failed = list(targets.price_tickers)
            errors.append(f"Price refresh failed: {_safe_error(exc)}")

    if targets.market_cap_tickers:
        try:
            import update_market_caps

            arguments: list[str] = []
            for ticker in targets.market_cap_tickers:
                arguments.extend(["--ticker", ticker])
            summary = update_market_caps.main(arguments)
            market_cap_updated = summary.updated
            market_cap_failed = summary.failed_tickers
        except Exception as exc:
            market_cap_failed = list(targets.market_cap_tickers)
            errors.append(f"Market-cap refresh failed: {_safe_error(exc)}")

    return RemediationResult(
        targets=targets,
        price_updated=price_updated,
        price_failed_tickers=tuple(sorted(set(price_failed))),
        market_cap_updated=market_cap_updated,
        market_cap_failed_tickers=tuple(sorted(set(market_cap_failed))),
        errors=tuple(errors),
    )


def run_audit_cycle(
    *,
    audit_runner: Callable[[], int],
    store: SupabaseRemediationStore,
    remediation_runner: Callable[[RemediationTargets], RemediationResult] = (
        perform_remediation
    ),
) -> int:
    """Run one bounded audit/remediation cycle with injectable test seams."""
    try:
        before = store.load_recent_audits(limit=1)
        previous_audit_id = int(before[0].get("id") or 0) if before else None
    except (requests.RequestException, ValueError, TypeError) as exc:
        print(
            f"Remediation state read failed before audit: {_safe_error(exc)}",
            file=sys.stderr,
        )
        return audit_runner()

    initial_exit = audit_runner()
    if initial_exit == EXIT_OK:
        return EXIT_OK

    try:
        recent = store.load_recent_audits(limit=PERSISTENT_FAILURE_THRESHOLD)
        if not recent:
            print("Failed audit produced no operational log; remediation skipped.")
            return initial_exit
        latest = _ordered_logs(recent)[0]
        if int(latest.get("id") or 0) == previous_audit_id:
            print("Failed audit was not logged; remediation skipped.")
            return initial_exit
        if not has_persistent_failure(recent):
            print("First consecutive audit failure; waiting for the next audit.")
            return initial_exit

        latest_success = store.load_latest_success()
        latest_remediation = store.load_latest_remediation()
        if remediation_already_attempted(latest_success, latest_remediation):
            print(
                "Automatic remediation was already attempted in this failure "
                "streak; leaving the persistent state visible in Data Health."
            )
            return initial_exit

        targets = extract_remediation_targets(latest)
        if targets.operation_count == 0:
            store.record_skipped(
                latest,
                reason=(
                    "No critical stored price or market-cap finding can be "
                    "repaired by the canonical updaters"
                ),
            )
            print("Persistent audit failure has no safe automatic repair target.")
            return initial_exit

        attempt_id = store.start_attempt(latest, targets)
        result = remediation_runner(targets)
        finish_failed = False
        try:
            store.finish_attempt(attempt_id, latest, result)
        except (requests.RequestException, ValueError, TypeError) as exc:
            finish_failed = True
            print(
                f"Remediation result log update failed: {_safe_error(exc)}",
                file=sys.stderr,
            )

        print(
            "Automatic remediation completed: "
            f"updated={result.updated}, failed={result.failed}. Re-auditing once."
        )
        final_exit = audit_runner()
        if finish_failed and final_exit == EXIT_OK:
            return EXIT_INCOMPLETE
        return final_exit
    except (requests.RequestException, ValueError, TypeError) as exc:
        print(
            f"Remediation state handling failed: {_safe_error(exc)}",
            file=sys.stderr,
        )
        return initial_exit


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    load_dotenv(repo_root / ".env.local")
    load_dotenv()
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get(
        "NEXT_PUBLIC_SUPABASE_URL"
    )
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role_key:
        print(
            "Automatic remediation is unavailable: SUPABASE_URL and "
            "SUPABASE_SERVICE_ROLE_KEY are required.",
            file=sys.stderr,
        )
        return audit_market_data.main([])

    store = SupabaseRemediationStore(supabase_url, service_role_key)
    return run_audit_cycle(
        audit_runner=lambda: audit_market_data.main([]),
        store=store,
    )


if __name__ == "__main__":
    raise SystemExit(main())
