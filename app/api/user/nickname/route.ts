import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { nickname } = await request.json();

    if (!nickname || typeof nickname !== "string" || nickname.length < 3 || nickname.length > 20) {
      return NextResponse.json({ error: "Nickname must be between 3 and 20 characters." }, { status: 400 });
    }

    // Check last updated time
    const { data: account } = await supabase
      .from("paper_accounts")
      .select("nickname_updated_at")
      .eq("user_id", user.id)
      .single();

    if (account?.nickname_updated_at) {
      const lastUpdated = new Date(account.nickname_updated_at);
      const now = new Date();
      const diffDays = (now.getTime() - lastUpdated.getTime()) / (1000 * 3600 * 24);
      
      if (diffDays < 30) {
        return NextResponse.json({ 
          error: `You can only change your nickname once every 30 days. Please wait ${Math.ceil(30 - diffDays)} more days.` 
        }, { status: 429 });
      }
    }

    // Update nickname
    const { error } = await supabase
      .from("paper_accounts")
      .update({ 
        nickname: nickname.trim(),
        nickname_updated_at: new Date().toISOString()
      })
      .eq("user_id", user.id);

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        return NextResponse.json({ error: "This nickname is already taken." }, { status: 409 });
      }
      console.error(error);
      return NextResponse.json({ error: "Failed to update nickname." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, nickname: nickname.trim() });
    
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
