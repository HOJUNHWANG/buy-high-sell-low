import importlib.util
import os
import sys
import types
import unittest
from pathlib import Path


def load_cleanup_module():
    dotenv = types.ModuleType("dotenv")
    dotenv.load_dotenv = lambda *args, **kwargs: None
    supabase_module = types.ModuleType("supabase")
    supabase_module.create_client = lambda *args, **kwargs: object()
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


class CleanupCountTests(unittest.TestCase):
    def test_deleted_count_uses_exact_count_with_minimal_response(self):
        module = load_cleanup_module()
        self.assertEqual(module.deleted_count(types.SimpleNamespace(data=[], count=1234)), 1234)
        self.assertEqual(module.deleted_count(types.SimpleNamespace(data=[], count=0)), 0)
        self.assertEqual(module.deleted_count(types.SimpleNamespace(data=[{}], count=None)), 1)


if __name__ == "__main__":
    unittest.main()
