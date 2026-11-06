"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 60_000;

/** Refresh server-rendered data while preserving filters, chart range and scroll. */
export function LiveDataRefresh({ renderedAt }: { renderedAt: number }) {
  const router = useRouter();
  const lastRequestAt = useRef(0);

  useEffect(() => {
    // Keep the local request time across server payload updates. Clock skew
    // must not cause an immediate refresh loop or postpone every timer tick.
    let lastRefreshAt = Math.max(Math.min(renderedAt, Date.now()), lastRequestAt.current);
    const refresh = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const now = Date.now();
      if (now - lastRefreshAt < REFRESH_INTERVAL_MS) return;
      // Focus, visibility and pageshow can fire together; send only one request.
      lastRefreshAt = now;
      lastRequestAt.current = now;
      router.refresh();
    };

    // Also handles an old prefetched or back/forward-restored route on mount.
    refresh();
    const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [renderedAt, router]);

  return null;
}
