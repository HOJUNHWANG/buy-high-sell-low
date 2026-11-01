import type { NewsArticle } from "@/lib/types";

export function NewsSummaryUnavailable({ article }: { article: NewsArticle }) {
  return (
    <div className="rounded-lg px-3 py-2 text-xs space-y-1.5"
      style={{ background: "var(--surface-2)", border: "1px dashed var(--border-md)", color: "var(--text-2)" }}>
      <p>{article.summary_method === "headline_only"
        ? "Full article text was unavailable, so no source-checked summary is shown."
        : "A source-checked summary is unavailable for this article."}</p>
      <a href={article.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
        Read original article
      </a>
    </div>
  );
}
