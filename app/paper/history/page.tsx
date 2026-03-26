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
          {/* Table */}
          <div className="card rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Date", "Ticker", "Side", "Shares", "Price", "Total"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-semibold uppercase tracking-widest"
                      style={{ color: "var(--text-3)", fontSize: "10px" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="tr-hover" style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-4 py-3 tabular-nums" style={{ color: "var(--text-2)" }}>
                      {new Date(tx.executed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
                    </td>
                    <td className="px-4 py-3 font-semibold" style={{ color: "var(--accent)" }}>
                      <Link href={`/paper/trade/${tx.ticker}`}>{tx.ticker}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge"
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
                        {tx.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums" style={{ color: "var(--text)" }}>
                      {tx.shares.toFixed(4)}
                    </td>
                    <td className="px-4 py-3 tabular-nums" style={{ color: "var(--text)" }}>
                      ${tx.price.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                      ${tx.total.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
