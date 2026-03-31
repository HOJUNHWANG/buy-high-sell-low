import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";

const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  const admin = createSupabaseAdmin();

  const pageParam = request.nextUrl.searchParams.get("page");
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  // Current month
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Count total graveyard entries this month
  const { count: totalCount } = await admin
    .from("paper_graveyard")
    .select("id", { count: "exact", head: true })
    .eq("month", month);

  const total = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;

  // Get graveyard entries for this month, ordered by liquidation time (most recent first)
  const { data: entries } = await admin
    .from("paper_graveyard")
    .select("id, user_id, final_value, cash_at_death, positions_json, liquidated_at")
    .eq("month", month)
    .order("liquidated_at", { ascending: false })
    .range(start, start + PAGE_SIZE - 1);

  // Fetch nicknames for graveyard entries
  const userIds = (entries ?? []).map((e: { user_id: string }) => e.user_id);
  let nicknames: Record<string, string | null> = {};
  if (userIds.length > 0) {
    const { data: accounts } = await admin
      .from("paper_accounts")
      .select("user_id, nickname")
      .in("user_id", userIds);
    nicknames = Object.fromEntries(
      (accounts ?? []).map((a: { user_id: string; nickname: string | null }) => [a.user_id, a.nickname])
    );
  }

  const formatted = (entries ?? []).map((e: {
    id: number;
    user_id: string;
    final_value: number;
    cash_at_death: number;
    positions_json: { ticker: string; shares: number; avg_cost: number; side: string; leverage: number; borrowed: number }[];
    liquidated_at: string;
  }, i: number) => ({
    rank: start + i + 1,
    userId: e.user_id,
    nickname: nicknames[e.user_id] ?? null,
    finalValue: e.final_value,
    cashAtDeath: e.cash_at_death,
    positions: e.positions_json ?? [],
    liquidatedAt: e.liquidated_at,
  }));

  return NextResponse.json({
    entries: formatted,
    totalCount: total,
    page: safePage,
    totalPages,
    month,
  }, {
    headers: { "Cache-Control": "s-maxage=60" },
  });
}
