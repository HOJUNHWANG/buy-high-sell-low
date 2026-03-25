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
      // Auto-restart: top up to $1,000 if below (check-in cash preserved)
      const currentCash = account.cash_balance ?? 0;
      const newBalance = currentCash < 1000 ? 1000 : currentCash;
      const added = newBalance - currentCash;
      await supabase.from("paper_positions").delete().eq("user_id", user.id);
      await supabase.from("paper_accounts").update({
        cash_balance: newBalance,
        status: "active",
        margin_call_at: null,
        suspended_until: null,
      }).eq("user_id", user.id);

      // Phoenix badge
      await supabase.from("paper_achievements").upsert(
        { user_id: user.id, badge_key: "phoenix" },
        { onConflict: "user_id,badge_key" }
      );

      return NextResponse.json({
        status: "restarted",
        message: added > 0
          ? `Suspension ended. Topped up +$${added.toFixed(0)} to $1,000!`
          : `Suspension ended. You already have $${newBalance.toFixed(2)} — no top-up needed.`,
        cashBalance: newBalance,
      });
    }
    return NextResponse.json({
      status: "suspended",
      suspendedUntil: account.suspended_until,
      cashBalance: account.cash_balance,
      message: `Account suspended until ${account.suspended_until}. Daily check-ins still earn cash! Balance topped up to $1,000 on revival.`,
    });
  }

  if (account.status === "liquidated" || account.status === "suspended") {
    // Liquidation = suspended until next month. No revive option.
    return NextResponse.json({
      status: "suspended",
      suspendedUntil: account.suspended_until,
      cashBalance: account.cash_balance,
      message: `Liquidated. Suspended until ${account.suspended_until ?? "next month"}. Daily check-ins still earn cash!`,
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

        // Liquidation = immediately suspended until next month. No revive.
        const newLiqCount = account.liquidation_count + 1;
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const suspendedUntil = nextMonth.toISOString().split("T")[0];

        // Keep whatever cash remains (check-in rewards preserved)
        await supabase.from("paper_accounts").update({
          status: "suspended",
          margin_call_at: null,
          liquidation_count: newLiqCount,
          last_liquidation_at: now.toISOString(),
          suspended_until: suspendedUntil,
        }).eq("user_id", user.id);

        // Badges
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
          status: "suspended",
          suspendedUntil,
          cashBalance: account.cash_balance,
          liquidationCount: newLiqCount,
          message: `Liquidated. Suspended until ${suspendedUntil}. Check in daily to earn cash before revival!`,
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
