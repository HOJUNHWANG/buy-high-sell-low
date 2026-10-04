export const navigation = [
  { href: "/", label: "Overview", originalLabel: "Home", icon: "overview", group: "market" },
  { href: "/stocks", label: "Markets", originalLabel: "Stocks", icon: "markets", group: "market" },
  { href: "/fictional-market", label: "Fictional market", originalLabel: "Fictional", icon: "fictional", group: "market" },
  { href: "/news", label: "News feed", originalLabel: "News", icon: "news", group: "research" },
  { href: "/market-brief", label: "Market brief", originalLabel: "Market Brief", icon: "brief", group: "research" },
  { href: "/market-calendar", label: "Market calendar", originalLabel: "Calendar", icon: "calendar", group: "research" },
  { href: "/paper", label: "Paper trading", originalLabel: "Paper Trade", icon: "paper", group: "portfolio" },
] as const;

export function isNavigationActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/stocks") return pathname.startsWith("/stocks") || pathname.startsWith("/stock/");
  return pathname === href || pathname.startsWith(`${href}/`);
}
