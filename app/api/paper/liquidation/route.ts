import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET — Check liquidation status and enforce margin call / forced liquidation.
 *
 * Portfolio < $100: WARNING
 * Portfolio < $50:  MARGIN CALL (24h timer)
 * After 24h still < $50: LIQUIDATED — all positions sold, balance zeroed.
 *
 * After liquidation:
 * - 1st time in month: can revive with $500 (via /api/paper/revive)
 * - 2nd time in same month: suspended until next month (auto-restart with $1,000)
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: account } = await supabase
    .from("paper_accounts")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!account) return NextResponse.json({ status: "no_account" });

  // Check if suspended and if suspension has expired
  if (account.status === "suspended" && account.suspended_until) {
    const now = new Date();
    const suspendedUntil = new Date(account.suspended_until);
    if (now >= suspendedUntil) {
      // Auto-restart: reset account
      await supabase.from("paper_positions").delete().eq("user_id", user.id);
      await supabase.from("paper_accounts").update({
        cash_balance: 1000,
        status: "active",
        margin_call_at: null,
        suspended_until: null,
        streak: 0,
      }).eq("user_id", user.id);

      // Phoenix badge
      await supabase.from("paper_achievements").upsert(
        { user_id: user.id, badge_key: "phoenix" },
        { onConflict: "user_id,badge_key" }
      );

      return NextResponse.json({
        status: "restarted",
        message: "Your suspension has ended. Welcome back with $1,000!",
        cashBalance: 1000,
      });
    }
    return NextResponse.json({
      status: "suspended",
      suspendedUntil: account.suspended_until,
      message: `Account suspended until ${account.suspended_until}. You'll restart with $1,000.`,
    });
  }

  if (account.status === "liquidated") {
    // Check if eligible for revive
    const now = new Date();
    const lastLiquidation = account.last_liquidation_at ? new Date(account.last_liquidation_at) : null;
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const liqMonth = lastLiquidation
      ? `${lastLiquidation.getFullYear()}-${String(lastLiquidation.getMonth() + 1).padStart(2, "0")}`
      : null;

    // Count liquidations this month
    const liquidationsThisMonth = liqMonth === thisMonth ? account.liquidation_count : 0;

    return NextResponse.json({
      status: "liquidated",
      canRevive: liquidationsThisMonth < 2,
      liquidationCount: account.liquidation_count,
      message: liquidationsThisMonth >= 2
        ? "You've been liquidated twice this month. Suspended until next month."
        : "You've been liquidated. You can revive once with $500.",
    });
  }

  // Calculate portfolio value
  const { data: positions } = await supabase
    .from("paper_positions")
    .select("ticker, shares")
    .eq("user_id", user.id);

  const tickers = (positions ?? []).map((p: { ticker: string }) => p.ticker);
  let positionValue = 0;
  if (tickers.length > 0) {
    const { data: priceData } = await supabase
      .from("stock_prices")
      .select("ticker, price")
      .in("ticker", tickers);
    const prices = Object.fromEntries(
      (priceData ?? []).map((p: { ticker: string; price: number }) => [p.ticker, p.price])
    );
    positionValue = (positions ?? []).reduce(
      (sum: number, p: { ticker: string; shares: number }) => sum + p.shares * (prices[p.ticker] ?? 0),
      0
    );
  }

  const totalValue = account.cash_balance + positionValue;

  // Check liquidation thresholds
  if (totalValue < 50) {
    if (account.status === "margin_call" && account.margin_call_at) {
      const elapsed = Date.now() - new Date(account.margin_call_at).getTime();
      if (elapsed >= 24 * 60 * 60 * 1000) {
        // FORCE LIQUIDATE
        // Sell all positions
        if (tickers.length > 0) {
          const { data: priceData } = await supabase
            .from("stock_prices")
            .select("ticker, price")
            .in("ticker", tickers);
          const prices = Object.fromEntries(
            (priceData ?? []).map((p: { ticker: string; price: number }) => [p.ticker, p.price])
          );

          let totalProceeds = 0;
          for (const pos of (positions ?? [])) {
            const price = prices[(pos as { ticker: string }).ticker] ?? 0;
            const proceeds = (pos as { shares: number }).shares * price;
            totalProceeds += proceeds;

            await supabase.from("paper_transactions").insert({
              user_id: user.id,
              ticker: (pos as { ticker: string }).ticker,
              side: "sell",
              shares: (pos as { shares: number }).shares,
              price,
              total: proceeds,
            });
          }

          await supabase.from("paper_positions").delete().eq("user_id", user.id);
        }

        const newLiqCount = account.liquidation_count + 1;
        const now = new Date();
        const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const lastLiqMonth = account.last_liquidation_at
          ? (() => { const d = new Date(account.last_liquidation_at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })()
          : null;
        const liqThisMonth = lastLiqMonth === thisMonth ? newLiqCount : 1;

        // If 2nd liquidation this month → suspend until next month
        let newStatus: string = "liquidated";
        let suspendedUntil: string | null = null;

        if (liqThisMonth >= 2) {
          newStatus = "suspended";
          const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          suspendedUntil = nextMonth.toISOString().split("T")[0];
        }

        await supabase.from("paper_accounts").update({
          cash_balance: 0,
          status: newStatus,
          margin_call_at: null,
          liquidation_count: newLiqCount,
          last_liquidation_at: now.toISOString(),
          suspended_until: suspendedUntil,
        }).eq("user_id", user.id);

        // Liquidated badge
        await supabase.from("paper_achievements").upsert(
          { user_id: user.id, badge_key: "liquidated" },
          { onConflict: "user_id,badge_key" }
        );

        if (newLiqCount >= 3) {
          await supabase.from("paper_achievements").upsert(
            { user_id: user.id, badge_key: "cockroach" },
            { onConflict: "user_id,badge_key" }
          );
        }

        return NextResponse.json({
          status: newStatus === "suspended" ? "suspended" : "liquidated",
          message: newStatus === "suspended"
            ? `Liquidated twice this month. Suspended until ${suspendedUntil}. You'll restart with $1,000.`
            : "Your portfolio has been liquidated. All positions sold.",
          canRevive: newStatus !== "suspended",
          suspendedUntil,
          liquidationCount: newLiqCount,
        });
      }

      // Still within 24h margin call window
      const hoursLeft = Math.max(0, 24 - elapsed / (60 * 60 * 1000));
      return NextResponse.json({
        status: "margin_call",
        totalValue,
        hoursLeft: Math.round(hoursLeft * 10) / 10,
        message: `MARGIN CALL: Portfolio at $${totalValue.toFixed(2)}. ${hoursLeft.toFixed(1)} hours to recover above $50.`,
      });
    }

    // Start margin call
    await supabase.from("paper_accounts").update({
      status: "margin_call",
      margin_call_at: new Date().toISOString(),
    }).eq("user_id", user.id);

    return NextResponse.json({
      status: "margin_call",
      totalValue,
      hoursLeft: 24,
      message: `MARGIN CALL: Portfolio at $${totalValue.toFixed(2)}. You have 24 hours to recover above $50.`,
    });
  }

  // Clear margin call if recovered
  if (account.status === "margin_call" && totalValue >= 50) {
    await supabase.from("paper_accounts").update({
      status: "active",
      margin_call_at: null,
    }).eq("user_id", user.id);
  }

  // Warning threshold
  if (totalValue < 100) {
    return NextResponse.json({
      status: "warning",
      totalValue,
      message: `WARNING: Portfolio at $${totalValue.toFixed(2)}. Below $50 triggers margin call.`,
    });
  }

  return NextResponse.json({ status: "ok", totalValue });
}
