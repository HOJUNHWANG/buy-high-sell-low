import type { NewsArticle } from "@/lib/types";
export function NewsEvidenceBadge({ article }: { article: NewsArticle }) {
  const label = article.summary_method === "verified_ai" ? "Source checked"
    : article.summary_method === "source_excerpt" ? "Source excerpt" : "Headline only";
  return <span className="text-[10px] rounded px-1.5 py-0.5" style={{ color: "var(--text-2)", background: "var(--surface-3)" }}
    title={article.source_coverage === "full_text" ? "Article text checked" : article.source_coverage === "lead" ? "Article introduction available" : "Full article text was unavailable"}>{label}</span>;
}
