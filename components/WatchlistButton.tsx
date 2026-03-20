"use client";

import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function WatchlistButton({ ticker }: { ticker: string }) {
  const [saved,   setSaved]   = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId,  setUserId]  = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      supabase
        .from("watchlist")
        .select("id")
        .eq("user_id", user.id)
        .eq("ticker", ticker)
        .maybeSingle()
        .then(({ data }) => {
          setSaved(!!data);
          setLoading(false);
        });
    });
  }, [ticker]);

  async function toggle() {
    if (loading) return;
    if (!userId) {
      window.location.href = "/auth/login";
      return;
    }
    const supabase = createSupabaseBrowserClient();
    setLoading(true);
    if (saved) {
      await supabase.from("watchlist").delete().eq("user_id", userId).eq("ticker", ticker);
      setSaved(false);
    } else {
      await supabase.from("watchlist").insert({ user_id: userId, ticker });
      setSaved(true);
    }
    setLoading(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={userId ? (saved ? "Remove from watchlist" : "Add to watchlist") : "Sign in to save"}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
      style={{
        background: saved ? "rgba(74,222,128,0.1)" : "var(--surface-2)",
        border:     saved ? "1px solid rgba(74,222,128,0.25)" : "1px solid var(--border-md)",
        color:      saved ? "var(--up)" : "var(--text-2)",
        opacity:    loading ? 0.5 : 1,
      }}
    >
      <svg width="13" height="13" fill={saved ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
      {saved ? "Saved" : "Watchlist"}
    </button>
  );
}
