"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SearchBar } from "@/components/SearchBar";
import { UserMenu } from "@/components/UserMenu";
import { useAdBlocked } from "@/components/AdBlockDetector";

const AD_BLOCKED_TABS = new Set(["/whatif", "/paper"]);

export function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const adBlocked = useAdBlocked();

  const navLinks = [
    { href: "/",              label: "Home"          },
    { href: "/stocks",        label: "Stocks"        },
    { href: "/news",          label: "News"          },
    { href: "/market-brief",  label: "Market Brief"  },
    { href: "/whatif",        label: "What If"       },
    { href: "/paper",         label: "Paper Trade"   },
  ];

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: "rgba(6,6,8,0.82)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="max-w-7xl mx-auto px-5 h-14 flex items-center gap-5">
        {/* Logo */}
        <Link href="/" className="text-sm font-bold tracking-tight shrink-0 flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-md gradient-accent flex items-center justify-center text-[9px] font-black text-white">
            B
          </span>
          <span>
            Buy High<span style={{ color: "var(--accent)" }}> Sell Low</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-0.5">
          <div className="h-5 w-px mx-2" style={{ background: "var(--border-md)" }} />
          {navLinks.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            const locked = adBlocked && AD_BLOCKED_TABS.has(href);
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all relative ${active ? "nav-link-active" : "nav-link"}`}
                style={{
                  color:      locked ? "var(--text-3)" : active ? "var(--text)" : "var(--text-2)",
                  background: active ? "var(--surface-2)" : "transparent",
                  opacity:    locked ? 0.6 : 1,
                }}
                title={locked ? "Disable ad blocker to access" : undefined}
              >
                {label}
                {locked && (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="3" className="inline ml-1 -mt-0.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search */}
        <div className="max-w-xs w-full hidden sm:block">
          <SearchBar />
        </div>

        {/* User menu */}
        <div className="hidden sm:block">
          <UserMenu />
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="ml-auto sm:hidden p-2 rounded-lg transition-colors"
          style={{ color: "var(--text-2)", background: menuOpen ? "var(--surface-2)" : "transparent" }}
          aria-label="Toggle menu"
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
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          className="sm:hidden px-5 pb-5 pt-3 space-y-3 slide-down"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <SearchBar />
          <nav className="flex flex-col gap-0.5">
            {navLinks.map(({ href, label }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              const locked = adBlocked && AD_BLOCKED_TABS.has(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className="px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    color:      locked ? "var(--text-3)" : active ? "var(--text)" : "var(--text-2)",
                    background: active ? "var(--surface-2)" : "transparent",
                    opacity:    locked ? 0.6 : 1,
                  }}
                >
                  {label}
                  {locked && (
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="3" className="inline ml-1 -mt-0.5">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  ) }
                </Link>
              );
            })}
          </nav>
          <div className="pt-2" style={{ borderTop: "1px solid var(--border)" }}>
            <UserMenu />
          </div>
        </div>
      )}
    </header>
  );
}
