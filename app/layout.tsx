import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/Navbar";
import { Disclaimer } from "@/components/Disclaimer";
import { CookieBanner } from "@/components/CookieBanner";
import { AdBlockBanner } from "@/components/AdBlockBanner";
import { AdminBanner } from "@/components/AdminBanner";
import { PageTracker } from "@/components/PageTracker";

const ADSENSE_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Buy High Sell Low — Stock & Crypto Tracker",
    template: "%s — Buy High Sell Low",
  },
  description:
    "Real-time S&P 100 & crypto prices, AI-powered news analysis, paper trading simulator, and What If calculator — completely free.",
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
    <html lang="en" className={geist.className}>
      <body className="min-h-screen flex flex-col" style={{ background: "var(--bg)", color: "var(--text)" }}>
        {ADSENSE_ID && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ID}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
        <Providers>
          <PageTracker />
          <Navbar />
          <AdminBanner />
          <AdBlockBanner />
          <main className="flex-1">{children}</main>
          <Disclaimer />
          <CookieBanner />
        </Providers>
      </body>
    </html>
  );
}
