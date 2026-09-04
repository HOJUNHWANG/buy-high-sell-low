import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await createSupabaseAdmin().rpc("fictional_paper_leaderboard", { p_viewer: user?.id ?? null });
  if (error) return NextResponse.json({ error: "Fictional rankings are temporarily unavailable." }, { status: 503 });
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
