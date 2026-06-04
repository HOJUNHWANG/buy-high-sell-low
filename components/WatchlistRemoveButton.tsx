"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function WatchlistRemoveButton({ ticker, userId }: { ticker: string; userId: string }) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  async function removeFromWatchlist() {
    if (removing) return;
    setRemoving(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.from("watchlist").delete().eq("user_id", userId).eq("ticker", ticker);
    router.refresh();
    setRemoving(false);
  }

  return (
    <button
      type="button"
      disabled={removing}
      onClick={removeFromWatchlist}
      aria-label={`Remove ${ticker} from watchlist`}
      title="Remove from watchlist"
      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all"
      style={{
        background: "rgba(15,23,42,0.78)",
        border: "1px solid var(--border-md)",
        color: removing ? "var(--text-3)" : "var(--text-2)",
      }}
    >
      ×
    </button>
  );
}
