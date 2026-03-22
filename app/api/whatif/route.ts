import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET — fetch user's saved scenarios
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("whatif_scenarios")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json(data ?? []);
}

// POST — calculate what-if scenario
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ticker, buyDate, sellDate, amount, save } = body as {
    ticker?: string;
    buyDate?: string;
    sellDate?: string | null;
    amount?: number;
    save?: boolean;
  };

  if (!ticker || !buyDate || !amount || amount <= 0) {
    return NextResponse.json({ error: "ticker, buyDate, and amount (>0) are required" }, { status: 400 });
  }

  // Get buy date price (closest available date on or after buyDate)
  const { data: buyData } = await supabase
    .from("price_history_long")
    .select("date, close")
    .eq("ticker", ticker)
    .gte("date", buyDate)
    .order("date", { ascending: true })
    .limit(1)
    .single();

  if (!buyData) {
    return NextResponse.json({ error: "No price data available for the selected buy date. Try a more recent date." }, { status: 404 });
  }

  // Get sell date price — either from history or current price
  let sellPrice: number;
  let actualSellDate: string;

  if (sellDate) {
    const { data: sellData } = await supabase
      .from("price_history_long")
      .select("date, close")
      .eq("ticker", ticker)
      .lte("date", sellDate)
      .order("date", { ascending: false })
      .limit(1)
      .single();

    if (!sellData) {
      return NextResponse.json({ error: "No price data available for the selected sell date." }, { status: 404 });
    }
    sellPrice = sellData.close;
    actualSellDate = sellData.date;
  } else {
    // Still holding — use current price
    const { data: currentPrice } = await supabase
      .from("stock_prices")
      .select("price")
      .eq("ticker", ticker)
      .single();

    if (!currentPrice) {
      return NextResponse.json({ error: "Current price unavailable for this ticker." }, { status: 404 });
    }
    sellPrice = currentPrice.price;
    actualSellDate = new Date().toISOString().split("T")[0];
  }

  const buyPrice = buyData.close;
  const shares = amount / buyPrice;
  const currentValue = shares * sellPrice;
  const pnl = currentValue - amount;
  const pnlPct = ((sellPrice - buyPrice) / buyPrice) * 100;

  // S&P 500 comparison — use SPGI as proxy, or just skip if not available
  // We'll use the VOO/SPY equivalent. Since we don't have SPY in our DB,
  // we compare against the average S&P 100 performance via a simple message.
  let spyComparison: { pnlPct: number } | null = null;

  // Try to find SPY-like data (we don't have SPY, so skip comparison if unavailable)
  // For now, we'll note this in the response

  // Get chart data for the period
  const { data: chartData } = await supabase
    .from("price_history_long")
    .select("date, close")
    .eq("ticker", ticker)
    .gte("date", buyData.date)
    .lte("date", actualSellDate)
    .order("date", { ascending: true });

  // Save scenario if requested
  if (save) {
    await supabase.from("whatif_scenarios").insert({
      user_id: user.id,
      ticker,
      buy_date: buyData.date,
      sell_date: sellDate || null,
      amount_usd: amount,
    });
  }

  return NextResponse.json({
    ticker,
    buyDate: buyData.date,
    sellDate: sellDate ? actualSellDate : null,
    stillHolding: !sellDate,
    buyPrice,
    sellPrice,
    shares,
    investedAmount: amount,
    currentValue,
    pnl,
    pnlPct,
    spyComparison,
    chartData: (chartData ?? []).map((d: { date: string; close: number }) => ({
      date: d.date,
      price: d.close,
    })),
  });
}

// DELETE — remove a saved scenario
export async function DELETE(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await supabase
    .from("whatif_scenarios")
    .delete()
    .eq("id", parseInt(id))
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
