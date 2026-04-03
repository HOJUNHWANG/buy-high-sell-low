"use client";

import { useState } from "react";

interface WhyMovingResult {
  headline: string;
  drivers: string[];
  sentiment: "bullish" | "bearish" | "neutral";
  outlook: string;
  price: number | null;
  changePct: number | null;
}

const SENTIMENT_STYLE = {
  bullish:  { color: "var(--up)",   bg: "var(--up-dim)",   label: "Bullish"  },
  bearish:  { color: "var(--down)", bg: "var(--down-dim)", label: "Bearish"  },
  neutral:  { color: "var(--text-3)", bg: "var(--surface-3)", label: "Neutral" },
};

export function WhyMoving({ ticker, isLoggedIn }: { ticker: string; isLoggedIn: boolean }) {
  const [result, setResult]   = useState<WhyMovingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [used, setUsed]       = useState(false);

  async function analyze() {
    if (!isLoggedIn) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai/why-moving", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
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

  const sentStyle = SENTIMENT_STYLE[result?.sentiment ?? "neutral"];

  return (
    <div className="card rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
          Why Is {ticker} Moving?
        </p>
        <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
          style={{ background: "var(--surface-3)", color: "var(--text-3)" }}>
          AI · 1/day
        </span>
      </div>

      {result ? (
        <div className="space-y-3">
          {/* Sentiment badge + headline */}
          <div className="flex items-start gap-2 flex-wrap">
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0"
              style={{ background: sentStyle.bg, color: sentStyle.color }}>
              {sentStyle.label}
            </span>
            <p className="text-sm font-medium leading-snug" style={{ color: "var(--text)" }}>
              {result.headline}
            </p>
          </div>

          {/* Key drivers */}
          {result.drivers.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                Key Drivers
              </p>
              {result.drivers.map((d, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[10px] font-bold shrink-0 mt-0.5 tabular-nums"
                    style={{ color: "var(--accent)" }}>{i + 1}.</span>
                  <p className="text-xs" style={{ color: "var(--text-2)" }}>{d}</p>
                </div>
              ))}
            </div>
          )}

          {/* Outlook */}
          {result.outlook && (
            <div className="rounded-lg px-3 py-2"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <p className="text-[10px] font-semibold mb-0.5" style={{ color: "var(--text-3)" }}>
                Short-Term Outlook
              </p>
              <p className="text-xs" style={{ color: "var(--text-2)" }}>{result.outlook}</p>
            </div>
          )}

          <p className="text-[9px]" style={{ color: "var(--text-3)" }}>
            AI generated · Not investment advice · Resets tomorrow
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {!isLoggedIn ? (
            <p className="text-xs" style={{ color: "var(--text-2)" }}>
              <a href="/auth/login" style={{ color: "var(--accent)" }}>Sign in</a> to get AI analysis of what&apos;s driving today&apos;s price action.
            </p>
          ) : (
            <>
              <p className="text-xs" style={{ color: "var(--text-2)" }}>
                AI analysis of key drivers behind today&apos;s price movement. Based on recent news and price data.
              </p>
              {error && (
                <p className="text-xs px-2 py-1.5 rounded"
                  style={{ background: "var(--down-dim)", color: "var(--down)" }}>
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
                {loading ? "Analyzing..." : used ? "Already analyzed today" : `Analyze ${ticker}`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
