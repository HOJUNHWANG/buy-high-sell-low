import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("q")?.trim() ?? "";

  // Strip characters that have no use in a ticker/name search
  const q = raw.replace(/[^a-zA-Z0-9\s.&'-]/g, "").slice(0, 50);

  if (!q || q.length < 1) {
    return NextResponse.json([]);
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("stocks")
    .select("ticker, name, exchange, sector, logo_url")
    .or(`ticker.ilike.${q}%,name.ilike.%${q}%`)
    .limit(10);

  if (error) {
    return NextResponse.json([], { status: 500 });
  }

  return NextResponse.json(data ?? [], {
    headers: { "Cache-Control": "no-store" },
  });
}
