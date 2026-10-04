export function PaperTradeBanner() {
  return (
    <div
      className="paper-trade-banner rounded-lg px-4 py-2 text-xs font-semibold text-center tracking-wide"
      style={{
        background: "var(--warn-dim)",
        border: "1px solid color-mix(in srgb, var(--warn) 25%, transparent)",
        color: "var(--warn)",
      }}
    >
      SIMULATED TRADING &mdash; NOT REAL MONEY
    </div>
  );
}
