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

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 px-4 py-3"
      style={{ background: "var(--surface)", borderTop: "1px solid var(--border-md)" }}
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
          We use essential cookies to keep you signed in. No advertising or tracking cookies are used.{" "}
          <Link href="/privacy" className="link-accent">Privacy Policy</Link>
        </p>
        <button
          onClick={accept}
          className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors shrink-0"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          OK
        </button>
      </div>
    </div>
  );
}
