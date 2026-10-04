import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";
import { MobileNav } from "@/components/MobileNav";
import { SearchBar } from "@/components/SearchBar";
import { UserMenu } from "@/components/UserMenu";
import { ThemePicker } from "@/components/ThemePicker";
import { DesignToggle } from "@/components/DesignToggle";
import { WorkspaceNavigation, WorkspaceLocation } from "@/components/WorkspaceNavigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function Navbar() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAdmin = Boolean(process.env.ADMIN_EMAIL && user?.email === process.env.ADMIN_EMAIL);

  return (
    <><a href="#main-content" className="skip-link">Skip to content</a><WorkspaceNavigation isAdmin={isAdmin} /><header
      className="app-header sticky top-0 z-50"
      style={{
        background: "var(--header-bg)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="app-header-inner max-w-[1440px] mx-auto px-5 h-14 flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="header-brand text-sm font-bold tracking-tight shrink-0 flex items-center gap-1.5">
          <span
            className="w-5 h-5 rounded-md gradient-accent flex items-center justify-center text-[9px] font-black"
            style={{ color: "var(--on-accent)" }}
          >
            B
          </span>
          <span>
            Buy High<span style={{ color: "var(--accent)" }}> Sell Low</span>
          </span>
        </Link>

        {/* Desktop nav (client island — needs usePathname) */}
        <NavLinks isAdmin={isAdmin} />
        <WorkspaceLocation />

        <div className="flex-1" />

        {/* Search */}
        <div className="header-search hidden sm:block">
          <SearchBar />
        </div>

        {/* User menu */}
        <div className="header-appearance"><DesignToggle /><ThemePicker /></div>

        <div className="header-user shrink-0 whitespace-nowrap hidden sm:block">
          <UserMenu isAdmin={isAdmin} />
        </div>

        {/* Mobile hamburger + menu (client island — needs useState/usePathname) */}
        <MobileNav isAdmin={isAdmin} />
      </div>
    </header></>
  );
}
