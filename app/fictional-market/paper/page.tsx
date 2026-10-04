import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { paperWorkspaceHref } from "@/lib/paper-workspace";

export const metadata: Metadata = {
  title: "Fictional Paper Trading",
  description: "Trade multiverse stocks with a dedicated simulated portfolio.",
};

export default async function FictionalPaperPage({ searchParams }: { searchParams: Promise<{ ticker?: string }> }) {
  const { ticker } = await searchParams;
  redirect(paperWorkspaceHref("fictional", "overview", ticker));
}
