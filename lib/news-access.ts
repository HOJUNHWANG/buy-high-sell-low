import "server-only";
import { cache } from "react";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { FREE_USER_DAILY_UNLOCKS, type UserTier } from "@/lib/summary-gate";

/** Request-scoped access checks. Neither profiles nor unlocks are shared. */
export const getNewsAccess = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return { user, tier: "guest" as UserTier, unlockedIds: new Set<number>(), remainingUnlocks: 0 };
  const supabase = await createSupabaseServerClient();
  const [profile, unlocks] = await Promise.all([
    supabase.from("user_profiles").select("tier").eq("user_id", user.id).single(),
    supabase.from("summary_unlocks").select("article_id,unlocked_at").eq("user_id", user.id),
  ]);
  const tier = (profile.data?.tier as UserTier) ?? "free";
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayCount = (unlocks.data ?? []).filter(row => Date.parse(row.unlocked_at) >= todayStart.getTime()).length;
  return { user, tier, unlockedIds: new Set<number>((unlocks.data ?? []).map(row => row.article_id)),
    remainingUnlocks: tier === "free" ? Math.max(0, FREE_USER_DAILY_UNLOCKS - todayCount) : 0 };
});
