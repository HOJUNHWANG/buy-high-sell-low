"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigation, isNavigationActive } from "@/lib/navigation";

const navLinks = navigation.filter((item) => item.href !== "/market-calendar").map((item) => ({ href: item.href as string, label: item.originalLabel as string }));

export function NavLinks({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const links = isAdmin
    ? [...navLinks, { href: "/admin/data-health", label: "Data Health" }]
    : navLinks;
  return (
    <nav className="classic-nav shrink-0 whitespace-nowrap hidden md:flex items-center gap-0.5" aria-label="Main navigation">
      <div className="h-5 w-px mx-2 shrink-0" style={{ background: "var(--border-md)" }} />
      {links.map(({ href, label }) => {
        const active = isNavigationActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium transition-all relative ${active ? "nav-link-active" : "nav-link"}`}
            style={{
              color:      active ? "var(--text)" : "var(--text-2)",
              background: active ? "var(--surface-2)" : "transparent",
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
