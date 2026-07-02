import {
  fetchSearchHtml,
  normalizeUrl,
  stripTags,
  type ScrapedResult,
  type ScraperEngineId,
} from "./fetch-html";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function dedupe(results: ScrapedResult[]): ScrapedResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.title.toLowerCase()}|${r.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pushResult(
  results: ScrapedResult[],
  limit: number,
  item: Omit<ScrapedResult, "engine"> & { engine: ScraperEngineId }
): void {
  if (results.length >= limit || item.title.length < 2) return;
  results.push(item);
}

function extractAnchors(
  html: string,
  pattern: RegExp,
  engine: ScraperEngineId,
  location: string,
  limit: number,
  results: ScrapedResult[],
  baseUrl?: string
): void {
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null && results.length < limit) {
    const href = match[1];
    const title = stripTags(match[2]);
    const url =
      normalizeUrl(href) ??
      (href.startsWith("/") && baseUrl ? `${baseUrl}${href}` : null);
    if (!url || title.length < 2) continue;
    if (
      url.includes("/search") ||
      url.includes("/login") ||
      url.includes("/register")
    ) {
      continue;
    }
    pushResult(results, limit, {
      title,
      url,
      engine,
      address: `${location}, UK`,
    });
  }
}

export async function scrapeYell(
  keyword: string,
  location: string,
  limit = 40,
  page = 1
): Promise<ScrapedResult[]> {
  const url = `https://www.yell.com/search?keywords=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}&pageNum=${page}`;
  const html = await fetchSearchHtml(url);
  const results: ScrapedResult[] = [];

  extractAnchors(
    html,
    /<a[^>]*href="(\/biz\/[^"]+|https?:\/\/www\.yell\.com\/biz\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    "yell",
    location,
    limit,
    results,
    "https://www.yell.com"
  );

  if (results.length < limit) {
    extractAnchors(
      html,
      /<h\d[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      "yell",
      location,
      limit,
      results,
      "https://www.yell.com"
    );
  }

  return dedupe(results).slice(0, limit);
}

export async function scrape192(
  keyword: string,
  location: string,
  limit = 40,
  page = 1
): Promise<ScrapedResult[]> {
  const url = `https://www.192.com/businesses/search/?search=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}&page=${page}`;
  const html = await fetchSearchHtml(url);
  const results: ScrapedResult[] = [];

  extractAnchors(
    html,
    /<a[^>]*href="(\/businesses\/[^"]+|https?:\/\/www\.192\.com\/businesses\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    "192-com",
    location,
    limit,
    results,
    "https://www.192.com"
  );

  if (results.length < limit) {
    extractAnchors(
      html,
      /<h\d[^>]*class="[^"]*business[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      "192-com",
      location,
      limit,
      results,
      "https://www.192.com"
    );
  }

  return dedupe(results).slice(0, limit);
}

export async function scrapeThomsonLocal(
  keyword: string,
  location: string,
  limit = 40,
  page = 1
): Promise<ScrapedResult[]> {
  const kw = slugify(keyword);
  const loc = slugify(location);
  const url =
    page > 1
      ? `https://www.thomsonlocal.com/search/${kw}/${loc}?page=${page}`
      : `https://www.thomsonlocal.com/search/${kw}/${loc}`;
  const html = await fetchSearchHtml(url);
  const results: ScrapedResult[] = [];

  extractAnchors(
    html,
    /<a[^>]*href="(\/[^"]+\/[^"]+|https?:\/\/www\.thomsonlocal\.com\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    "thomson-local",
    location,
    limit,
    results,
    "https://www.thomsonlocal.com"
  );

  return dedupe(
    results.filter(
      (r) =>
        !r.url.includes("/search/") &&
        !r.url.endsWith("thomsonlocal.com/") &&
        r.url.split("/").length > 4
    )
  ).slice(0, limit);
}

