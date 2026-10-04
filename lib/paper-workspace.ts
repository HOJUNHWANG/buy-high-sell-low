export type PaperMarket = "real" | "fictional";
export type PaperView = "overview" | "history" | "rankings";

export function paperWorkspaceHref(market: PaperMarket, view: PaperView = "overview", ticker?: string) {
  if (market === "real") return view === "history" ? "/paper/history" : view === "rankings" ? "/paper/leaderboard" : "/paper";
  const params = new URLSearchParams({ market: "fictional" });
  if (view !== "overview") params.set("view", view);
  if (ticker) params.set("ticker", ticker.toUpperCase());
  return `/paper?${params}`;
}

export function resolvePaperView(pathname: string, value: string | null): PaperView {
  if (pathname === "/paper/history" || value === "history") return "history";
  if (pathname === "/paper/leaderboard" || value === "rankings") return "rankings";
  return "overview";
}
