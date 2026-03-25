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
      else { window.location.href = "/"; return; }
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
    <div className="min-h-screen flex items-center justify-center px-5 hero-gradient">
      <div className="w-full max-w-sm space-y-6 fade-up">

        {/* Logo */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 text-xl font-bold tracking-tight">
            <span className="w-7 h-7 rounded-lg gradient-accent flex items-center justify-center text-xs font-black text-white">
              B
            </span>
            <span>
              Buy High<span style={{ color: "var(--accent)" }}> Sell Low</span>
            </span>
          </Link>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            {mode === "reset"
              ? "Reset your password"
              : mode === "login"
              ? "Welcome back"
              : "Start trading for free"}
          </p>
        </div>

        {/* Card */}
        <div className="card-glass rounded-2xl p-6 space-y-4">

          {error && (
            <div className="rounded-lg px-3 py-2 text-xs"
              style={{ background: "var(--down-dim)", border: "1px solid rgba(248,113,113,0.2)", color: "var(--down)" }}>
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-lg px-3 py-2 text-xs"
              style={{ background: "var(--up-dim)", border: "1px solid rgba(52,211,153,0.2)", color: "var(--up)" }}>
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="email" className="sr-only">Email address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
                autoComplete="email"
                className="input"
              />
            </div>
            {mode !== "reset" && (
              <div>
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
                  className="input"
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
              className="btn btn-primary btn-block"
              style={{ padding: "12px 16px" }}>
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
                className="btn btn-secondary btn-block"
                style={{ padding: "12px 16px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
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
