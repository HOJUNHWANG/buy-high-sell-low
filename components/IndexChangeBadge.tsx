import type { IndexNotice } from "@/lib/sp100-transition";

export function IndexChangeBadge({ notice }: { notice?: IndexNotice | null }) {
  if (!notice) return null;
  return (
    <span className="inline-block mt-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ color: notice.kind === "addition" ? "#7dd3fc" : "#fbbf24",
        background: notice.kind === "addition" ? "rgba(56,189,248,0.1)" : "rgba(251,191,36,0.1)" }}>
      {notice.label}
    </span>
  );
}
