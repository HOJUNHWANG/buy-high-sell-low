import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getPriceFreshness } from "@/lib/price-freshness";
import { NextResponse } from "next/server";

type Action = "claim_roast" | "refund_roast" | "init" | "buy" | "short" | "sell" | "cover" | "checkin" | "nickname"
  | "claim_reward" | "challenge_submit" | "challenge_create" | "admin_adjust" | "admin_revive" | "liquidation";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUSINESS_ERRORS: Record<string, number> = {
  P0400: 400, P0403: 403, P0404: 404, P0409: 409, P0429: 429, P0503: 503,
};

export async function runPaperAction(userId: string, action: Action, payload: Record<string, unknown> = {}, requestId?: string | null) {
  const { data, error } = await createSupabaseAdmin().rpc("execute_paper_action", {
    p_user_id: userId, p_action: action, p_payload: payload, p_request_id: requestId ?? null,
  });
  if (error) {
    const status = BUSINESS_ERRORS[error.code] ?? (error.code === "23505" ? 409
      : ["22P02", "22003"].includes(error.code) ? 400
      : ["55P03", "57014", "40P01"].includes(error.code) ? 503 : 500);
    if (status >= 500) console.error("Paper action failed", { action, code: error.code });
    return { data: null, response: NextResponse.json({ error: BUSINESS_ERRORS[error.code] ? error.message
      : status === 409 ? "This value is already in use."
      : status === 400 ? "Invalid action payload" : "Unable to complete this action. Please retry." }, { status }) };
  }
  return { data, response: null };
}

/** Fixed server action; the owner always comes from the verified session. */
export async function paperActionResponse(action: Action, request?: Request, options: { admin?: boolean; emptyBody?: boolean } = {}) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (options.admin && (!process.env.ADMIN_EMAIL || user?.email !== process.env.ADMIN_EMAIL)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    let body: Record<string, unknown> = {};
    if (request && !options.emptyBody) {
      try {
        const parsed = await request.json();
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object required");
        body = parsed;
      } catch { return NextResponse.json({ error: "Invalid JSON object" }, { status: 400 }); }
    }
    const requestId = request?.headers.get("Idempotency-Key");
    if (requestId && !UUID.test(requestId)) return NextResponse.json({ error: "Invalid idempotency key" }, { status: 400 });
    if (action === "liquidation") {
      const { data: positions, error: positionError } = await supabase.from("paper_positions").select("ticker").eq("user_id", user.id);
      if (positionError) return NextResponse.json({ error: "Unable to check positions" }, { status: 503 });
      if (positions?.length) {
        const { data: quotes, error: quoteError } = await supabase.from("stock_prices").select("ticker,price,fetched_at,provider_session_date").in("ticker", positions.map(p => p.ticker));
        if (quoteError || positions.some(p => !quotes?.some(q => q.ticker === p.ticker && q.price > 0 && ["live", "settled"].includes(getPriceFreshness(q.fetched_at,q.ticker,new Date(),undefined,q.provider_session_date).state)))) {
          return NextResponse.json({ status: "price_unavailable", message: "Liquidation check is waiting for fresh quotes." }, { headers: { "Cache-Control": "no-store" } });
        }
      }
    }
    if (["buy", "short", "sell", "cover"].includes(action)) {
      if (typeof body.ticker !== "string" || !/^[A-Z0-9][A-Z0-9./-]{0,14}$/i.test(body.ticker.trim()) || typeof body.shares !== "number" || !Number.isFinite(body.shares) || body.shares <= 0) {
        return NextResponse.json({ error: "ticker and shares (> 0) are required" }, { status: 400 });
      }
      body = { ticker: body.ticker.trim().toUpperCase(), shares: body.shares, ...(body.leverage !== undefined ? { leverage: body.leverage } : {}) };
      const { data: quote, error } = await supabase.from("stock_prices").select("price, fetched_at, provider_session_date").eq("ticker", body.ticker).single();
      if (error || !quote || !(quote.price > 0)) return NextResponse.json({ error: "Price unavailable" }, { status: 404 });
      const freshness = getPriceFreshness(quote.fetched_at, body.ticker as string, new Date(), undefined, quote.provider_session_date);
      if (!["live", "settled"].includes(freshness.state)) {
        return NextResponse.json({ error: "Price update delayed. Please try again after quotes refresh." }, { status: 503 });
      }
      body.quote_fetched_at = quote.fetched_at;
    }
    const fixedAction = action === "challenge_submit" && body.action === "claim" ? "claim_reward" : action;
    const result = await runPaperAction(user.id, fixedAction, body, requestId);
    return result.response ?? NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to complete this action. Please retry." }, { status: 500 });
  }
}
