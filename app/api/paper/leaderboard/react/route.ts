import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const DAILY_LIMIT = 5;
const ALLOWED_EMOJIS = ["🔥", "💀", "🤡", "📈", "😂", "🫡"];

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

  const targetId = body.targetId as string | undefined;
  const emoji = body.emoji as string | undefined;
  const tab = body.tab as string | undefined;
  const action = body.action as string | undefined; // "add" or "remove"

  if (!targetId || !emoji || !tab) {
    return NextResponse.json({ error: "targetId, emoji, and tab are required" }, { status: 400 });
  }

  if (!["leaderboard", "graveyard"].includes(tab)) {
    return NextResponse.json({ error: "tab must be 'leaderboard' or 'graveyard'" }, { status: 400 });
  }

  if (!ALLOWED_EMOJIS.includes(emoji)) {
    return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });
  }

  // Can't react to own entry
  if (targetId === user.id) {
    return NextResponse.json({ error: "Can't react to your own entry" }, { status: 400 });
  }

  if (action === "remove") {
    await supabase
      .from("leaderboard_reactions")
      .delete()
      .eq("user_id", user.id)
      .eq("target_id", targetId)
      .eq("tab", tab)
      .eq("emoji", emoji);

    return NextResponse.json({ ok: true, action: "removed" });
  }

  // Rate limit: 5 per day per tab
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("leaderboard_reactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("tab", tab)
    .gte("created_at", todayStart.toISOString());

  if ((count ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json({
      error: `Daily limit reached (${DAILY_LIMIT} reactions per day on ${tab})`,
    }, { status: 429 });
  }

  // Insert (unique constraint prevents duplicate emoji on same target)
  const { error } = await supabase
    .from("leaderboard_reactions")
    .insert({
      user_id: user.id,
      target_id: targetId,
      tab,
      emoji,
    });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already reacted with this emoji" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to add reaction" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, action: "added" });
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const url = new URL(request.url);
  const targets = url.searchParams.get("targets")?.split(",").filter(Boolean) ?? [];
  const tab = url.searchParams.get("tab") ?? "leaderboard";

  if (targets.length === 0) {
    return NextResponse.json({ reactions: {}, myReactions: {}, remaining: DAILY_LIMIT });
  }

  // Get all reactions for these targets
  const { data: reactions } = await supabase
    .from("leaderboard_reactions")
    .select("target_id, emoji, user_id")
    .in("target_id", targets)
    .eq("tab", tab);

  // Aggregate: { targetId: { emoji: count } }
  const aggregated: Record<string, Record<string, number>> = {};
  const myReactions: Record<string, string[]> = {};

  for (const r of (reactions ?? []) as { target_id: string; emoji: string; user_id: string }[]) {
    if (!aggregated[r.target_id]) aggregated[r.target_id] = {};
    aggregated[r.target_id][r.emoji] = (aggregated[r.target_id][r.emoji] ?? 0) + 1;

    if (user && r.user_id === user.id) {
      if (!myReactions[r.target_id]) myReactions[r.target_id] = [];
      myReactions[r.target_id].push(r.emoji);
    }
  }

  // Calculate remaining today
  let remaining = DAILY_LIMIT;
  if (user) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("leaderboard_reactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("tab", tab)
      .gte("created_at", todayStart.toISOString());
    remaining = Math.max(0, DAILY_LIMIT - (count ?? 0));
  }

  return NextResponse.json({ reactions: aggregated, myReactions, remaining });
}
