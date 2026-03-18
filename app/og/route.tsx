import { ImageResponse } from "next/og";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker") ?? "";

  // Fetch font
  const fontData = await fetch(
    new URL("/fonts/Inter-Regular.ttf", request.url)
  ).then((r) => r.arrayBuffer());

  let name = ticker;
  let price = "N/A";
  let changePct = "";

  if (ticker) {
    try {
      const supabase = await createSupabaseServerClient();
      const [{ data: stock }, { data: priceData }] = await Promise.all([
        supabase.from("stocks").select("name").eq("ticker", ticker).single(),
        supabase.from("stock_prices").select("price, change_pct").eq("ticker", ticker).single(),
      ]);
      if (stock) name = stock.name;
      if (priceData) {
        price = `$${priceData.price.toFixed(2)}`;
        if (priceData.change_pct !== null) {
          const sign = priceData.change_pct >= 0 ? "+" : "";
          changePct = `${sign}${priceData.change_pct.toFixed(2)}%`;
        }
      }
    } catch {}
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#111827",
          display: "flex",
          flexDirection: "column",
          padding: "60px",
          fontFamily: "Inter",
        }}
      >
        <div style={{ color: "#6b7280", fontSize: 20 }}>GlobalStock</div>
        <div style={{ color: "#ffffff", fontSize: 48, fontWeight: 700, marginTop: 16 }}>
          {name}
        </div>
        <div style={{ color: "#9ca3af", fontSize: 28 }}>{ticker}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 24 }}>
          <div style={{ color: "#ffffff", fontSize: 56, fontWeight: 700 }}>{price}</div>
          <div
            style={{
              color: changePct.startsWith("-") ? "#f87171" : "#34d399",
              fontSize: 32,
            }}
          >
            {changePct}
          </div>
        </div>
        <div style={{ color: "#6b7280", fontSize: 18, marginTop: "auto" }}>
          Not investment advice.
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: "Inter", data: fontData, style: "normal" }],
    }
  );
}
