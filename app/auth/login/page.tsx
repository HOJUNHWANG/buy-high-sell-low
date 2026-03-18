"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        email,
        password,
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
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Link href="/" className="text-2xl font-bold text-white">
            GlobalStock
          </Link>
          <p className="text-gray-400 text-sm mt-1">
            {mode === "login" ? "Sign in to your account" : "Create your account"}
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          {error && (
            <div className="bg-red-900/50 border border-red-800 rounded-lg px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          {message && (
            <div className="bg-emerald-900/50 border border-emerald-800 rounded-lg px-3 py-2 text-sm text-emerald-300">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              minLength={6}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            {mode === "signup" && (
              <p className="text-xs text-gray-500">
                By signing up you agree to our{" "}
                <Link href="/privacy" className="text-blue-400 hover:underline">
                  Privacy Policy
                </Link>
                . Beta service — free during stabilization period.
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors"
            >
              {loading ? "..." : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-700" />
            </div>
            <div className="relative flex justify-center text-xs text-gray-500 bg-gray-900 px-2">
              or
            </div>
          </div>

          <button
            onClick={handleGoogle}
            className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-lg py-2 text-sm transition-colors"
          >
            Continue with Google
          </button>
        </div>

        <p className="text-center text-sm text-gray-500">
          {mode === "login" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                onClick={() => setMode("signup")}
                className="text-blue-400 hover:text-blue-300"
              >
                Sign up free
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                onClick={() => setMode("login")}
                className="text-blue-400 hover:text-blue-300"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
