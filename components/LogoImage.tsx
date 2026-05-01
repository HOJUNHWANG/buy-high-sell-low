"use client";

import { useState } from "react";

interface LogoImageProps {
  src: string;
  ticker: string;
  width: number;
  height: number;
  className?: string;
  fallbackClassName?: string;
  fallbackStyle?: React.CSSProperties;
  fallbackTextSize?: string;
  sizes?: string;
}

export function LogoImage({
  src,
  ticker,
  width,
  height,
  className,
  fallbackClassName,
  fallbackStyle,
  fallbackTextSize = "text-[9px]",
}: LogoImageProps) {
  const [error, setError] = useState(false);

  const label = ticker.endsWith("-USD") ? ticker.replace("-USD", "") : ticker;

  if (error) {
    return (
      <div
        className={
          fallbackClassName ??
          `flex items-center justify-center ${fallbackTextSize} font-bold shrink-0 rounded`
        }
        style={
          fallbackStyle ?? {
            width,
            height,
            background: "var(--surface-3)",
            color: "var(--text-2)",
          }
        }
      >
        {label[0]}
      </div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={ticker}
      width={width}
      height={height}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => setError(true)}
    />
  );
}
