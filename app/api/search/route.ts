import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

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
    console.error("Search error:", error);
    return NextResponse.json([], { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
