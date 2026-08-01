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
  const columns = "ticker, name, exchange, sector, logo_url";

  // Keep user input out of PostgREST's raw `.or()` grammar. Separate `ilike`
  // filters are encoded by supabase-js and also handle names with apostrophes.
  let tickerQuery = supabase
    .from("stocks")
    .select(columns)
    .eq("is_active", true)
    .ilike("ticker", `${q}%`);
  let nameQuery = supabase
    .from("stocks")
    .select(columns)
    .eq("is_active", true)
    .ilike("name", `%${q}%`);

  if (excludeSector) {
    tickerQuery = tickerQuery.neq("sector", excludeSector);
    nameQuery = nameQuery.neq("sector", excludeSector);
  }

  const [tickerResult, nameResult] = await Promise.all([
    tickerQuery.limit(10),
    nameQuery.limit(10),
  ]);

  const error = tickerResult.error ?? nameResult.error;
  if (error) {
    console.error("Search query failed:", error.message);
    return NextResponse.json([], { status: 500 });
  }

  const seen = new Set<string>();
  const data = [...(tickerResult.data ?? []), ...(nameResult.data ?? [])]
    .filter((stock) => {
      if (seen.has(stock.ticker)) return false;
      seen.add(stock.ticker);
      return true;
    })
    .slice(0, 10);

  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
