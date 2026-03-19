import { MetadataRoute } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createSupabaseServerClient();
  const { data: stocks } = await supabase
    .from("stocks")
    .select("ticker, updated_at");

  const stockRoutes = (stocks ?? []).map((s) => ({
    url: `https://global-stock-navy.vercel.app/stock/${s.ticker}`,
    lastModified: new Date(s.updated_at),
    changeFrequency: "hourly" as const,
    priority: 0.8,
  }));

  return [
    {
      url: "https://global-stock-navy.vercel.app",
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: "https://global-stock-navy.vercel.app/news",
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.7,
    },
    {
      url: "https://global-stock-navy.vercel.app/privacy",
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    ...stockRoutes,
  ];
}
