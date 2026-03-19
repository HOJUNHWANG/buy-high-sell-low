"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookie_consent");
    if (!consent) setVisible(true);
  }, []);

  function accept() {
    localStorage.setItem("cookie_consent", "accepted");
    setVisible(false);
  }

  function decline() {
    localStorage.setItem("cookie_consent", "declined");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 px-4 py-3"
      style={{ background: "var(--surface)", borderTop: "1px solid var(--border-md)" }}
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
          We use cookies for authentication and personalized ads (Google AdSense).{" "}
          <Link href="/privacy" className="link-accent">Learn more</Link>
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={decline}
            className="text-xs px-3 py-1.5 rounded-md transition-colors"
            style={{ color: "var(--text-2)", border: "1px solid var(--border-md)" }}
          >
            Decline
          </button>
          <button
            onClick={accept}
            className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
