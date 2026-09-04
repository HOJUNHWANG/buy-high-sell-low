import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { parseFictionalOrder } from "@/lib/fictional-paper";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to trade Fictional stocks." }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const order = parseFictionalOrder(await request.json().catch(() => null));
  if (!order) return NextResponse.json({ error: "Choose a Fictional stock and enter a valid order." }, { status: 400 });

  // Only this authenticated server route can invoke the atomic ledger operation.
  // Price and user ID are never accepted from the order payload.
  const { data, error } = await createSupabaseAdmin().rpc("execute_fictional_paper_trade", {
    p_user_id: user.id, p_ticker: order.ticker, p_side: order.side,
    p_unit: order.unit, p_amount: order.amount, p_request_id: order.requestId,
  });
  if (error) {
    const statuses: Record<string, number> = { PT400: 400, PT404: 404, PT409: 409, PT503: 503 };
    const status = statuses[error.code] ?? 500;
    return NextResponse.json({ error: status === 500 ? "Trade could not be confirmed. Retry the same order." : error.message, code: error.code }, { status });
  }
  return NextResponse.json({ ok: true, trade: data }, { headers: { "Cache-Control": "no-store" } });
}
