"use client";

import { useState } from "react";

interface RoastResult {
  roast: string;
  grade: string;
  nickname: string;
}

const GRADE_COLORS: Record<string, string> = {
  "A+": "#4ade80", "A": "#4ade80", "A-": "#4ade80",
  "B+": "#38bdf8", "B": "#38bdf8", "B-": "#38bdf8",
  "C+": "#fbbf24", "C": "#fbbf24", "C-": "#fbbf24",
  "D+": "#fb923c", "D": "#fb923c", "D-": "#fb923c",
  "F": "#f87171",
};

export function RoastCard() {
  const [result, setResult] = useState<RoastResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [used, setUsed] = useState(false);

  async function getRoasted() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/paper/roast", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        if (res.status === 429) setUsed(true);
        return;
      }
      setResult(data);
      setUsed(true);
    } catch {
      setError("Failed to generate roast");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card rounded-xl overflow-hidden">
      <div className="p-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-3)" }}>
          AI Portfolio Roast
        </p>

        {result ? (
          <div className="space-y-3">
            {/* Grade + Nickname */}
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black"
                style={{
                  background: `${GRADE_COLORS[result.grade] ?? "var(--text-3)"}20`,
                  color: GRADE_COLORS[result.grade] ?? "var(--text-3)",
                  border: `1px solid ${GRADE_COLORS[result.grade] ?? "var(--text-3)"}40`,
                }}
              >
                {result.grade}
              </div>
              <div>
                <p className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Your trader name:</p>
                <p className="text-sm font-bold" style={{ color: "var(--text)" }}>
                  &ldquo;{result.nickname}&rdquo;
                </p>
              </div>
            </div>

            {/* Roast text */}
            <p className="text-xs leading-relaxed italic" style={{ color: "var(--text-2)" }}>
              &ldquo;{result.roast}&rdquo;
            </p>

            <p className="text-[9px]" style={{ color: "var(--text-3)" }}>
              AI generated &middot; For entertainment only &middot; Next roast available tomorrow
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs" style={{ color: "var(--text-2)" }}>
              Let our AI judge your trading decisions. 1 free roast per day.
            </p>

            {error && (
              <p className="text-xs px-2 py-1.5 rounded" style={{ background: "var(--down-dim)", color: "var(--down)" }}>
                {error}
              </p>
            )}

            <button
              onClick={getRoasted}
              disabled={loading || used}
              className="w-full py-2 rounded-lg text-xs font-semibold transition-opacity"
              style={{
                background: "var(--accent-dim)",
                color: "var(--accent)",
                border: "1px solid rgba(124,108,252,0.2)",
                opacity: loading || used ? 0.5 : 1,
              }}
            >
              {loading ? "Roasting..." : used ? "Already roasted today" : "Roast My Portfolio"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
