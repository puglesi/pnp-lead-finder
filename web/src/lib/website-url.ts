const EMPTY_WEBSITE_LABEL = "—";
const MAX_FALLBACK_LENGTH = 48;

export interface SafeWebsite {
  displayHostname: string;
  href: string | null;
}

function shortSafeFallback(value: string): string {
  const compact = value.trim().replace(/\s+/g, " ");
  if (!compact) return EMPTY_WEBSITE_LABEL;
  return compact.length <= MAX_FALLBACK_LENGTH
    ? compact
    : `${compact.slice(0, MAX_FALLBACK_LENGTH - 1)}…`;
}

function hasUsableHostname(hostname: string): boolean {
  if (!hostname) return false;
  if (hostname === "localhost") return true;
  if (hostname.startsWith("[") && hostname.endsWith("]")) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return true;
  return hostname.includes(".");
}

export function resolveSafeWebsite(
  website: string | null | undefined
): SafeWebsite {
  if (typeof website !== "string") {
    return { displayHostname: EMPTY_WEBSITE_LABEL, href: null };
  }
  const original = website.trim();
  if (!original) {
    return { displayHostname: EMPTY_WEBSITE_LABEL, href: null };
  }

  try {
    const hasProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(original);
    const url = new URL(hasProtocol ? original : `https://${original}`);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !hasUsableHostname(url.hostname)
    ) {
      return {
        displayHostname: shortSafeFallback(original),
        href: null,
      };
    }
    return {
      displayHostname: url.hostname.replace(/^www\./i, ""),
      href: url.toString(),
    };
  } catch {
    return {
      displayHostname: shortSafeFallback(original),
      href: null,
    };
  }
}

export function safeWebsiteHostname(
  website: string | null | undefined
): string {
  return resolveSafeWebsite(website).displayHostname;
}
