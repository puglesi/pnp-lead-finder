const SCRAPER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export type ScraperEngineId =
  | "duckduckgo"
  | "bing"
  | "google"
  | "google-search"
  | "google-maps"
  | "companies-house"
  | "yell"
  | "192-com"
  | "thomson-local"
  | "freeindex"
  | "cylex-uk"
  | "touchlocal";

export interface ScrapedResult {
  title: string;
  url: string;
  snippet?: string;
  engine: ScraperEngineId;
  phone?: string;
  address?: string;
}

export async function fetchSearchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": SCRAPER_UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-GB,en;q=0.9",
      "Cache-Control": "no-cache",
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`Scraper HTTP ${res.status}`);
  }

  return res.text();
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

export function normalizeUrl(href: string): string | null {
  try {
    if (href.startsWith("//")) return `https:${href}`;
    if (href.startsWith("/")) return null;
    const url = new URL(href);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function domainKey(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}