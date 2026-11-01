import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Cookie-free, anonymous reads only. Never use for account data. */
export function createPublicMarketClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}
