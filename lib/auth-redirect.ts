/** Allow only a same-origin absolute path, including its query and fragment. */
export function safeAuthNext(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://bhsl.invalid");
    if (url.origin !== "https://bhsl.invalid" || url.pathname.startsWith("/auth/login") || url.pathname.startsWith("/auth/callback")) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}
export function loginHref(path: string) { return `/auth/login?next=${encodeURIComponent(safeAuthNext(path))}`; }
