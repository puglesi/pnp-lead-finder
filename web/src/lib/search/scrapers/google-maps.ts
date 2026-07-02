import {
  fetchSearchHtml,
  normalizeUrl,
  stripTags,
  type ScrapedResult,
} from "./fetch-html";

function dedupe(results: ScrapedResult[]): ScrapedResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.title.toLowerCase()}|${r.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function scrapeGoogleMaps(
  keyword: string,
  location: string,
  limit = 60,
  start = 0
): Promise<ScrapedResult[]> {
  const query = `${keyword} ${location} UK`;
  const url = `https://www.google.com/search?tbm=lcl&q=${encodeURIComponent(query)}&hl=en&gl=uk&start=${start}`;
  const html = await fetchSearchHtml(url);
  const results: ScrapedResult[] = [];

  const blockRegex =
    /<div[^>]*class="[^"]*(?:VkpGBb|rllt__details|dbg0pd)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  let block: RegExpExecArray | null;
  while ((block = blockRegex.exec(html)) !== null && results.length < limit) {
    const chunk = block[0];
    const titleMatch =
      chunk.match(/<span[^>]*class="[^"]*OSrXXb[^"]*"[^>]*>([\s\S]*?)<\/span>/i) ??
      chunk.match(/<div[^>]*class="[^"]*dbg0pd[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (!titleMatch) continue;
    const title = stripTags(titleMatch[1]);
    if (title.length < 2) continue;

    const siteMatch = chunk.match(/href="(https?:\/\/[^"]+)"/i);
    const website = siteMatch ? normalizeUrl(siteMatch[1]) : null;
    const phoneMatch = chunk.match(
      /(?:data-phone-number|aria-label)="([^"]*\d{5,}[^"]*)"/i
    );
    const snippet = phoneMatch ? stripTags(phoneMatch[1]) : undefined;

    results.push({
      title,
      url:
        website ??
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${title} ${location}`)}`,
      snippet,
      engine: "google-maps",
      phone: snippet?.match(/[\d\s+()-]{10,}/)?.[0]?.trim(),
      address: `${location}, UK`,
    });
  }

  if (results.length < limit) {
    const fallbackRegex =
      /<a[^>]*href="(\/maps\/place\/[^"]+|https:\/\/www\.google\.com\/maps\/place\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while (
      (match = fallbackRegex.exec(html)) !== null &&
      results.length < limit
    ) {
      const href = match[1].startsWith("/")
        ? `https://www.google.com${match[1]}`
        : match[1];
      const title = stripTags(match[2]);
      if (title.length < 2) continue;
      results.push({
        title,
        url: href,
        engine: "google-maps",
        address: `${location}, UK`,
      });
    }
  }

  return dedupe(results).slice(0, limit);
}

export async function scrapeGoogleMapsVolume(
  keyword: string,
  location: string,
  needed: number,
  deep = false
): Promise<ScrapedResult[]> {
  const collected: ScrapedResult[] = [];
  const pageSize = 40;
  const maxPages = deep ? 6 : 3;

  for (let page = 0; page < maxPages && collected.length < needed; page++) {
    const batch = await scrapeGoogleMaps(
      keyword,
      location,
      Math.min(pageSize, needed - collected.length),
      page * pageSize
    );
    if (batch.length === 0) break;
    collected.push(...batch);
    if (batch.length < pageSize) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  return collected.slice(0, needed);
}