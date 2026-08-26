import { runAutonomousPipeline } from "@/lib/search/scrapers/autonomous-pipeline";
import { enrichLeadsBatch } from "@/lib/search/scrapers/website-enricher";
import { capRealSearchResults, stampRealLeadOrigin } from "@/lib/search/real-search-guard";
import { discoveryMethodFromUrl } from "@/lib/lead-provenance";
import { classifyLocationMatch, extractUkPostcode } from "@/lib/location-match";
import type {
  AutonomousSourceId,
  AutonomousSourceStrategy,
} from "@/types/autonomous-sources";
import type { Lead } from "@/types/lead";
import type { SearchProvider } from "./types";
import type { ScrapedResult } from "@/lib/search/scrapers/fetch-html";

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
    emailSourceUrl?: string | null;
    emailDiscoveryMethod?: Lead["emailDiscoveryMethod"];
    phoneSourceUrl?: string | null;
  },
  keyword: string,
  location: string,
  index: number
): Lead {
  const foundAt = new Date().toISOString();
  const email = item.enrichedEmail ?? null;
  const scrapedPhone = item.enrichedPhone ?? item.phone ?? "";
  const phone = scrapedPhone && scrapedPhone !== "—" ? scrapedPhone : "";
  const address = item.address?.trim() || "";
  const postcode = extractUkPostcode(address);
  const emailSourceUrl = email
    ? item.emailSourceUrl ?? item.url
    : null;
  const phoneSourceUrl = phone
    ? item.phoneSourceUrl ?? (item.enrichedPhone ? item.url : item.url)
    : null;

  return stampRealLeadOrigin(
    {
      id: `auto-${item.engine}-${index}-${domainSlug(item.url)}`,
      company: item.title.slice(0, 120),
      website: item.url,
      email,
      phone,
      address,
      category: keyword,
      aiScore: scoreFromScrape(
        item.engine,
        index,
        Boolean(email),
        Boolean(phone),
        Boolean(item.enrichedEmail || item.enrichedPhone)
      ),
      emailIsGuessed: false,
      emailSourceUrl,
      emailDiscoveryMethod: email
        ? item.emailDiscoveryMethod ?? discoveryMethodFromUrl(emailSourceUrl ?? item.url)
        : null,
      emailSourceType: email
        ? item.emailDiscoveryMethod ?? discoveryMethodFromUrl(emailSourceUrl ?? item.url)
        : null,
      emailFoundAt: email ? foundAt : null,
      phoneSourceUrl,
      phoneFoundAt: phone ? foundAt : null,
      discoveredAddress: address || undefined,
      postcode,
      locationMatch: classifyLocationMatch({
        requestedLocation: location,
        address,
        postcode,
      }),
    },
    "autonomous",
    location
  );
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
      const enrichable = working.filter((item) => {
        const match = classifyLocationMatch({
          requestedLocation: location,
          address: item.address,
        });
        return match !== "outside_target";
      });
      const skipped = working.filter(
        (item) => !enrichable.some((candidate) => candidate.url === item.url)
      );
      const enriched = await enrichLeadsBatch(enrichable, {
        maxEnrich: enrichCap,
        delayMs: 400,
      });
      working = [...enriched, ...skipped];
    }

    const mapped: Lead[] = working.map((item, i) =>
      mapScrapedToLead(item, keyword, location, i)
    );
    const capped = capRealSearchResults(mapped, maxResults);

    const sourceTag =
      sourcesUsed.length > 0
        ? `autonomous-${primarySource}+${sourcesUsed.join("+")}${deepSearch ? "+deep" : ""}${autonomousEnrichWebsites !== false ? "+enriched" : ""}`
        : "autonomous-empty";

    return {
      leads: capped.leads,
      source: sourceTag,
      provider: "autonomous",
      isLive: sourcesUsed.length > 0,
      apiCallConsumed: false,
      requestedCount: capped.requestedCount,
      foundRealCount: capped.foundRealCount,
      sourceExhausted: capped.sourceExhausted,
    };
  },
};
