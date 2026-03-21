"use client";

import { useEffect, useRef } from "react";

interface AdSlotProps {
  /** AdSense ad slot ID */
  slot: string;
  /** Ad format: "horizontal" (728x90), "rectangle" (300x250), "auto" */
  format?: "horizontal" | "rectangle" | "auto";
  /** Optional className for wrapper */
  className?: string;
}

declare global {
  interface Window {
    adsbygoogle?: Record<string, unknown>[];
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

/**
 * Google AdSense ad slot component.
 * Renders nothing if NEXT_PUBLIC_ADSENSE_CLIENT_ID is not set.
 * Drop-in ready — just set the env var and slot IDs to activate.
 */
export function AdSlot({ slot, format = "auto", className }: AdSlotProps) {
  const adRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (!CLIENT_ID || pushed.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {
      // AdSense not loaded or blocked
    }
  }, []);

  if (!CLIENT_ID) return null;

  const style: React.CSSProperties =
    format === "horizontal"
      ? { display: "block", width: "100%", height: "90px" }
      : format === "rectangle"
        ? { display: "block", width: "300px", height: "250px" }
        : { display: "block" };

  return (
    <div className={className}>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={style}
        data-ad-client={CLIENT_ID}
        data-ad-slot={slot}
        data-ad-format={format === "auto" ? "auto" : undefined}
        data-full-width-responsive={format === "auto" ? "true" : undefined}
      />
    </div>
  );
}
