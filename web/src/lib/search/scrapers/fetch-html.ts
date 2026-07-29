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

interface FetchSearchHtmlOptions {
  timeoutMs?: number;
  maxLength?: number;
  isUrlAllowed?: (url: string) => boolean;
}

export async function fetchSearchHtml(
  url: string,
  options: FetchSearchHtmlOptions = {}
): Promise<string> {
  const timeoutMs = Math.min(
    15_000,
    Math.max(1_000, options.timeoutMs ?? 10_000)
  );
  const maxLength = Math.min(
    2_000_000,
    Math.max(10_000, options.maxLength ?? 1_000_000)
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let currentUrl = url;
    for (let redirectCount = 0; redirectCount <= 3; redirectCount++) {
      if (options.isUrlAllowed && !options.isUrlAllowed(currentUrl)) {
        throw new Error("Scraper bloqueou um destino não permitido");
      }

      const res = await fetch(currentUrl, {
        headers: {
          "User-Agent": SCRAPER_UA,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-GB,en;q=0.9",
          "Cache-Control": "no-cache",
        },
        next: { revalidate: 0 },
        redirect: options.isUrlAllowed ? "manual" : "follow",
        signal: controller.signal,
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location || redirectCount === 3) {
          throw new Error("Scraper recebeu redirecionamento inválido");
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!res.ok) {
        throw new Error(`Scraper HTTP ${res.status}`);
      }

      const contentType = res.headers.get("content-type");
      if (
        contentType &&
        !contentType.includes("text/html") &&
        !contentType.includes("application/xhtml+xml") &&
        !contentType.includes("text/plain")
      ) {
        throw new Error(`Scraper content-type não suportado: ${contentType}`);
      }

      return (await res.text()).slice(0, maxLength);
    }

    throw new Error("Scraper excedeu o limite de redirecionamentos");
  } finally {
    clearTimeout(timeout);
  }
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
