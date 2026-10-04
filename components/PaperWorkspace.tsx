"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { FictionalPaperDesk } from "@/components/FictionalPaperDesk";
import { PaperTradeBanner } from "@/components/PaperTradeBanner";
import { paperWorkspaceHref, resolvePaperView, type PaperMarket, type PaperView } from "@/lib/paper-workspace";

export function PaperWorkspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const market: PaperMarket = params.get("market") === "fictional" ? "fictional" : "real";
  const view = resolvePaperView(pathname, market === "fictional" ? params.get("view") : null);
  const ticker = params.get("ticker")?.toUpperCase();
  const trading = pathname.startsWith("/paper/trade/");

  return <div className="paper-workspace max-w-7xl mx-auto px-5 py-8 space-y-6">
    <header className="paper-workspace-header">
      <div><p className="page-kicker">YOUR PRACTICE, YOUR PACE</p><h1>Paper trading</h1><p className="paper-workspace-description">Build your portfolio. Find your edge. All with simulated money.</p></div>
      <Link href={market === "fictional" ? "/fictional-market" : "/stocks"} className="btn btn-secondary">Explore {market === "fictional" ? "Fictional" : "markets"} <span aria-hidden="true">↗</span></Link>
    </header>
    <div className="paper-market-bar">
      <nav className="paper-market-switch" aria-label="Paper trading market">
        {(["real", "fictional"] as const).map((value) => <Link href={paperWorkspaceHref(value, view, value === "fictional" ? ticker : undefined)} key={value} aria-current={market === value ? "page" : undefined}>
          <span className={`paper-market-dot ${value}`} /><span>{value === "real" ? "Stocks & crypto" : "Fictional"}</span><span className="paper-market-caption">{value === "real" ? "Real-world prices" : "Multiverse stocks"}</span>
        </Link>)}
      </nav>
      <p className="paper-account-note">{market === "fictional" ? "Fictional" : "Real-market"} account · Independent balance & rankings</p>
    </div>
    <nav className="paper-view-nav" aria-label="Portfolio sections">
      {([["overview", "Portfolio"], ["history", "Trade history"], ["rankings", "Leaderboard"]] as [PaperView, string][]).map(([value, label]) => <Link key={value} href={paperWorkspaceHref(market, value, ticker)} aria-current={view === value && !trading ? "page" : undefined}>{label}</Link>)}
      {trading && <span aria-current="page">Place an order</span>}
      <span className="paper-simulation-label"><span />SIMULATED MONEY</span>
    </nav>
    <PaperTradeBanner />
    <div className="paper-workspace-content">
      {market === "fictional" ? <FictionalPaperDesk key={ticker ?? "fictional"} initialTicker={ticker} view={view} /> : children}
    </div>
  </div>;
}
