import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPaperPortfolio } from "@/lib/paper-portfolio";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return getPaperPortfolio(user.id, supabase);
}
