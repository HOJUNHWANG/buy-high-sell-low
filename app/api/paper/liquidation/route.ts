import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
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

  // Calculate portfolio value (accounting for both long and short positions)
  const { data: positions } = await supabase
    .from("paper_positions")
    .select("ticker, shares, side, avg_cost, borrowed")
    .eq("user_id", user.id);

  const tickers = [...new Set((positions ?? []).map((p: { ticker: string }) => p.ticker))];
  let positionEquity = 0;
  if (tickers.length > 0) {
    const { data: priceData } = await supabase
      .from("stock_prices")
      .select("ticker, price")
      .in("ticker", tickers);
    const prices = Object.fromEntries(
      (priceData ?? []).map((p: { ticker: string; price: number }) => [p.ticker, p.price])
    );
    for (const pos of (positions ?? []) as { ticker: string; shares: number; side?: string; avg_cost: number; borrowed?: number }[]) {
      const curPrice = prices[pos.ticker] ?? 0;
      const borrowed = pos.borrowed ?? 0;
      if (pos.side === "short") {
        const marginUsed = pos.shares * pos.avg_cost - borrowed;
        const pnl = (pos.avg_cost - curPrice) * pos.shares;
        positionEquity += marginUsed + pnl;
      } else {
        positionEquity += pos.shares * curPrice - borrowed;
      }
    }
  }

  const totalValue = account.cash_balance + positionEquity;

  // Check liquidation thresholds
  if (totalValue < 50) {
    if (account.status === "margin_call" && account.margin_call_at) {
      const elapsed = Date.now() - new Date(account.margin_call_at).getTime();
      if (elapsed >= 24 * 60 * 60 * 1000) {
        // FORCE LIQUIDATE
        // Close all positions (sell longs, cover shorts)
        let prices: Record<string, number> = {};
        if (tickers.length > 0) {
          const { data: priceData } = await supabase
            .from("stock_prices")
            .select("ticker, price")
            .in("ticker", tickers);
          prices = Object.fromEntries(
            (priceData ?? []).map((p: { ticker: string; price: number }) => [p.ticker, p.price])
          );

          for (const pos of (positions ?? []) as { ticker: string; shares: number; side?: string; avg_cost: number; borrowed?: number }[]) {
            const price = prices[pos.ticker] ?? 0;
            const isShort = pos.side === "short";
            const txSide = isShort ? "cover" : "sell";
            const borrowed = pos.borrowed ?? 0;

            let proceeds: number;
            if (isShort) {
              // Cover: return margin + pnl
              const marginUsed = pos.shares * pos.avg_cost - borrowed;
              const pnl = (pos.avg_cost - price) * pos.shares;
              proceeds = marginUsed + pnl;
            } else {
              proceeds = pos.shares * price - borrowed;
            }

            await supabase.from("paper_transactions").insert({
              user_id: user.id,
              ticker: pos.ticker,
              side: txSide,
              shares: pos.shares,
              price,
              total: proceeds,
            });
          }

          await supabase.from("paper_positions").delete().eq("user_id", user.id);
        }

        // Snapshot portfolio to graveyard (even if no positions)
        const admin = createSupabaseAdmin();
        const now2 = new Date();
        const month = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, "0")}`;
        const positionsSnapshot = (positions ?? []).map(
          (pos: { ticker: string; shares: number; side?: string; avg_cost: number; borrowed?: number }) => {
            const curPrice = prices[pos.ticker] ?? 0;
            const borrowed = pos.borrowed ?? 0;
            const marketValue = pos.shares * curPrice;
            const equity = pos.side === "short"
              ? (pos.shares * pos.avg_cost - borrowed) + (pos.avg_cost - curPrice) * pos.shares
              : marketValue - borrowed;
            const effectiveLeverage = borrowed > 0 && equity > 0
              ? Math.round((marketValue / equity) * 10) / 10 : 1;
            return {
              ticker: pos.ticker,
              shares: pos.shares,
              avg_cost: pos.avg_cost,
              side: pos.side ?? "long",
              leverage: effectiveLeverage,
              borrowed,
            };
          }
        );
        await admin.from("paper_graveyard").insert({
          user_id: user.id,
          final_value: totalValue,
          cash_at_death: account.cash_balance,
          positions_json: positionsSnapshot,
          liquidated_at: now2.toISOString(),
          month,
        });

        // Liquidation = immediately suspended until next month. No revive.
        const newLiqCount = account.liquidation_count + 1;
        const nextMonth = new Date(now2.getFullYear(), now2.getMonth() + 1, 1);
        const suspendedUntil = nextMonth.toISOString().split("T")[0];

        // Keep whatever cash remains (check-in rewards preserved)
        await supabase.from("paper_accounts").update({
          status: "suspended",
          margin_call_at: null,
          liquidation_count: newLiqCount,
          last_liquidation_at: now2.toISOString(),
          suspended_until: suspendedUntil,
        }).eq("user_id", user.id);


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
