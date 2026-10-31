"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PaperTradeBanner } from "@/components/PaperTradeBanner";
import { paperWorkspaceHref, resolvePaperView, type PaperView } from "@/lib/paper-workspace";

export function PaperWorkspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const view = resolvePaperView(pathname);
  const trading = pathname.startsWith("/paper/trade/");

  return <div className="paper-workspace max-w-7xl mx-auto px-5 py-8 space-y-6">
    <header className="paper-workspace-header">
      <div><p className="page-kicker">YOUR PRACTICE, YOUR PACE</p><h1>Paper trading</h1><p className="paper-workspace-description">Build your portfolio. Find your edge. All with simulated money.</p></div>
      <Link href="/stocks" className="btn btn-secondary">Explore markets <span aria-hidden="true">↗</span></Link>
    </header>
    <nav className="paper-view-nav" aria-label="Portfolio sections">
      {([["overview", "Portfolio"], ["history", "Trade history"], ["rankings", "Leaderboard"]] as [PaperView, string][]).map(([value, label]) => <Link key={value} href={paperWorkspaceHref(value)} aria-current={view === value && !trading ? "page" : undefined}>{label}</Link>)}
      {trading && <span aria-current="page">Place an order</span>}
      <span className="paper-simulation-label"><span />SIMULATED MONEY</span>
    </nav>
    <PaperTradeBanner />
    <div className="paper-workspace-content">{children}</div>
  </div>;
}