export async function scrapeFreeIndex(
  keyword: string,
  location: string,
  limit = 40,
  page = 1
): Promise<ScrapedResult[]> {
  const url = `https://www.freeindex.co.uk/search.htm?searchword=${encodeURIComponent(keyword)}&locationsearch=${encodeURIComponent(location)}&page=${page}`;
  const html = await fetchSearchHtml(url);
  const results: ScrapedResult[] = [];

  extractAnchors(
    html,
    /<a[^>]*href="(https?:\/\/www\.freeindex\.co\.uk\/profile[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    "freeindex",
    location,
    limit,
    results
  );

  if (results.length < limit) {
    extractAnchors(
      html,
      /<h\d[^>]*>\s*<a[^>]*href="(\/profile[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      "freeindex",
      location,
      limit,
      results,
      "https://www.freeindex.co.uk"
    );
  }

  return dedupe(results).slice(0, limit);
}

export async function scrapeCylex(
  keyword: string,
  location: string,
  limit = 40,
  page = 1
): Promise<ScrapedResult[]> {
  const url = `https://www.cylex-uk.co.uk/s?q=${encodeURIComponent(keyword)}&l=${encodeURIComponent(location)}&p=${page}`;
  const html = await fetchSearchHtml(url);
  const results: ScrapedResult[] = [];

  extractAnchors(
    html,
    /<a[^>]*href="(https?:\/\/www\.cylex-uk\.co\.uk\/company\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    "cylex-uk",
    location,
    limit,
    results
  );

  if (results.length < limit) {
    extractAnchors(
      html,
      /<a[^>]*href="(\/company\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      "cylex-uk",
      location,
      limit,
      results,
      "https://www.cylex-uk.co.uk"
    );
  }

  return dedupe(results).slice(0, limit);
}

export async function scrapeTouchLocal(
  keyword: string,
  location: string,
  limit = 40,
  page = 1
): Promise<ScrapedResult[]> {
  const url = `https://www.touchlocal.com/search.htm?what=${encodeURIComponent(keyword)}&where=${encodeURIComponent(location)}&page=${page}`;
  const html = await fetchSearchHtml(url);
  const results: ScrapedResult[] = [];

  extractAnchors(
    html,
    /<a[^>]*href="(https?:\/\/www\.touchlocal\.com\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    "touchlocal",
    location,
    limit,
    results
  );

  return dedupe(
    results.filter(
      (r) =>
        !r.url.includes("/search") &&
        !r.url.includes("/login") &&
        (r.url.includes("/business/") ||
          r.url.includes("/listing/") ||
          r.url.split("/").length > 5)
    )
  ).slice(0, limit);
}

async function scrapeDirectoryVolume(
  scrapePage: (
    keyword: string,
    location: string,
    limit: number,
    page: number
  ) => Promise<ScrapedResult[]>,
  keyword: string,
  location: string,
  needed: number,
  deep: boolean
): Promise<ScrapedResult[]> {
  const collected: ScrapedResult[] = [];
  const pageSize = 30;
  const maxPages = deep ? 4 : 2;

  for (let page = 1; page <= maxPages && collected.length < needed; page++) {
    const batch = await scrapePage(
      keyword,
      location,
      Math.min(pageSize, needed - collected.length),
      page
    );
    if (batch.length === 0) break;
    collected.push(...batch);
    if (batch.length < pageSize) break;
    await new Promise((r) => setTimeout(r, 450));
  }

  return collected.slice(0, needed);
}

export const scrapeYellVolume = (
  keyword: string,
  location: string,
  needed: number,
  deep = false
) => scrapeDirectoryVolume(scrapeYell, keyword, location, needed, deep);

export const scrape192Volume = (
  keyword: string,
  location: string,
  needed: number,
  deep = false
) => scrapeDirectoryVolume(scrape192, keyword, location, needed, deep);

export const scrapeThomsonLocalVolume = (
  keyword: string,
  location: string,
  needed: number,
  deep = false
) => scrapeDirectoryVolume(scrapeThomsonLocal, keyword, location, needed, deep);

export const scrapeFreeIndexVolume = (
  keyword: string,
  location: string,
  needed: number,
  deep = false
) => scrapeDirectoryVolume(scrapeFreeIndex, keyword, location, needed, deep);

export const scrapeCylexVolume = (
  keyword: string,
  location: string,
  needed: number,
  deep = false
) => scrapeDirectoryVolume(scrapeCylex, keyword, location, needed, deep);

export const scrapeTouchLocalVolume = (
  keyword: string,
  location: string,
  needed: number,
  deep = false
) => scrapeDirectoryVolume(scrapeTouchLocal, keyword, location, needed, deep);