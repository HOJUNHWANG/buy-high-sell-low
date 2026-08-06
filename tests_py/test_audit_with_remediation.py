import json
import sys
import unittest
from pathlib import Path


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from audit_market_data import EXIT_CRITICAL, EXIT_INCOMPLETE, EXIT_OK  # noqa: E402
from audit_with_remediation import (  # noqa: E402
    RemediationResult,
    RemediationTargets,
    extract_finding_fingerprints,
    extract_remediation_targets,
    has_persistent_failure,
    persistent_finding_streaks,
    remediation_already_attempted,
    run_audit_cycle,
)


def audit_log(
    row_id: int,
    status: str,
    *,
    findings: list[dict] | None = None,
) -> dict:
    if findings is None and status != "success":
        findings = [
            {
                "severity": "critical",
                "ticker": "MU",
                "field": "market_cap",
                "code": "market_cap_deviation",
            }
        ]
    return {
        "id": row_id,
        "job_name": "market_data_audit",
        "status": status,
        "records_fetched": 133,
        "records_failed": 0 if status == "success" else 1,
        "failed_tickers": None if status == "success" else ["MU"],
        "error_message": json.dumps({"findings": findings or []}),
        "executed_at": f"2026-08-{row_id:02d}T00:00:00Z",
    }


class FakeStore:
    def __init__(
        self,
        audits: list[dict],
        *,
        remediations: list[dict] | None = None,
    ) -> None:
        self.audits = audits
        self.remediations = remediations or []
        self.started: list[tuple[dict, RemediationTargets, tuple[str, ...]]] = []
        self.finished: list[tuple[int, dict, RemediationResult]] = []
        self.skipped: list[tuple[dict, str, tuple[str, ...]]] = []

    def load_recent_audits(self, limit: int = 2):
        return sorted(
            self.audits,
            key=lambda row: (row["executed_at"], row["id"]),
            reverse=True,
        )[:limit]

    def load_recent_remediations(self, limit=100):
        return self.remediations[:limit]

    def start_attempt(self, trigger_audit, targets, fingerprints):
        self.started.append((trigger_audit, targets, tuple(fingerprints)))
        return 100

    def finish_attempt(self, attempt_id, trigger_audit, result, fingerprints):
        self.finished.append((attempt_id, trigger_audit, result))

    def record_skipped(self, trigger_audit, *, reason, fingerprints):
        self.skipped.append((trigger_audit, reason, tuple(fingerprints)))


class AuditRemediationTargetTests(unittest.TestCase):
    def test_detects_two_consecutive_failures(self):
        self.assertTrue(
            has_persistent_failure(
                [audit_log(3, "critical"), audit_log(2, "incomplete")]
            )
        )
        self.assertFalse(
            has_persistent_failure(
                [audit_log(3, "critical"), audit_log(2, "success")]
            )
        )

    def test_different_findings_do_not_form_a_persistent_streak(self):
        doge = {
            "severity": "critical",
            "ticker": "DOGE-USD",
            "field": "market_cap",
            "code": "market_cap_deviation",
        }
        qqq = {
            "severity": "critical",
            "ticker": "QQQ",
            "field": "price",
            "code": "price_deviation",
        }

        logs = [
            audit_log(3, "critical", findings=[qqq]),
            audit_log(2, "critical", findings=[doge]),
        ]

        self.assertFalse(has_persistent_failure(logs))
        self.assertEqual(persistent_finding_streaks(logs), {})

    def test_fingerprint_contains_ticker_field_and_code(self):
        log = audit_log(
            2,
            "critical",
            findings=[
                {
                    "severity": "critical",
                    "ticker": "gld",
                    "field": "price",
                    "code": "price_deviation",
                }
            ],
        )

        self.assertEqual(
            extract_finding_fingerprints(log),
            frozenset({"GLD|price|price_deviation"}),
        )

    def test_extracts_only_critical_canonical_update_fields(self):
        log = audit_log(
            2,
            "critical",
            findings=[
                {
                    "severity": "critical",
                    "ticker": "MU",
                    "field": "market_cap",
                    "code": "market_cap_deviation",
                },
                {
                    "severity": "critical",
                    "ticker": "BTC-USD",
                    "field": "price",
                    "code": "price_deviation",
                },
                {
                    "severity": "warning",
                    "ticker": "AAPL",
                    "field": "price",
                    "code": "price_deviation",
                },
                {
                    "severity": "critical",
                    "ticker": "NOT-TRACKED",
                    "field": "price",
                    "code": "price_deviation",
                },
                {
                    "severity": "critical",
                    "ticker": "QQQ",
                    "field": "all",
                    "code": "reference_missing",
                },
            ],
        )

        targets = extract_remediation_targets(log)

        self.assertEqual(targets.price_tickers, ("BTC-USD",))
        self.assertEqual(targets.market_cap_tickers, ("MU",))

    def test_remediation_attempt_is_scoped_to_fingerprint_and_streak(self):
        fingerprint = "MU|market_cap|market_cap_deviation"
        attempt = {
            "id": 11,
            "error_message": json.dumps(
                {
                    "trigger_audit_id": 10,
                    "fingerprints": [fingerprint],
                    "targets": {"market_cap": ["MU"], "price": []},
                }
            ),
        }

        self.assertTrue(remediation_already_attempted(fingerprint, 9, [attempt]))
        self.assertFalse(
            remediation_already_attempted(
                "GLD|price|price_deviation", 9, [attempt]
            )
        )
        self.assertFalse(remediation_already_attempted(fingerprint, 12, [attempt]))

    def test_window_boundary_does_not_reopen_a_long_running_streak(self):
        fingerprint = "MU|market_cap|market_cap_deviation"
        logs = [audit_log(row_id, "critical") for row_id in range(51, 1, -1)]
        streaks = persistent_finding_streaks(logs)
        old_attempt = {
            "id": 100,
            "error_message": json.dumps(
                {
                    "trigger_audit_id": 1,
                    "fingerprints": [fingerprint],
                    "targets": {"market_cap": ["MU"], "price": []},
                }
            ),
        }

        self.assertEqual(streaks[fingerprint], 0)
        self.assertTrue(
            remediation_already_attempted(
                fingerprint, streaks[fingerprint], [old_attempt]
            )
        )


