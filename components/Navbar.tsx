"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SearchBar } from "@/components/SearchBar";
import { UserMenu } from "@/components/UserMenu";

export function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { href: "/",        label: "Home"    },
    { href: "/stocks",  label: "Stocks"  },
    { href: "/news",    label: "News"    },
  ];

  return (
    <header
      style={{
        background: "rgba(8,8,8,0.88)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border)",
      }}
      className="sticky top-0 z-50"
    >
      <div className="max-w-7xl mx-auto px-5 h-12 flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="text-sm font-semibold tracking-tight shrink-0">
          Buy High<span style={{ color: "var(--accent)" }}> Sell Low</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          <div className="h-4 w-px mx-1" style={{ background: "var(--border-md)" }} />
          {navLinks.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                style={{
                  color:      active ? "var(--text)"      : "var(--text-2)",
                  background: active ? "var(--surface-3)" : "transparent",
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Search */}
        <div className="flex-1 max-w-xs hidden sm:block ml-1">
          <SearchBar />
        </div>

        {/* User menu */}
        <div className="ml-auto hidden sm:block">
          <UserMenu />
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="ml-auto sm:hidden p-1.5 rounded-md"
          style={{ color: "var(--text-2)" }}
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
        <div className="sm:hidden px-5 pb-4 pt-2 space-y-3" style={{ borderTop: "1px solid var(--border)" }}>
          <SearchBar />
          <nav className="flex flex-col gap-1">
            {navLinks.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className="px-3 py-2 rounded-lg text-sm font-medium"
                  style={{
                    color:      active ? "var(--text)"      : "var(--text-2)",
                    background: active ? "var(--surface-2)" : "transparent",
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="pt-1">
            <UserMenu />
          </div>
        </div>
      )}
    </header>
  );
}
