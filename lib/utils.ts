export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function fmtVol(v: number | null | undefined): string {
  if (!v) return "—";
  if (v >= 1_000_000_000_000) return `${(v / 1_000_000_000_000).toFixed(1)}T`;
  if (v >= 1_000_000_000)     return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)         return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)             return `${(v / 1_000).toFixed(0)}K`;
  return v.toString();
}
