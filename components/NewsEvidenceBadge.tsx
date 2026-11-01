import type { NewsArticle } from "@/lib/types";
export function NewsEvidenceBadge({ article }: { article: NewsArticle }) {
  const label = article.summary_method === "verified_ai" ? "Source checked"
    : article.summary_method === "source_excerpt" ? "Source excerpt"
    : article.summary_method === "headline_only" ? "Headline only" : "Summary unavailable";
  return <span className="text-[10px] rounded px-1.5 py-0.5" style={{ color: "var(--text-2)", background: "var(--surface-3)" }}
    title={article.source_coverage === "full_text" ? "Article text checked" : article.source_coverage === "lead" ? "Article introduction available" : article.summary_method === "headline_only" ? "Full article text was unavailable" : "No source-checked summary is available"}>{label}</span>;
}
