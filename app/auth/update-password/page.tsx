"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
    } else {
      router.push("/");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-1">
          <Link href="/" className="text-xl font-semibold tracking-tight">
            Buy High<span style={{ color: "var(--accent)" }}> Sell Low</span>
          </Link>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            Set your new password
          </p>
        </div>

        <div
          className="rounded-2xl p-6 space-y-4"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          {error && (
            <div
              className="rounded-lg px-3 py-2 text-xs"
              style={{
                background: "rgba(248,113,113,0.08)",
                border: "1px solid rgba(248,113,113,0.2)",
                color: "var(--down)",
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="new-password" className="sr-only">New password</label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full px-3 py-2.5 text-sm rounded-lg outline-none transition-all"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
                onFocus={(e) => (e.target.style.borderColor = "var(--border-lg)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="confirm-password" className="sr-only">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm password"
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full px-3 py-2.5 text-sm rounded-lg outline-none transition-all"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
                onFocus={(e) => (e.target.style.borderColor = "var(--border-lg)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm font-semibold rounded-lg transition-all"
              style={{
                background: loading ? "var(--surface-3)" : "var(--accent)",
                color: loading ? "var(--text-2)" : "#fff",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Updating..." : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
