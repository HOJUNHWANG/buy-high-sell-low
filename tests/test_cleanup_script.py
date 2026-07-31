import importlib.util
import os
import sys
import types
import unittest
from pathlib import Path


class RpcCall:
    def __init__(self, error=None):
        self.error = error

    def execute(self):
        if self.error:
            raise self.error
        return types.SimpleNamespace(data=[])


class FakeSupabase:
    def __init__(self, error=None):
        self.error = error
        self.rpc_names = []

    def rpc(self, name):
        self.rpc_names.append(name)
        return RpcCall(self.error)


def load_cleanup_module():
    dotenv = types.ModuleType("dotenv")
    dotenv.load_dotenv = lambda *args, **kwargs: None
    supabase_module = types.ModuleType("supabase")
    supabase_module.create_client = lambda *args, **kwargs: FakeSupabase()
    sys.modules["dotenv"] = dotenv
    sys.modules["supabase"] = supabase_module
    os.environ.setdefault("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")

    module_path = Path(__file__).resolve().parents[1] / "scripts" / "cleanup.py"
    spec = importlib.util.spec_from_file_location("cleanup_script_under_test", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class FictionalMarketCleanupTests(unittest.TestCase):
    def test_rpc_failure_is_logged_and_raised(self):
        module = load_cleanup_module()
        module.supabase = FakeSupabase(RuntimeError("rpc unavailable"))
        logged = []
        module.log_result = lambda *args: logged.append(args)

        with self.assertRaisesRegex(RuntimeError, "rpc unavailable"):
            module.cleanup_fictional_market(27)

        self.assertEqual(module.supabase.rpc_names, ["cleanup_fictional_market_data"])
        self.assertEqual(
            logged,
            [("cleanup", "failed", 27, 1, "Fictional market cleanup failed: rpc unavailable")],
        )

    def test_rpc_success_does_not_write_a_failure_log(self):
        module = load_cleanup_module()
        module.supabase = FakeSupabase()
        logged = []
        module.log_result = lambda *args: logged.append(args)

        module.cleanup_fictional_market(12)

        self.assertEqual(module.supabase.rpc_names, ["cleanup_fictional_market_data"])
        self.assertEqual(logged, [])


if __name__ == "__main__":
    unittest.main()
