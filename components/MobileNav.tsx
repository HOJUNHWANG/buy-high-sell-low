"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { SearchBar } from "@/components/SearchBar";
import { UserMenu } from "@/components/UserMenu";
import { ThemePicker } from "@/components/ThemePicker";
import { DesignToggle } from "@/components/DesignToggle";
import { navigation, isNavigationActive } from "@/lib/navigation";
import { useDesign } from "@/components/DesignProvider";

export function MobileNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const { design } = useDesign();
  const navLinks = navigation.map((item) => ({ href: item.href as string, label: (design === "2.0" ? item.label : item.originalLabel) as string }));
  const links = isAdmin
    ? [...navLinks, { href: "/admin/data-health", label: "Data Health" }]
    : navLinks;
  const [menuOpen, setMenuOpen] = useState(false);

  // Close on route change
  useEffect(() => {
    const id = window.setTimeout(() => setMenuOpen(false), 0);
    return () => window.clearTimeout(id);
  }, [pathname]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    const media = window.matchMedia(design === "2.0" ? "(min-width: 1024px)" : "(min-width: 1400px)");
    const resize = () => { if (media.matches) setMenuOpen(false); };
    window.addEventListener("keydown", close);
    media.addEventListener("change", resize);
    return () => { window.removeEventListener("keydown", close); media.removeEventListener("change", resize); };
  }, [menuOpen, design]);

  return (
    <>
      <button
        onClick={() => setMenuOpen((o) => !o)}
        className="mobile-menu-trigger p-2 rounded-lg transition-colors shrink-0"
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
            className="mobile-menu-backdrop fixed inset-0 z-40"
            style={{ top: design === "2.0" ? "64px" : "56px", background: "var(--overlay)" }}
            onClick={() => setMenuOpen(false)}
          />
          {/* Dropdown panel — positioned absolutely below the sticky header */}
          <div
            className="mobile-menu-panel absolute top-full left-0 right-0 z-50 px-4 pb-6 pt-3 space-y-3 slide-down"
            style={{
              borderTop: "1px solid var(--border)",
              background: "var(--header-bg)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
            }}
          >
            <SearchBar />
            <nav className="flex flex-col gap-0.5">
              {links.map(({ href, label }) => {
                const active = isNavigationActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
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
            <div className="flex flex-wrap gap-3"><DesignToggle /><ThemePicker mobile /></div>
            <div className="pt-2" style={{ borderTop: "1px solid var(--border)" }}>
              <UserMenu isAdmin={isAdmin} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
