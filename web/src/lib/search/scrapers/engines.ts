import {
  domainKey,
  fetchSearchHtml,
  normalizeUrl,
  stripTags,
  type ScrapedResult,
} from "./fetch-html";

const ENGINE_ROTATION = ["google", "bing", "duckduckgo"] as const;
export type ScraperEngine = (typeof ENGINE_ROTATION)[number];

const ENGINE_PAGE_LIMIT = 50;

function dedupeResults(results: ScrapedResult[]): ScrapedResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = domainKey(r.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function scrapeDuckDuckGo(
  query: string,
  limit = ENGINE_PAGE_LIMIT
): Promise<ScrapedResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchSearchHtml(url);
  const results: ScrapedResult[] = [];

  const linkRegex =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null && results.length < limit) {
    const rawHref = match[1];
    const href = rawHref.includes("uddg=")
      ? decodeURIComponent(rawHref.match(/uddg=([^&]+)/)?.[1] ?? rawHref)
      : rawHref;
    const normalized = normalizeUrl(href);
    const title = stripTags(match[2]);
    if (normalized && title.length > 2) {
      results.push({ title, url: normalized, engine: "duckduckgo" });
    }
  }

  return dedupeResults(results);
}

export async function scrapeBing(
  query: string,
  limit = ENGINE_PAGE_LIMIT,
  offset = 0
): Promise<ScrapedResult[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&cc=gb&setlang=en&count=${Math.min(limit, 50)}&first=${offset + 1}`;
  const html = await fetchSearchHtml(url);
  const results: ScrapedResult[] = [];

  const blockRegex = /<li class="b_algo"[\s\S]*?<\/li>/gi;
  let block: RegExpExecArray | null;
  while ((block = blockRegex.exec(html)) !== null && results.length < limit) {
    const chunk = block[0];
    const linkMatch = chunk.match(
      /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
    );
    if (!linkMatch) continue;
    const normalized = normalizeUrl(linkMatch[1]);
    const title = stripTags(linkMatch[2]);
    const snippetMatch = chunk.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = snippetMatch ? stripTags(snippetMatch[1]) : undefined;
    if (normalized && title.length > 2) {
      results.push({ title, url: normalized, snippet, engine: "bing" });
    }
  }

  return dedupeResults(results);
}

export async function scrapeGoogle(
  query: string,
  limit = ENGINE_PAGE_LIMIT,
  start = 0
): Promise<ScrapedResult[]> {
  const num = Math.min(limit, 50);
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=uk&num=${num}&start=${start}`;
  const html = await fetchSearchHtml(url);
  const results: ScrapedResult[] = [];

  const linkRegex =
    /<a[^>]*href="(\/url\?q=([^"&]+)[^"]*|https?:\/\/[^"]+)"[^>]*><h3[^>]*>([\s\S]*?)<\/h3><\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null && results.length < limit) {
    const raw = match[2] ? decodeURIComponent(match[2]) : match[1];
    const normalized = normalizeUrl(raw);
    const title = stripTags(match[3]);
    if (
      normalized &&
      title.length > 2 &&
      !normalized.includes("google.com") &&
      !normalized.includes("youtube.com")
    ) {
      results.push({ title, url: normalized, engine: "google-search" });
    }
  }

  return dedupeResults(results);
}

export { scrapeWithRotation } from "./autonomous-pipeline";

/** @deprecated Use runAutonomousPipeline */
export async function scrapeAllEngines(
  keyword: string,
  location: string
): Promise<{ results: ScrapedResult[]; enginesUsed: string[] }> {
  const { scrapeWithRotation } = await import("./autonomous-pipeline");
  const r = await scrapeWithRotation(keyword, location, 0);
  return { results: r.results, enginesUsed: r.enginesUsed };
}