import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/Navbar";
import { Disclaimer } from "@/components/Disclaimer";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "GlobalStock — US Stock News & AI Analysis",
    template: "%s — GlobalStock",
  },
  description:
    "Real-time US stock prices, news, and AI-powered analysis for everyday investors.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={geist.className}>
      <body className="min-h-screen flex flex-col bg-gray-950 text-gray-100">
        <Providers>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Disclaimer />
        </Providers>
      </body>
    </html>
  );
}