class AuditCycleTests(unittest.TestCase):
    def test_first_failure_waits_without_remediation(self):
        store = FakeStore([audit_log(1, "success")])
        remediation_calls = []

        def audit_runner():
            store.audits.append(
                audit_log(
                    2,
                    "critical",
                    findings=[
                        {
                            "severity": "critical",
                            "ticker": "MU",
                            "field": "market_cap",
                            "code": "market_cap_deviation",
                        }
                    ],
                )
            )
            return EXIT_CRITICAL

        result = run_audit_cycle(
            audit_runner=audit_runner,
            store=store,
            remediation_runner=lambda targets: remediation_calls.append(targets),
        )

        self.assertEqual(result, EXIT_CRITICAL)
        self.assertEqual(remediation_calls, [])
        self.assertEqual(store.started, [])

    def test_second_failure_remediates_once_then_reaudits(self):
        finding = {
            "severity": "critical",
            "ticker": "MU",
            "field": "market_cap",
            "code": "market_cap_deviation",
        }
        store = FakeStore([audit_log(1, "critical", findings=[finding])])
        exits = [EXIT_CRITICAL, EXIT_OK]
        next_ids = [2, 3]
        remediation_calls = []

        def audit_runner():
            exit_code = exits.pop(0)
            row_id = next_ids.pop(0)
            store.audits.append(
                audit_log(
                    row_id,
                    "success" if exit_code == EXIT_OK else "critical",
                    findings=[] if exit_code == EXIT_OK else [finding],
                )
            )
            return exit_code

        def remediate(targets):
            remediation_calls.append(targets)
            return RemediationResult(targets=targets, market_cap_updated=1)

        result = run_audit_cycle(
            audit_runner=audit_runner,
            store=store,
            remediation_runner=remediate,
        )

        self.assertEqual(result, EXIT_OK)
        self.assertEqual(len(remediation_calls), 1)
        self.assertEqual(remediation_calls[0].market_cap_tickers, ("MU",))
        self.assertEqual(len(store.started), 1)
        self.assertEqual(len(store.finished), 1)
        self.assertEqual(exits, [])

    def test_existing_attempt_prevents_repeat_in_same_streak(self):
        finding = {
            "severity": "critical",
            "ticker": "MU",
            "field": "market_cap",
            "code": "market_cap_deviation",
        }
        store = FakeStore(
            [audit_log(1, "critical", findings=[finding])],
            remediations=[
                {
                    "id": 50,
                    "error_message": json.dumps(
                        {
                            "trigger_audit_id": 1,
                            "fingerprints": [
                                "MU|market_cap|market_cap_deviation"
                            ],
                            "targets": {
                                "market_cap": ["MU"],
                                "price": [],
                            },
                        }
                    ),
                    "executed_at": "2026-08-01T01:00:00Z",
                }
            ],
        )

        def audit_runner():
            store.audits.append(audit_log(2, "critical", findings=[finding]))
            return EXIT_CRITICAL

        result = run_audit_cycle(audit_runner=audit_runner, store=store)

        self.assertEqual(result, EXIT_CRITICAL)
        self.assertEqual(store.started, [])
        self.assertEqual(len(store.audits), 2)

    def test_provider_only_failure_does_not_enter_remediation_streak(self):
        reference_finding = {
            "severity": "warning",
            "ticker": "MU",
            "field": "all",
        }
        store = FakeStore(
            [audit_log(1, "incomplete", findings=[reference_finding])]
        )

        def audit_runner():
            store.audits.append(
                audit_log(2, "incomplete", findings=[reference_finding])
            )
            return EXIT_INCOMPLETE

        result = run_audit_cycle(audit_runner=audit_runner, store=store)

        self.assertEqual(result, EXIT_INCOMPLETE)
        self.assertEqual(store.skipped, [])
        self.assertEqual(store.started, [])

    def test_persistent_noncanonical_finding_is_recorded_as_skipped(self):
        finding = {
            "severity": "critical",
            "ticker": "MU",
            "field": "all",
            "code": "unrepairable_consistency_error",
        }
        store = FakeStore([audit_log(1, "critical", findings=[finding])])

        def audit_runner():
            store.audits.append(audit_log(2, "critical", findings=[finding]))
            return EXIT_CRITICAL

        result = run_audit_cycle(audit_runner=audit_runner, store=store)

        self.assertEqual(result, EXIT_CRITICAL)
        self.assertEqual(len(store.skipped), 1)
        self.assertEqual(store.started, [])


if __name__ == "__main__":
    unittest.main()
