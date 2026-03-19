"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function UserMenu() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.refresh();
    router.push("/");
  }

  if (loading) {
    return <div className="w-7 h-7 rounded-full skeleton shrink-0" />;
  }

  if (!email) {
    return (
      <Link
        href="/auth/login"
        className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-md transition-all"
        style={{
          background: "var(--accent-dim)",
          color: "var(--accent)",
          border: "1px solid rgba(124,108,252,0.25)",
        }}
      >
        Sign in
      </Link>
    );
  }

  const initial = email[0].toUpperCase();

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-opacity hover:opacity-80"
        style={{ background: "var(--accent)", color: "#fff" }}
        aria-label="User menu"
      >
        {initial}
      </button>

      {open && (
        <div
          className="absolute right-0 top-9 w-52 rounded-xl py-1 z-50"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-md)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          <div className="px-3 py-2.5 border-b" style={{ borderColor: "var(--border)" }}>
            <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-3)" }}>
              Signed in as
            </p>
            <p className="text-xs font-medium truncate" style={{ color: "var(--text)" }}>{email}</p>
          </div>

          <div className="py-1">
            <Link href="/" onClick={() => setOpen(false)} className="dropdown-item">
              <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Dashboard
            </Link>
            <Link href="/news" onClick={() => setOpen(false)} className="dropdown-item">
              <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
              News Feed
            </Link>
          </div>

          <div className="border-t py-1" style={{ borderColor: "var(--border)" }}>
            <button onClick={signOut} className="dropdown-item dropdown-item-danger">
              <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
