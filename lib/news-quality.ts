type NewsEvidence = { title: string; url?: string; published_at?: string | null; source?: string | null; event_key?: string | null; relevance_score?: number; related_tickers?: string[] };
export const NEWS_DRIVER_HOURS = 72;
export function isRecentNews(publishedAt: string | null | undefined, now = new Date(), hours = NEWS_DRIVER_HOURS) {
  const time = publishedAt ? Date.parse(publishedAt) : NaN;
  return Number.isFinite(time) && time <= now.getTime() + 300_000 && time >= now.getTime() - hours * 3_600_000;
}
/** One event per feed, bounded publisher dominance, and recency before relevance. */
export function diversifyNews<T extends NewsEvidence>(rows: T[], limit = 60, now = new Date()): T[] {
  const score = (row: T) => {
    const age = Math.max(0, (now.getTime() - Date.parse(row.published_at ?? "")) / 3_600_000);
    return (Number.isFinite(age) ? 100 * Math.exp(-age / 36) : 0) + (row.relevance_score ?? 30) * 0.3;
  };
  const ordered = [...rows].sort((a, b) => score(b) - score(a));
  const events = new Set<string>(); const sources = new Map<string, number>(); const result: T[] = [];
  for (const row of ordered) {
    const event = row.event_key ?? row.title.toLowerCase().replace(/[^a-z0-9]+/g, " ");
    let source = row.source ?? "unknown";
    try { if (row.url) source = new URL(row.url).hostname.toLowerCase().replace(/^www\./, ""); } catch { /* use source label for legacy rows */ }
    if (events.has(event) || (sources.get(source) ?? 0) >= Math.max(3, Math.ceil(limit / 4))) continue;
    events.add(event); sources.set(source, (sources.get(source) ?? 0) + 1); result.push(row);
    if (result.length >= limit) break;
  }
  return result;
}
