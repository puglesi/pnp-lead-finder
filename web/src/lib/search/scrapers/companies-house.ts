import {
  fetchSearchHtml,
  normalizeUrl,
  stripTags,
  type ScrapedResult,
} from "./fetch-html";

export async function scrapeCompaniesHouse(
  keyword: string,
  location: string,
  limit = 40
): Promise<ScrapedResult[]> {
  const query = `${keyword} ${location}`;
  const url = `https://find-and-update.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(query)}`;
  const html = await fetchSearchHtml(url);
  const results: ScrapedResult[] = [];

  const rowRegex =
    /<h3[^>]*>\s*<a[^>]*href="(\/company\/[^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/gi;
  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(html)) !== null && results.length < limit) {
    const path = match[1];
    const title = stripTags(match[2]);
    if (title.length < 2) continue;

    const profileUrl = `https://find-and-update.company-information.service.gov.uk${path}`;
    const chunk = html.slice(match.index, match.index + 800);
    const metaMatch = chunk.match(
      /<p[^>]*class="[^"]*meta[^"]*"[^>]*>([\s\S]*?)<\/p>/i
    );
    const meta = metaMatch ? stripTags(metaMatch[1]) : undefined;

    results.push({
      title,
      url: profileUrl,
      snippet: meta,
      engine: "companies-house",
      address: meta?.includes(location) ? meta : `${location}, UK`,
    });
  }

  if (results.length === 0) {
    const altRegex =
      /<a[^>]*href="(https?:\/\/find-and-update\.company-information\.service\.gov\.uk\/company\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = altRegex.exec(html)) !== null && results.length < limit) {
      const normalized = normalizeUrl(match[1]);
      const title = stripTags(match[2]);
      if (!normalized || title.length < 2) continue;
      results.push({
        title,
        url: normalized,
        engine: "companies-house",
        address: `${location}, UK`,
      });
    }
  }

  return results;
}