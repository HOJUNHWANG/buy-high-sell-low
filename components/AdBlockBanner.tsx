"use client";

import { useState } from "react";
import { useAdBlocked } from "./AdBlockDetector";

/**
 * Shows a dismissible banner when an ad blocker is detected.
 * Non-aggressive: explains that ads support the free service.
 */
export function AdBlockBanner() {
  const blocked = useAdBlocked();
  const [dismissed, setDismissed] = useState(false);

  if (!blocked || dismissed) return null;

  return (
    <div
      className="px-5 py-3 flex items-center justify-between gap-4 text-xs"
      style={{
        background: "var(--surface-2)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
          style={{ color: "var(--accent)" }}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p style={{ color: "var(--text-2)" }}>
          <span className="font-semibold" style={{ color: "var(--text)" }}>
            Ad blocker detected.
          </span>{" "}
          Ads help keep this service free. Please consider disabling your ad
          blocker to support us and unlock more AI summaries.
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 px-2 py-1 rounded text-[10px] font-medium transition-colors"
        style={{
          color: "var(--text-3)",
          border: "1px solid var(--border)",
        }}
        aria-label="Dismiss ad blocker notice"
      >
        Dismiss
      </button>
    </div>
  );
}
