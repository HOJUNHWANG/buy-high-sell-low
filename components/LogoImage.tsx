"use client";

import Image from "next/image";
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

  return (
    <Image
      src={src}
      alt={ticker}
      width={width}
      height={height}
      className={className}
      onError={() => setError(true)}
    />
  );
}
