import { Suspense } from "react";
import type { Metadata } from "next";
import { PaperWorkspace } from "@/components/PaperWorkspace";

export const metadata: Metadata = {
  title: "Paper Trading",
  description: "Practice stocks, crypto, and Fictional trading in one workspace. Track your portfolio, trade history, and market leaderboard with simulated money.",
};

export default function PaperLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="max-w-7xl mx-auto px-5 py-8 space-y-4" aria-label="Loading paper trading"><div className="skeleton h-12 w-64" /><div className="skeleton h-64" /></div>}><PaperWorkspace>{children}</PaperWorkspace></Suspense>;
}
