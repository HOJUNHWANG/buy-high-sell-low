const DEFAULT_SITE_URL = "https://global-stock-navy.vercel.app";

function normalizeSiteUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

export const SITE_URL =
  normalizeSiteUrl(process.env.NEXT_PUBLIC_APP_URL) ??
  normalizeSiteUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
  DEFAULT_SITE_URL;
