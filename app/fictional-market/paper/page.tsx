import type { Metadata } from "next";
import { FictionalPaperDesk } from "@/components/FictionalPaperDesk";

export const metadata: Metadata = {
  title: "Fictional Paper Trading",
  description: "Trade multiverse stocks with a dedicated simulated portfolio.",
};

export default async function FictionalPaperPage({ searchParams }: { searchParams: Promise<{ ticker?: string }> }) {
  const { ticker } = await searchParams;
  return <FictionalPaperDesk initialTicker={ticker?.toUpperCase()} />;
}
