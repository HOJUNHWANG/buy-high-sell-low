"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode]       = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    const supabase = createSupabaseBrowserClient();
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) setError(error.message);
      else setMessage("Check your email to confirm your account.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else router.push("/");
    }
    setLoading(false);
  }

  async function handleGoogle() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="w-full max-w-sm space-y-5">

        {/* Logo */}
        <div className="text-center space-y-1">
          <Link href="/" className="text-xl font-semibold tracking-tight">
            Global<span style={{ color: "var(--accent)" }}>Stock</span>
          </Link>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            {mode === "login" ? "Sign in to your account" : "Create your free account"}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-6 space-y-4"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>

          {error && (
            <div className="rounded-lg px-3 py-2 text-xs"
              style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "var(--down)" }}>
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-lg px-3 py-2 text-xs"
              style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", color: "var(--up)" }}>
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {["email","password"].map((field) => (
              <input
                key={field}
                type={field}
                value={field === "email" ? email : password}
                onChange={(e) => field === "email" ? setEmail(e.target.value) : setPassword(e.target.value)}
                placeholder={field === "email" ? "Email" : "Password"}
                required
                minLength={field === "password" ? 6 : undefined}
                className="w-full px-3 py-2.5 text-sm rounded-lg outline-none transition-all"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
                onFocus={(e) => (e.target.style.borderColor = "var(--border-lg)")}
                onBlur={(e)  => (e.target.style.borderColor = "var(--border)")}
              />
            ))}

            {mode === "signup" && (
              <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                By signing up you agree to our{" "}
                <Link href="/privacy" className="link-accent">Privacy Policy</Link>.
                Beta service — free during stabilization.
              </p>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-2.5 text-sm font-semibold rounded-lg transition-all"
              style={{
                background: loading ? "var(--surface-3)" : "var(--accent)",
                color: loading ? "var(--text-2)" : "#fff",
                cursor: loading ? "not-allowed" : "pointer",
              }}>
              {loading
                ? (mode === "login" ? "Signing in..." : "Creating account...")
                : (mode === "login" ? "Sign in" : "Create account")}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            <span className="text-[11px]" style={{ color: "var(--text-3)" }}>or</span>
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
          </div>

          {/* Google */}
          <button onClick={handleGoogle}
            className="w-full py-2.5 text-sm font-medium rounded-lg transition-all"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border-md)", color: "var(--text)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface-2)")}>
            Continue with Google
          </button>
        </div>

        {/* Toggle */}
        <p className="text-center text-sm" style={{ color: "var(--text-2)" }}>
          {mode === "login" ? (
            <>Don&apos;t have an account?{" "}
              <button onClick={() => setMode("signup")} className="link-accent font-medium">Sign up free</button></>
          ) : (
            <>Already have an account?{" "}
              <button onClick={() => setMode("login")} className="link-accent font-medium">Sign in</button></>
          )}
        </p>
      </div>
    </div>
  );
}
