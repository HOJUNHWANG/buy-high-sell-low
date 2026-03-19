export function Disclaimer() {
  return (
    <footer
      className="px-5 pt-8 pb-6"
      style={{ borderTop: "1px solid var(--border)", color: "var(--text-3)" }}
    >
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Investment disclaimer */}
        <p
          className="text-[11px] leading-relaxed max-w-3xl mx-auto text-center"
          style={{ color: "var(--text-3)" }}
        >
          <strong style={{ color: "var(--text-2)" }}>Investment Risk Disclaimer:</strong>{" "}
          All content on GlobalStock is for informational and educational purposes only and does
          not constitute financial, investment, tax, or legal advice. Past performance is not
          indicative of future results. Stock prices and market data may be delayed. Always
          conduct your own research and consult a qualified financial advisor before making any
          investment decisions.
        </p>

        {/* Affiliate disclosure */}
        <p className="text-[10px] text-center" style={{ color: "var(--text-3)" }}>
          <strong style={{ color: "var(--text-3)" }}>Affiliate Disclosure:</strong>{" "}
          Some links on this site are affiliate or sponsored links. We may earn a commission
          at no extra cost to you. This does not influence our content.
        </p>

        {/* AI disclaimer */}
        <p className="text-[10px] text-center" style={{ color: "var(--text-3)" }}>
          AI-generated summaries are produced by Anthropic Claude and are provided for
          convenience only. They may contain errors and should not be relied upon as factual
          analysis.
        </p>

        {/* Links row */}
        <div
          className="flex items-center justify-center gap-4 pt-1 flex-wrap"
          style={{ fontSize: "11px" }}
        >
          <a href="/privacy" className="nav-link">Privacy Policy</a>
          <span style={{ color: "var(--border-md)" }}>·</span>
          <a href="/terms" className="nav-link">Terms of Use</a>
          <span style={{ color: "var(--border-md)" }}>·</span>
          <span>© {new Date().getFullYear()} GlobalStock. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
