"use client";
import Link from "next/link";
import { useState, type ComponentProps } from "react";

/** Dense market tables should prefetch when a user approaches a link. */
export function IntentLink(props: ComponentProps<typeof Link>) {
  const [prefetch, setPrefetch] = useState<false | null>(false);
  return <Link {...props} prefetch={prefetch}
    onMouseEnter={event => { setPrefetch(null); props.onMouseEnter?.(event); }}
    onFocus={event => { setPrefetch(null); props.onFocus?.(event); }} />;
}
