"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/",             label: "Home"         },
  { href: "/stocks",       label: "Stocks"       },
  { href: "/news",         label: "News"         },
  { href: "/market-brief", label: "Market Brief" },
  { href: "/whatif",       label: "What If"      },
  { href: "/paper",        label: "Paper Trade"  },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="hidden md:flex items-center gap-0.5">
      <div className="h-5 w-px mx-2" style={{ background: "var(--border-md)" }} />
      {navLinks.map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all relative ${active ? "nav-link-active" : "nav-link"}`}
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
