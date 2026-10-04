"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavigationIcon } from "@/components/NavigationIcon";
import { navigation, isNavigationActive } from "@/lib/navigation";

export function WorkspaceNavigation({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return <>
    <aside className="workspace-sidebar design-v2-only" aria-label="Workspace navigation">
      <Link className="workspace-brand" href="/"><span className="workspace-monogram">B<span>.</span></span><span>BHSL<span className="workspace-brand-caption">MARKET WORKSPACE</span></span></Link>
      <div className="workspace-navigation">
        {(["market", "research", "portfolio"] as const).map((group) => <div key={group} className="workspace-nav-group">
          <p>{group === "market" ? "Explore" : group === "research" ? "Research" : "Your portfolio"}</p>
          {navigation.filter((item) => item.group === group).map((item) => <Link key={item.href} href={item.href} aria-current={isNavigationActive(pathname, item.href) ? "page" : undefined} className="workspace-nav-link"><NavigationIcon icon={item.icon} /><span>{item.label}</span>{item.href === "/paper" && <span className="workspace-nav-badge">SIM</span>}</Link>)}
        </div>)}
        {isAdmin && <Link className="workspace-nav-link" href="/admin/data-health" aria-current={pathname.startsWith("/admin") ? "page" : undefined}><NavigationIcon icon="health" />Data health</Link>}
      </div>
      <div className="workspace-sidebar-note"><span className="workspace-note-dot" /><div>A little practice.<br /><strong>A better perspective.</strong><p>Trade with simulated money.</p></div></div>
    </aside>
    <nav className="workspace-mobile-nav design-v2-only" aria-label="Quick navigation">
      {navigation.filter((item) => ["/", "/stocks", "/news", "/paper"].includes(item.href)).map((item) => <Link key={item.href} href={item.href} aria-current={isNavigationActive(pathname, item.href) ? "page" : undefined}><NavigationIcon icon={item.icon} /><span>{item.href === "/paper" ? "Portfolio" : item.label.split(" ")[0]}</span></Link>)}
    </nav>
  </>;
}

export function WorkspaceLocation() {
  const pathname = usePathname();
  const current = navigation.find((item) => isNavigationActive(pathname, item.href));
  return <div className="workspace-location design-v2-only"><span>Workspace</span><span>/</span><strong>{current?.label ?? (pathname.startsWith("/auth") ? "Your account" : "BHSL")}</strong></div>;
}
