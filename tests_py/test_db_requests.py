import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import httpx
from postgrest.exceptions import APIError
from db_requests import DatabaseRequestError, execute_db


class DbRequestTests(unittest.TestCase):
    def setUp(self):
        self.sleep = patch("db_requests.time.sleep").start()
        self.addCleanup(patch.stopall)

    def gateway(self): return APIError({"message": "Gateway Timeout"})

    def test_read_recovers_without_rebuilding_payload(self):
        query = MagicMock()
        result = object()
        query.execute.side_effect = [self.gateway(), httpx.ReadTimeout("private URL"), result]
        self.assertIs(execute_db(query, operation="read", retry_safe=True), result)
        self.assertEqual(query.execute.call_count, 3)
        self.assertEqual(self.sleep.call_count, 2)

    def test_persistent_failure_is_bounded_and_redacted(self):
        query = MagicMock()
        query.execute.side_effect = httpx.ConnectError("secret-token")
        with self.assertRaises(DatabaseRequestError) as caught:
            execute_db(query, operation="upsert", retry_safe=True)
        self.assertNotIn("secret-token", str(caught.exception))
        self.assertIn("[database]", str(caught.exception))
        self.assertEqual(query.execute.call_count, 3)

    def test_ambiguous_insert_is_never_replayed(self):
        query = MagicMock()
        query.execute.side_effect = self.gateway()
        with self.assertRaisesRegex(DatabaseRequestError, "unsafe to replay"):
            execute_db(query, operation="insert")
        self.assertEqual(query.execute.call_count, 1)
        self.sleep.assert_not_called()

    def test_auth_constraints_and_code_errors_are_not_retried(self):
        for exc in [APIError({"message":"duplicate", "code":"23505"}), APIError({"message":"denied", "code":"42501"}), ValueError("bad code")]:
            query = MagicMock()
            query.execute.side_effect = exc
            with self.assertRaises(type(exc)) as caught:
                execute_db(query, operation="test", retry_safe=True)
            self.assertIs(caught.exception, exc)
            self.assertEqual(query.execute.call_count, 1)

    def test_committed_upsert_retry_keeps_one_row_and_exact_payload(self):
        rows = {}
        payload = {"ticker":"DELL", "price":123}
        attempts = []
        def write():
            attempts.append(dict(payload))
            rows[payload["ticker"]] = dict(payload)
            if len(attempts) == 1: raise self.gateway()
            return rows
        query = MagicMock()
        query.execute.side_effect = write
        execute_db(query, operation="upsert", retry_safe=True)
        self.assertEqual(len(rows), 1)
        self.assertEqual(attempts, [payload, payload])


if __name__ == "__main__": unittest.main()
