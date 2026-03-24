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

  const excludeSector = searchParams.get("exclude_sector");

  let query = supabase
    .from("stocks")
    .select("ticker, name, exchange, sector, logo_url")
    .or(`ticker.ilike.${q}%,name.ilike.%${q}%`);

  if (excludeSector) {
    query = query.neq("sector", excludeSector);
  }

  const { data, error } = await query.limit(10);

  if (error) {
    console.error("Search query failed:", error.message);
    return NextResponse.json([], { status: 500 });
  }

  return NextResponse.json(data ?? [], {
    headers: { "Cache-Control": "no-store" },
  });
}
