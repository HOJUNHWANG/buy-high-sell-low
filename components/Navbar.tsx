import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";
import { MobileNav } from "@/components/MobileNav";
import { SearchBar } from "@/components/SearchBar";
import { UserMenu } from "@/components/UserMenu";

export function Navbar() {
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

        {/* Desktop nav (client island — needs usePathname) */}
        <NavLinks />

        <div className="flex-1" />

        {/* Search */}
        <div className="max-w-xs w-full hidden sm:block">
          <SearchBar />
        </div>

        {/* User menu */}
        <div className="hidden sm:block">
          <UserMenu />
        </div>

        {/* Mobile hamburger + menu (client island — needs useState/usePathname) */}
        <MobileNav />
      </div>
    </header>
  );
}
