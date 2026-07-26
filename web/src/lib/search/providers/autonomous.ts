import { generateLeadsForSearch } from "@/lib/mock-data";
import { runAutonomousPipeline } from "@/lib/search/scrapers/autonomous-pipeline";
import type { ScrapedResult } from "@/lib/search/scrapers/fetch-html";
import { enrichLeadsBatch } from "@/lib/search/scrapers/website-enricher";
import type {
  AutonomousSourceId,
  AutonomousSourceStrategy,
} from "@/types/autonomous-sources";
import type { Lead } from "@/types/lead";
import type { SearchProvider } from "./types";

function guessEmail(website: string): string | null {
  try {
    const host = new URL(website).hostname.replace(/^www\./, "");
    const prefixes = ["info", "contact", "hello", "enquiries"];
    const prefix = prefixes[host.length % prefixes.length];
    return `${prefix}@${host}`;
  } catch {
    return null;
  }
}

function scoreFromScrape(
  engine: string,
  index: number,
  hasEmail: boolean,
  hasPhone: boolean,
  enriched: boolean
): number {
  const base =
    engine === "google-maps"
      ? 78
      : engine === "yell"
        ? 76
        : engine === "companies-house"
          ? 74
          : engine === "google" || engine === "google-search"
            ? 72
            : engine === "192-com" || engine === "thomson-local"
              ? 71
              : engine === "freeindex" ||
                  engine === "cylex-uk" ||
                  engine === "touchlocal"
                ? 70
                : engine === "bing"
                  ? 68
                  : 65;
  const variance = (index * 3) % 9;
  let score = base + variance - Math.floor(index / 8);
  if (hasEmail) score += 8;
  if (hasPhone) score += 5;
  if (enriched) score += 4;
  if (!hasEmail) score -= 4;
  return Math.min(92, Math.max(52, score));
}

function mapScrapedToLead(
  item: ScrapedResult & {
    enrichedEmail?: string | null;
    enrichedPhone?: string | null;
  },
  keyword: string,
  location: string,
  index: number
): Lead {
  const email =
    item.enrichedEmail ?? guessEmail(item.url);
  const phone = item.enrichedPhone ?? item.phone ?? "—";
  const enriched = Boolean(item.enrichedEmail || item.enrichedPhone);

  return {
    id: `auto-${item.engine}-${index}-${domainSlug(item.url)}`,
    company: item.title.slice(0, 120),
    website: item.url,
    email,
    phone,
    address: item.address ?? item.snippet ?? `${location}, UK`,
    category: keyword,
    aiScore: scoreFromScrape(
      item.engine,
      index,
      Boolean(email),
      phone !== "—",
      enriched
    ),
  };
}

function domainSlug(url: string): string {
  try {
    return new URL(url).hostname.replace(/\W/g, "-").slice(0, 24);
  } catch {
    return `r${indexHash(url)}`;
  }
}

function indexHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function padWithFallback(
  keyword: string,
  location: string,
  existing: Lead[],
  maxResults: number
): Lead[] {
  const padCount = maxResults - existing.length;
  if (padCount <= 0) return existing;

  const mockPad = generateLeadsForSearch(
    keyword,
    location,
    padCount,
    existing.length
  ).map((lead) => ({
    ...lead,
    id: `auto-sup-${lead.id}`,
    aiScore: Math.min(62, Math.max(45, lead.aiScore - 18)),
  }));

  return [...existing, ...mockPad].slice(0, maxResults);
}

export const autonomousProvider: SearchProvider = {
  name: "autonomous",
  async search({
    keyword,
    location,
    maxResults,
    delayMs,
    sectorIndex = 0,
    autonomousSources,
    autonomousSourceStrategy,
    autonomousSingleSource,
    autonomousEnrichWebsites,
    useMaxLeads,
  }) {
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }

    const sources = (autonomousSources?.length
      ? autonomousSources
      : ["google-maps", "yell", "companies-house"]) as AutonomousSourceId[];
    const strategy = (autonomousSourceStrategy ??
      "rotate") as AutonomousSourceStrategy;
    const deepSearch = Boolean(useMaxLeads) || maxResults >= 400;

    const { results: scraped, sourcesUsed, primarySource } =
      await runAutonomousPipeline({
        keyword,
        location,
        sectorIndex,
        maxResults,
        sources,
        strategy,
        singleSource: autonomousSingleSource,
        deepSearch,
      });

    let working = scraped.slice(0, maxResults);

    if (autonomousEnrichWebsites !== false && working.length > 0) {
      const enrichCap = deepSearch ? 60 : 35;
      working = await enrichLeadsBatch(working, {
        maxEnrich: enrichCap,
        delayMs: 400,
      });
    }

    const leads: Lead[] = working.map((item, i) =>
      mapScrapedToLead(item, keyword, location, i)
    );

    const sourceTag =
      sourcesUsed.length > 0
        ? `autonomous-${primarySource}+${sourcesUsed.join("+")}${deepSearch ? "+deep" : ""}${autonomousEnrichWebsites !== false ? "+enriched" : ""}`
        : "autonomous-offline-fallback";

    if (leads.length >= maxResults * 0.6) {
      return {
        leads: leads.slice(0, maxResults),
        source: sourceTag,
        provider: "autonomous",
        isLive: sourcesUsed.length > 0,
        apiCallConsumed: false,
      };
    }

    const combined = padWithFallback(keyword, location, leads, maxResults);

    return {
      leads: combined,
      source: sourcesUsed.length > 0 ? `${sourceTag}+supplemented` : sourceTag,
      provider: "autonomous",
      isLive: sourcesUsed.length > 0,
      apiCallConsumed: false,
    };
  },
};