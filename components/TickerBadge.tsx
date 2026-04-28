import Link from "next/link";
import { LogoImage } from "./LogoImage";

interface TickerBadgeProps {
  ticker: string;
  logoUrl?: string | null;
}

export function TickerBadge({ ticker, logoUrl }: TickerBadgeProps) {
  const label = ticker.endsWith("-USD") ? ticker.replace("-USD", "") : ticker;

  return (
    <Link
      href={`/stock/${ticker}`}
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 transition-opacity hover:opacity-80"
      style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
    >
      {logoUrl ? (
        <LogoImage
          src={logoUrl}
          ticker={ticker}
          width={12}
          height={12}
          className="rounded-sm object-contain"
          fallbackClassName="inline-flex items-center justify-center w-3 h-3 rounded-sm text-[7px] font-bold leading-none shrink-0"
          fallbackStyle={{ background: "var(--accent)", color: "var(--surface)" }}
          fallbackTextSize="text-[7px]"
        />
      ) : (
        <span
          className="inline-flex items-center justify-center w-3 h-3 rounded-sm text-[7px] font-bold leading-none"
          style={{ background: "var(--accent)", color: "var(--surface)" }}
        >
          {label.charAt(0)}
        </span>
      )}
      {label}
    </Link>
  );
}
