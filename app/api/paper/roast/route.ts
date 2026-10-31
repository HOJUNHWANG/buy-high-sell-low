import { runPaperAction } from "@/lib/paper-actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatAssetPrice } from "@/lib/price-format";
import {
  getGroqCompletionSettings,
  getGroqJsonResponseFormat,
} from "@/lib/groq";
import { isDustPosition } from "@/lib/paper-trading";
import { NextResponse } from "next/server";
import Groq from "groq-sdk";


const PORTFOLIO_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    grade: { type: "string" },
    nickname: { type: "string" },
    summary: { type: "string" },
    strengths: {
      type: "array",
      items: { type: "string" },
    },
    risks: {
      type: "array",
      items: { type: "string" },
    },
    suggestion: { type: "string" },
  },
  required: [
    "grade",
    "nickname",
    "summary",
    "strengths",
    "risks",
    "suggestion",
  ],
  additionalProperties: false,
};

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const claim = await runPaperAction(user.id, "claim_roast");
  if (claim.response) return claim.response;

  // Fetch portfolio data
  const { data: account } = await supabase
    .from("paper_accounts")
    .select("cash_balance")
    .eq("user_id", user.id)
    .single();

  const { data: positions } = await supabase
    .from("paper_positions")
    .select("ticker, shares, avg_cost, side, borrowed")
    .eq("user_id", user.id);

  const tickers = (positions ?? []).map((p: { ticker: string }) => p.ticker);
  let prices: Record<string, number> = {};
  if (tickers.length > 0) {
    const { data: priceData } = await supabase
      .from("stock_prices")
      .select("ticker, price")
      .in("ticker", tickers);
    prices = Object.fromEntries((priceData ?? []).map((p: { ticker: string; price: number }) => [p.ticker, p.price]));
  }

  const cashBalance = account?.cash_balance ?? 1000;
  const activePositions = (positions ?? []).filter(
    (p: { ticker: string; shares: number; avg_cost: number }) =>
      !isDustPosition(p.shares, prices[p.ticker] ?? p.avg_cost)
  );
  const equity = (p: { ticker: string; shares: number; avg_cost: number; side?: string; borrowed?: number }) => {
    const price = prices[p.ticker] ?? p.avg_cost;
    return p.side === "short" ? p.shares * p.avg_cost - (p.borrowed ?? 0) + (p.avg_cost - price) * p.shares : p.shares * price - (p.borrowed ?? 0);
  };
  const holdingsStr = activePositions.map((p: { ticker: string; shares: number; avg_cost: number; side?: string; borrowed?: number }) => {
    const current = prices[p.ticker] ?? p.avg_cost;
    const pnl = ((current - p.avg_cost) / p.avg_cost * 100 * (p.side === "short" ? -1 : 1)).toFixed(1);
    return `${p.ticker} ${p.side ?? "long"}, debt $${p.borrowed ?? 0}, equity $${equity(p).toFixed(2)}: ${p.shares.toFixed(2)} shares @ ${formatAssetPrice(p.avg_cost, p.ticker)} avg, now ${formatAssetPrice(current, p.ticker)} (${Number(pnl) >= 0 ? "+" : ""}${pnl}%)`;
  }).join("\n");

  const totalValue = cashBalance + activePositions.reduce((sum: number, p: { ticker: string; shares: number; avg_cost: number; side?: string; borrowed?: number }) => sum + equity(p), 0);
  const returnPct = ((totalValue - 1000) / 1000 * 100).toFixed(2);

  const prompt = `You are an experienced portfolio analyst reviewing a paper trading portfolio. Give an honest, insightful analysis. Be direct and specific.

Portfolio (started with $1,000):
- Cash: $${cashBalance.toFixed(2)}
${holdingsStr ? `- Holdings:\n${holdingsStr}` : "- No holdings (all cash)"}
- Total Value: $${totalValue.toFixed(2)}
- Game balance growth (includes check-in rewards and adjustments; not an investment return): ${Number(returnPct) >= 0 ? "+" : ""}${returnPct}%

Output JSON only:
{
  "grade": "letter grade A+ to F describing portfolio risk structure; performance attribution is unavailable",
  "nickname": "a short trader archetype label (e.g. 'The Contrarian', 'Diamond Hands')",
  "summary": "2-3 sentence honest assessment of the overall portfolio strategy and performance",
  "strengths": ["specific strength 1", "specific strength 2"],
  "risks": ["specific risk or weakness 1", "specific risk or weakness 2"],
  "suggestion": "one concrete, actionable improvement for this portfolio"
}`;

  let result;
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const msg = await groq.chat.completions.create({
      ...getGroqCompletionSettings(),
      max_completion_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
      response_format: getGroqJsonResponseFormat(
        "portfolio_analysis",
        PORTFOLIO_ANALYSIS_SCHEMA
      ),
    });
    result = JSON.parse(msg.choices[0].message.content ?? "{}");
  } catch {
    await runPaperAction(user.id, "refund_roast");
    return NextResponse.json({ error: "AI roast generation failed" }, { status: 500 });
  }

  return NextResponse.json({
    roast: result.roast ?? result.summary ?? "",
    grade: result.grade ?? "?",
    nickname: result.nickname ?? "The Unknown Trader",
    summary: result.summary ?? "Unable to generate analysis.",
    strengths: result.strengths ?? [],
    risks: result.risks ?? [],
    suggestion: result.suggestion ?? "",
  });
}
