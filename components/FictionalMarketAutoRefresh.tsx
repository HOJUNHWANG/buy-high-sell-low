"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const PRICE_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const PRICE_REFRESH_GRACE_MS = 60 * 1000;

function currentPriceSlot(now: number) {
  return Math.floor(now / PRICE_REFRESH_INTERVAL_MS);
}

function delayUntilNextRefresh(now: number) {
  const currentBoundary = currentPriceSlot(now) * PRICE_REFRESH_INTERVAL_MS;
  const currentSlotRefresh = currentBoundary + PRICE_REFRESH_GRACE_MS;
  const nextRefresh = now < currentSlotRefresh
    ? currentSlotRefresh
    : currentBoundary + PRICE_REFRESH_INTERVAL_MS + PRICE_REFRESH_GRACE_MS;
  return Math.max(1_000, nextRefresh - now);
}

export function FictionalMarketAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    let lastRefreshedSlot = currentPriceSlot(Date.now());
    let timeoutId: ReturnType<typeof setTimeout>;

    const refresh = () => {
      lastRefreshedSlot = currentPriceSlot(Date.now());
      router.refresh();
    };

    const scheduleRefresh = () => {
      timeoutId = setTimeout(() => {
        refresh();
        scheduleRefresh();
      }, delayUntilNextRefresh(Date.now()));
    };

    const handleVisibilityChange = () => {
      const visibleSlot = currentPriceSlot(Date.now());
      if (document.visibilityState === "visible" && visibleSlot > lastRefreshedSlot) refresh();
    };

    scheduleRefresh();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router]);

  return null;
}
