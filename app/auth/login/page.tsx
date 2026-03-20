"use client";

import { Suspense, useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode]       = useState<"login" | "signup" | "reset">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const err = searchParams.get("error");
    if (err) setError(err);
  }, [searchParams]);

  // Redirect if already logged in
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace("/");
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();

    if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      if (error) setError(error.message);
      else setMessage("Password reset link sent — check your email.");
      setLoading(false);
      return;
    }

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
            {mode === "reset"
              ? "Reset your password"
              : mode === "login"
              ? "Sign in to your account"
              : "Create your free account"}
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
            <div className="space-y-1">
              <label htmlFor="email" className="sr-only">Email address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
                autoComplete="email"
                className="w-full px-3 py-2.5 text-sm rounded-lg outline-none transition-all"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
                onFocus={(e) => (e.target.style.borderColor = "var(--border-lg)")}
                onBlur={(e)  => (e.target.style.borderColor = "var(--border)")}
              />
            </div>
            {mode !== "reset" && (
              <div className="space-y-1">
                <label htmlFor="password" className="sr-only">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  minLength={6}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  className="w-full px-3 py-2.5 text-sm rounded-lg outline-none transition-all"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--border-lg)")}
                  onBlur={(e)  => (e.target.style.borderColor = "var(--border)")}
                />
              </div>
            )}

            {mode === "login" && (
              <div className="text-right">
                <button type="button" onClick={() => { setMode("reset"); setError(null); setMessage(null); }}
                  className="text-[11px] link-accent">
                  Forgot password?
                </button>
              </div>
            )}

            {mode === "signup" && (
              <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                By signing up you agree to our{" "}
                <Link href="/terms" className="link-accent">Terms</Link> and{" "}
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
                ? (mode === "reset" ? "Sending..." : mode === "login" ? "Signing in..." : "Creating account...")
                : (mode === "reset" ? "Send reset link" : mode === "login" ? "Sign in" : "Create account")}
            </button>
          </form>

          {mode !== "reset" && (
            <>
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
            </>
          )}
        </div>

        {/* Toggle */}
        <p className="text-center text-sm" style={{ color: "var(--text-2)" }}>
          {mode === "reset" ? (
            <>Remember your password?{" "}
              <button onClick={() => { setMode("login"); setError(null); setMessage(null); }} className="link-accent font-medium">Sign in</button></>
          ) : mode === "login" ? (
            <>Don&apos;t have an account?{" "}
              <button onClick={() => { setMode("signup"); setError(null); setMessage(null); }} className="link-accent font-medium">Sign up free</button></>
          ) : (
            <>Already have an account?{" "}
              <button onClick={() => { setMode("login"); setError(null); setMessage(null); }} className="link-accent font-medium">Sign in</button></>
          )}
        </p>
      </div>
    </div>
  );
}
