"use client";

import { useEffect, useState } from "react";

interface Stats {
  totalViews: number;
  views30d: number;
  totalUsers: number;
  users30d: number;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export function AdminBanner() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setStats(data); })
      .catch(() => {});
  }, []);

  if (!stats) return null;

  const items = [
    { label: "Total Visits",  value: fmt(stats.totalViews), sub: null },
    { label: "30d Visits",    value: fmt(stats.views30d),   sub: null },
    { label: "Total Users",   value: fmt(stats.totalUsers), sub: null },
    { label: "30d Signups",   value: fmt(stats.users30d),   sub: null },
  ];

  return (
    <div
      className="w-full px-5 py-1.5 flex items-center gap-1 flex-wrap"
      style={{
        background: "rgba(124,108,252,0.08)",
        borderBottom: "1px solid rgba(124,108,252,0.2)",
        fontSize: "11px",
      }}
    >
      <span
        className="font-bold mr-3 px-1.5 py-0.5 rounded text-[10px]"
        style={{ background: "rgba(124,108,252,0.2)", color: "var(--accent)" }}
      >
        👑 Admin
      </span>
      {items.map(({ label, value }) => (
        <span key={label} className="flex items-center gap-1 mr-4">
          <span style={{ color: "var(--text-3)" }}>{label}:</span>
          <span className="font-semibold tabular-nums" style={{ color: "var(--text)" }}>{value}</span>
        </span>
      ))}
    </div>
  );
}
