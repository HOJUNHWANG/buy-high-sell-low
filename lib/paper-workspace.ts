export type PaperView = "overview" | "history" | "rankings";

export function paperWorkspaceHref(view: PaperView = "overview") {
  return view === "history" ? "/paper/history" : view === "rankings" ? "/paper/leaderboard" : "/paper";
}

export function resolvePaperView(pathname: string): PaperView {
  if (pathname === "/paper/history") return "history";
  if (pathname === "/paper/leaderboard") return "rankings";
  return "overview";
}
