"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { SearchBar } from "@/components/SearchBar";
import { UserMenu } from "@/components/UserMenu";

const navLinks = [
  { href: "/",             label: "Home"         },
  { href: "/stocks",       label: "Stocks"       },
  { href: "/news",         label: "News"         },
  { href: "/market-brief", label: "Market Brief" },
  { href: "/whatif",       label: "What If"      },
  { href: "/paper",        label: "Paper Trade"  },
];

export function MobileNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close on route change
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  return (
    <>
      <button
        onClick={() => setMenuOpen((o) => !o)}
        className="sm:hidden p-2 rounded-lg transition-colors shrink-0"
        style={{ color: "var(--text-2)", background: menuOpen ? "var(--surface-2)" : "transparent" }}
        aria-label="Toggle menu"
        aria-expanded={menuOpen}
      >
        {menuOpen ? (
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {menuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="sm:hidden fixed inset-0 z-40"
            style={{ top: "56px", background: "rgba(0,0,0,0.6)" }}
            onClick={() => setMenuOpen(false)}
          />
          {/* Dropdown panel — positioned absolutely below the sticky header */}
          <div
            className="sm:hidden absolute top-full left-0 right-0 z-50 px-4 pb-6 pt-3 space-y-3 slide-down"
            style={{
              borderTop: "1px solid var(--border)",
              background: "rgba(6,6,8,0.97)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
            }}
          >
            <SearchBar />
            <nav className="flex flex-col gap-0.5">
              {navLinks.map(({ href, label }) => {
                const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    className="px-3 py-3 rounded-lg text-sm font-medium transition-colors"
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
            <div className="pt-2" style={{ borderTop: "1px solid var(--border)" }}>
              <UserMenu />
            </div>
          </div>
        </>
      )}
    </>
  );
}
