"use client";

import { createContext, useContext, useEffect, useState } from "react";

const AdBlockContext = createContext(false);

export function useAdBlocked() {
  return useContext(AdBlockContext);
}

/**
 * Detects ad blockers using a bait element approach.
 * Wraps children and provides detection result via context.
 */
export function AdBlockProvider({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    // Method 1: Bait element — ad blockers hide/remove elements with ad-like class names
    const bait = document.createElement("div");
    bait.className = "adsbygoogle ad-slot ad-banner textads banner-ads";
    bait.style.cssText =
      "height:1px;width:1px;position:absolute;left:-9999px;top:-9999px;";
    bait.setAttribute("data-ad-slot", "test");
    document.body.appendChild(bait);

    // Small delay to let blockers act
    const timer = setTimeout(() => {
      const isHidden =
        bait.offsetHeight === 0 ||
        bait.offsetWidth === 0 ||
        bait.clientHeight === 0 ||
        getComputedStyle(bait).display === "none" ||
        getComputedStyle(bait).visibility === "hidden" ||
        !document.body.contains(bait);

      setBlocked(isHidden);
      bait.remove();
    }, 200);

    return () => {
      clearTimeout(timer);
      bait.remove();
    };
  }, []);

  return (
    <AdBlockContext.Provider value={blocked}>{children}</AdBlockContext.Provider>
  );
}
