"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PaperTradeBanner } from "@/components/PaperTradeBanner";
import type { PaperTransaction } from "@/lib/types";

export default function PaperHistoryPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [transactions, setTransactions] = useState<PaperTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push("/auth/login");
      else setAuthed(true);
    });
  }, [supabase, router]);

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    fetch(`/api/paper/transactions?limit=${LIMIT}&offset=${offset}`)
      .then((r) => r.json())
      .then((data) => {
        setTransactions(data.transactions);
        setTotal(data.total);
      })
      .finally(() => setLoading(false));
  }, [authed, offset]);

  if (authed === null || loading) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-8 space-y-4">
        <div className="skeleton h-8 w-48" />
        {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-5 py-8 space-y-5 fade-up">
      <PaperTradeBanner />

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>Transaction History</h1>
        <Link href="/paper" className="text-xs font-medium" style={{ color: "var(--accent)" }}>
          Portfolio
        </Link>
      </div>

      {transactions.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ border: "1px dashed var(--border-md)" }}>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>No transactions yet.</p>
        </div>
      ) : (
        <>
          {/* Activity Feed */}
          <div className="space-y-3">
            {transactions.map((tx) => {
              const dateString = new Date(tx.executed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "numeric" });
              const isClosing = tx.side === "sell" || tx.side === "cover";
              const isLeveraged = tx.leverage > 1;

              return (
                <div key={tx.id} className="card rounded-xl p-4 flex gap-4 items-start relative overflow-hidden">
                  {/* Decorative side border indicating side */}
                  <div className="absolute top-0 left-0 bottom-0 w-1" style={{ 
                    background: tx.side === "buy" ? "var(--up)" : tx.side === "short" ? "#f97316" : tx.side === "cover" ? "#38bdf8" : "var(--down)" 
                  }} />

                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center gap-2">
                        <Link href={`/paper/trade/${tx.ticker}`} className="text-sm font-bold hover:underline" style={{ color: "var(--accent)" }}>
                          {tx.ticker}
                        </Link>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                          style={{
                            background: tx.side === "buy" ? "var(--up-dim)"
                              : tx.side === "short" ? "rgba(249,115,22,0.15)"
                              : tx.side === "cover" ? "rgba(56,189,248,0.15)"
                              : "var(--down-dim)",
                            color: tx.side === "buy" ? "var(--up)"
                              : tx.side === "short" ? "#f97316"
                              : tx.side === "cover" ? "#38bdf8"
                              : "var(--down)",
                          }}>
                          {tx.side}
                        </span>
                        {isLeveraged && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wider"
                            style={{ background: "var(--surface-3)", color: "var(--accent)" }}>
                            {tx.leverage}x Leverage
                          </span>
                        )}
                      </div>
                      <span className="text-[10px]" style={{ color: "var(--text-3)" }}>{dateString}</span>
                    </div>

                    <p className="text-xs" style={{ color: "var(--text-2)", lineHeight: "1.5" }}>
                      {tx.side === "buy" && `Bought ${tx.shares.toFixed(4)} shares of ${tx.ticker} at $${tx.price.toFixed(2)}. `}
                      {tx.side === "short" && `Shorted ${tx.shares.toFixed(4)} shares of ${tx.ticker} at $${tx.price.toFixed(2)}. `}
                      {tx.side === "sell" && `Sold ${tx.shares.toFixed(4)} shares of ${tx.ticker} at $${tx.price.toFixed(2)} to close the Long position. `}
                      {tx.side === "cover" && `Bought back ${tx.shares.toFixed(4)} shares of ${tx.ticker} at $${tx.price.toFixed(2)} to cover the Short position. `}
                      
                      {isLeveraged && !isClosing && (
                        <span style={{ color: "var(--text-4)" }}>
                          Total value was ${tx.total.toFixed(2)}, using ${(tx.total / tx.leverage).toFixed(2)} of your cash and ${(tx.total * (tx.leverage - 1) / tx.leverage).toFixed(2)} in borrowed funds.
                        </span>
                      )}
                      
                      {!isLeveraged && !isClosing && (
                        <span style={{ color: "var(--text-4)" }}>
                          Total investment of ${tx.total.toFixed(2)}.
                        </span>
                      )}
                    </p>

                    {/* Summary Badges for closing trades - we estimate since PnL isn't fully in paper_transactions historically */}
                    {isClosing && (
                      <div className="flex gap-2 mt-2 pt-2" style={{ borderTop: "1px dashed var(--border)" }}>
                        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--surface-3)", color: "var(--text-2)" }}>
                          Proceeds: ${tx.total.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center justify-between">
              <p className="text-xs" style={{ color: "var(--text-3)" }}>
                {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                  disabled={offset === 0}
                  className="px-3 py-1 rounded text-xs font-medium"
                  style={{
                    border: "1px solid var(--border-md)",
                    color: offset === 0 ? "var(--text-3)" : "var(--text-2)",
                    opacity: offset === 0 ? 0.5 : 1,
                  }}
                >
                  Previous
                </button>
                <button
                  onClick={() => setOffset(offset + LIMIT)}
                  disabled={offset + LIMIT >= total}
                  className="px-3 py-1 rounded text-xs font-medium"
                  style={{
                    border: "1px solid var(--border-md)",
                    color: offset + LIMIT >= total ? "var(--text-3)" : "var(--text-2)",
                    opacity: offset + LIMIT >= total ? 0.5 : 1,
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
