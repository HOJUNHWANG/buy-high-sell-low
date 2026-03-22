import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const { data, count } = await supabase
    .from("paper_transactions")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("executed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  return NextResponse.json({
    transactions: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}
