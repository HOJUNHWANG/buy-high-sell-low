import { cache } from "react";
import { unstable_cache } from "next/cache";

/** Share public reads within a time window, but await fresh data in the next one. */
export function cachePublicData<Args extends unknown[], Result>(
  load: (...args: Args) => Promise<Result>,
  keyParts: string[],
  options: { revalidate: number; tags: string[] },
) {
  const readWindow = unstable_cache(async (window: number, ...args: Args) => {
    // The window is part of Next's cache key; it must not affect the DB query.
    void window;
    return load(...args);
  }, keyParts, options);

  // A fixed key with a TTL serves stale data to the first request after expiry.
  // A new time-window key instead blocks on that window's first database read.
  return cache((...args: Args) =>
    readWindow(Math.floor(Date.now() / (options.revalidate * 1000)), ...args));
}
