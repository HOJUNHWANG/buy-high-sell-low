import { ImageResponse } from "next/og";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user") ?? "";

  // Temporary: Disable custom font loading to prevent Edge Function crashes
  // causing ERR_CONNECTION_RESET. Falling back to default system fonts.

  let totalValue = "$1,000.00";
  let returnPct = "0.00%";
  let isUp = true;
  let positionCount = 0;
  let topHoldings: string[] = [];

  if (userId) {
    try {
      const supabase = await createSupabaseServerClient();

      const { data: account } = await supabase
        .from("paper_accounts")
        .select("cash_balance")
        .eq("user_id", userId)
        .single();

      const { data: positions } = await supabase
        .from("paper_positions")
        .select("ticker, shares")
        .eq("user_id", userId);

      const tickers = (positions ?? []).map((p: { ticker: string }) => p.ticker);
      let posValue = 0;

      if (tickers.length > 0) {
        const { data: prices } = await supabase
          .from("stock_prices")
          .select("ticker, price")
          .in("ticker", tickers);
        const priceMap = Object.fromEntries(
          (prices ?? []).map((p: { ticker: string; price: number }) => [p.ticker, p.price])
        );
        posValue = (positions ?? []).reduce(
          (s: number, p: { ticker: string; shares: number }) => s + p.shares * (priceMap[p.ticker] ?? 0), 0
        );
        topHoldings = tickers.slice(0, 4);
      }

      const total = (account?.cash_balance ?? 1000) + posValue;
      const ret = ((total - 1000) / 1000) * 100;
      totalValue = `$${total.toFixed(2)}`;
      returnPct = `${ret >= 0 ? "+" : ""}${ret.toFixed(2)}%`;
      isUp = ret >= 0;
      positionCount = tickers.length;
    } catch {
      // fallback defaults
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #080808 0%, #1a1a2e 100%)",
          fontFamily: "Inter",
          color: "#f0f0f0",
          padding: 60,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 18, color: "#7c6cfc", fontWeight: 700 }}>
            Buy High Sell Low
          </div>
          <div style={{ fontSize: 14, color: "#888", fontWeight: 400 }}>
            Paper Trading
          </div>
        </div>

        <div style={{ fontSize: 64, fontWeight: 800, marginBottom: 8 }}>
          {totalValue}
        </div>

        <div style={{
          fontSize: 28,
          fontWeight: 700,
          color: isUp ? "#4ade80" : "#f87171",
          marginBottom: 24,
        }}>
          {returnPct}
        </div>

        <div style={{ display: "flex", gap: 24, fontSize: 14, color: "#888" }}>
          <span>{positionCount} positions</span>
          {topHoldings.length > 0 && <span>{topHoldings.join(", ")}</span>}
        </div>

        <div style={{ fontSize: 11, color: "#444", marginTop: 32 }}>
          SIMULATED TRADING - NOT REAL MONEY
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
