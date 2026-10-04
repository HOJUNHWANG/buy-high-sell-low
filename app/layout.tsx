import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/Navbar";
import { Disclaimer } from "@/components/Disclaimer";
import { CookieBanner } from "@/components/CookieBanner";
import { Analytics } from "@vercel/analytics/react";
import { SITE_URL } from "@/lib/site-url";
import { DESIGN_BOOT_SCRIPT } from "@/lib/design";

const geist = Geist({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Buy High Sell Low — Stock & Crypto Tracker",
    template: "%s — Buy High Sell Low",
  },
  description:
    "Market-aware S&P 100 and 24/7 crypto quotes, AI-powered news analysis, and a paper trading simulator — completely free.",
  openGraph: {
    type: "website",
    siteName: "Buy High Sell Low",
    images: ["/og"],
  },
  twitter: {
    card: "summary_large_image",
  },
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.className} suppressHydrationWarning>
      <head><script id="bhsl-design-init" dangerouslySetInnerHTML={{ __html: DESIGN_BOOT_SCRIPT }} /></head>
      <body className="min-h-screen flex flex-col" style={{ background: "var(--bg)", color: "var(--text)" }}>
        <Providers>
          <Navbar />
          <main id="main-content" className="app-main flex-1">{children}</main>
          <Disclaimer />
          <CookieBanner />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
