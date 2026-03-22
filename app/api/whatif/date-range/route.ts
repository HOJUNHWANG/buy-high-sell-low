import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ticker = request.nextUrl.searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ error: "ticker is required" }, { status: 400 });

  const [{ data: minRow }, { data: maxRow }] = await Promise.all([
    supabase
      .from("price_history_long")
      .select("date")
      .eq("ticker", ticker)
      .order("date", { ascending: true })
      .limit(1)
      .single(),
    supabase
      .from("price_history_long")
      .select("date")
      .eq("ticker", ticker)
      .order("date", { ascending: false })
      .limit(1)
      .single(),
  ]);

  if (!minRow || !maxRow) {
    return NextResponse.json({ error: "No price data for this ticker" }, { status: 404 });
  }

  return NextResponse.json({ minDate: minRow.date, maxDate: maxRow.date });
}
