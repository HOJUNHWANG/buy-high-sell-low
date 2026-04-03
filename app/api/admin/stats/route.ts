import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const ADMIN_EMAIL = "adind96@gmail.com";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    totalViewsRes,
    views30dRes,
    usersRes,
  ] = await Promise.all([
    // Total page views
    admin.from("page_views").select("id", { count: "exact", head: true }),
    // Last 30 days page views
    admin.from("page_views").select("id", { count: "exact", head: true }).gte("visited_at", since30d),
    // All users (for total + 30d count)
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const totalViews = totalViewsRes.count ?? 0;
  const views30d   = views30dRes.count ?? 0;

  const allUsers   = usersRes.data?.users ?? [];
  const totalUsers = allUsers.length;
  const users30d   = allUsers.filter(u => u.created_at && u.created_at >= since30d).length;

  return NextResponse.json({ totalViews, views30d, totalUsers, users30d });
}
