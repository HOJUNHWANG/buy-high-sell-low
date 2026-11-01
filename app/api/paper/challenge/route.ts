import { createSupabaseServerClient } from "@/lib/supabase/server";
import { paperActionResponse } from "@/lib/paper-actions";
import { getPaperChallenge } from "@/lib/paper-challenge";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return getPaperChallenge(user.id, supabase);
}
export function POST(request: Request) { return paperActionResponse("challenge_submit", request); }
