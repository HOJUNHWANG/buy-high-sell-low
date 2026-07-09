type FictionalTickerMarkProps = {
  ticker: string;
  color: string;
  accent: string;
  size?: "sm" | "md" | "lg";
};

const sizeClass = {
  sm: "w-8 h-8 text-[9px]",
  md: "w-10 h-10 text-[10px]",
  lg: "w-14 h-14 text-xs",
};

export function FictionalTickerMark({ ticker, color, accent, size = "md" }: FictionalTickerMarkProps) {
  const shortTicker = ticker.length > 4 ? ticker.slice(0, 4) : ticker;

  return (
    <div
      className={`${sizeClass[size]} shrink-0 rounded-lg grid place-items-center font-black tracking-wide relative overflow-hidden`}
      style={{
        color: "#fff",
        background: `linear-gradient(135deg, ${color}, ${accent})`,
        border: "1px solid rgba(255,255,255,0.16)",
        boxShadow: `0 0 0 1px rgba(255,255,255,0.03), 0 10px 24px ${color}22`,
      }}
      aria-label={`${ticker} ticker mark`}
    >
      <span
        className="absolute inset-x-0 top-0 h-1/2"
        style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.24), transparent)" }}
      />
      <span
        className="absolute -right-3 -bottom-3 w-7 h-7 rounded-full"
        style={{ background: "rgba(255,255,255,0.16)" }}
      />
      <span className="relative">{shortTicker}</span>
    </div>
  );
}
