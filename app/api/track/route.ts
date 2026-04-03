import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { path } = await request.json() as { path?: string };
    if (!path) return NextResponse.json({ ok: false });

    const supabase = await createSupabaseServerClient();
    await supabase.from("page_views").insert({ path });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
