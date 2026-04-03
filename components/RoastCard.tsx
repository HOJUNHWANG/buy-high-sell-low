"use client";

import { useState } from "react";

interface AnalysisResult {
  grade: string;
  nickname: string;
  summary: string;
  strengths: string[];
  risks: string[];
  suggestion: string;
}

const GRADE_COLORS: Record<string, string> = {
  "A+": "#4ade80", "A": "#4ade80", "A-": "#4ade80",
  "B+": "#38bdf8", "B": "#38bdf8", "B-": "#38bdf8",
  "C+": "#fbbf24", "C": "#fbbf24", "C-": "#fbbf24",
  "D+": "#fb923c", "D": "#fb923c", "D-": "#fb923c",
  "F": "#f87171",
};

export function RoastCard() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [used, setUsed] = useState(false);

  async function analyze() {
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
      setError("Analysis failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const gradeColor = GRADE_COLORS[result?.grade ?? ""] ?? "var(--text-3)";

  return (
    <div className="card rounded-xl overflow-hidden">
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
            AI Portfolio Analysis
          </p>
          {result && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
              style={{ background: "var(--surface-3)", color: "var(--text-3)" }}>
              1/day
            </span>
          )}
        </div>

        {result ? (
          <div className="space-y-3">
            {/* Grade + Nickname */}
            <div className="flex items-center gap-3">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-black shrink-0"
                style={{
                  background: `${gradeColor}18`,
                  color: gradeColor,
                  border: `1px solid ${gradeColor}35`,
                }}
              >
                {result.grade}
              </div>
              <div>
                <p className="text-[10px]" style={{ color: "var(--text-3)" }}>Trading Style</p>
                <p className="text-sm font-bold" style={{ color: "var(--text)" }}>
                  &ldquo;{result.nickname}&rdquo;
                </p>
              </div>
            </div>

            {/* Summary */}
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
              {result.summary}
            </p>

            {/* Strengths */}
            {result.strengths.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#4ade80" }}>
                  Strengths
                </p>
                {result.strengths.map((s, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0 text-[10px]" style={{ color: "#4ade80" }}>✓</span>
                    <p className="text-xs" style={{ color: "var(--text-2)" }}>{s}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Risks */}
            {result.risks.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--down)" }}>
                  Risks
                </p>
                {result.risks.map((r, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0 text-[10px]" style={{ color: "var(--down)" }}>⚠</span>
                    <p className="text-xs" style={{ color: "var(--text-2)" }}>{r}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Suggestion */}
            {result.suggestion && (
              <div className="rounded-lg p-2.5"
                style={{ background: "var(--accent-dim)", border: "1px solid rgba(124,108,252,0.2)" }}>
                <p className="text-[10px] font-semibold mb-0.5" style={{ color: "var(--accent)" }}>Suggestion</p>
                <p className="text-xs" style={{ color: "var(--text-2)" }}>{result.suggestion}</p>
              </div>
            )}

            <p className="text-[9px]" style={{ color: "var(--text-3)" }}>
              AI generated · Not financial advice · Resets tomorrow
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs" style={{ color: "var(--text-2)" }}>
              Get an AI assessment of your portfolio — strengths, risks, and one actionable suggestion.
            </p>
            {error && (
              <p className="text-xs px-2 py-1.5 rounded" style={{ background: "var(--down-dim)", color: "var(--down)" }}>
                {error}
              </p>
            )}
            <button
              onClick={analyze}
              disabled={loading || used}
              className="w-full py-2 rounded-lg text-xs font-semibold transition-opacity"
              style={{
                background: "var(--accent-dim)",
                color: "var(--accent)",
                border: "1px solid rgba(124,108,252,0.2)",
                opacity: loading || used ? 0.5 : 1,
              }}
            >
              {loading ? "Analyzing..." : used ? "Already analyzed today" : "Analyze My Portfolio"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
