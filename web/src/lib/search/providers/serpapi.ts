import { getSerpApiKey, isSerpApiCreditError } from "@/lib/search/config";
import {
  getSerpApiPagesPerSector,
  SERPAPI_PAGE_SIZE,
} from "@/lib/search/volume";
import { stampRealLeadOrigin } from "@/lib/search/real-search-guard";
import { extractUkPostcode, classifyLocationMatch } from "@/lib/location-match";
import { buildProviderLocationQuery, resolveGeoRegion } from "@/lib/geo/regions";
import { parsePublishedPhone } from "@/lib/uk-phone";
import {
  collectUntilTarget,
  isInsideSearchTarget,
  selectOperationalSearchLeads,
  sortByLocationMatch,
} from "@/lib/search/targeted-search";
import type { Lead } from "@/types/lead";
import type { SearchProvider, SearchProviderResult } from "./types";

interface SerpPlace {
  title?: string;
  website?: string;
  address?: string;
  phone?: string;
  type?: string;
  types?: string[];
  rating?: number;
  reviews?: number;
  place_id?: string;
  gps_coordinates?: {
    latitude?: number;
    longitude?: number;
  };
}

function scoreFromRating(rating?: number, reviews?: number): number {
  const base = rating ? Math.round(rating * 18) : 65;
  const reviewBoost =
    reviews && reviews > 50 ? 8 : reviews && reviews > 10 ? 4 : 0;
  return Math.min(99, Math.max(55, base + reviewBoost));
}

export function buildSerpApiMapsQuery(
  keyword: string,
  location: string
): { q: string; ll?: string } {
  return buildProviderLocationQuery(keyword, location);
}

function mapPlaceToLead(
  place: SerpPlace,
  keyword: string,
  location: string,
  index: number
): Lead {
  const website =
    place.website ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.title ?? keyword)}`;
  const address = place.address?.trim() || "";
  const parsedPhone = parsePublishedPhone(place.phone, "serp_result");
  const postcode = extractUkPostcode(address);
  const foundAt = new Date().toISOString();
  const latitude = place.gps_coordinates?.latitude;
  const longitude = place.gps_coordinates?.longitude;
  const region = resolveGeoRegion(location);

  return stampRealLeadOrigin(
    {
      id: `serp-${place.place_id ?? `${keyword}-${index}`}`,
      company: place.title ?? `Business ${index + 1}`,
      website,
      email: null,
      phone: parsedPhone?.phone ?? "",
      address,
      category: place.types?.[0] ?? place.type ?? keyword,
      aiScore: scoreFromRating(place.rating, place.reviews),
      emailIsGuessed: false,
      phoneSourceUrl: parsedPhone ? website : null,
      phoneFoundAt: parsedPhone ? foundAt : null,
      phoneRaw: parsedPhone?.phoneRaw ?? null,
      phoneDiscoveryMethod: parsedPhone?.discoveryMethod ?? null,
      phoneConfidence: parsedPhone?.confidence ?? null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      discoveredAddress: address || undefined,
      postcode,
      locationMatch: classifyLocationMatch({
        requestedLocation: location,
        address,
        postcode,
        latitude,
        longitude,
        region,
      }),
    },
    "serpapi",
    location
  );
}

function dedupePlaces(places: SerpPlace[]): SerpPlace[] {
  const seen = new Set<string>();
  return places.filter((p) => {
    const key = p.place_id ?? `${p.title}-${p.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchSerpApiPage(
  query: { q: string; ll?: string },
  apiKey: string,
  start: number
): Promise<{ places: SerpPlace[]; creditExhausted: boolean }> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_maps");
  url.searchParams.set("type", "search");
  url.searchParams.set("q", query.q);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "uk");
  if (query.ll) url.searchParams.set("ll", query.ll);
  if (start > 0) url.searchParams.set("start", String(start));

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });

  if (!res.ok) {
    const text = await res.text();
    const creditExhausted =
      res.status === 429 ||
      res.status === 402 ||
      isSerpApiCreditError(text);
    throw Object.assign(
      new Error(`SerpAPI HTTP ${res.status}: ${text.slice(0, 160)}`),
      { creditExhausted }
    );
  }

  const data = await res.json();

  if (data.error) {
    const creditExhausted = isSerpApiCreditError(String(data.error));
    throw Object.assign(new Error(`SerpAPI: ${data.error}`), {
      creditExhausted,
    });
  }

  const places: SerpPlace[] =
    data.local_results ??
    (data.place_results ? [data.place_results] : []);

  return { places, creditExhausted: false };
}

function emptyRealResult(
  source: string,
  extra: Partial<SearchProviderResult> = {}
): SearchProviderResult {
  return {
    leads: [],
    source,
    provider: "serpapi",
    isLive: false,
    apiCallConsumed: extra.apiCallConsumed ?? false,
    apiCallsUsed: extra.apiCallsUsed,
    creditExhausted: extra.creditExhausted,
    requestedCount: extra.requestedCount,
    foundRealCount: 0,
    sourceExhausted: true,
    providerResultsInspected: 0,
    insideTargetFound: 0,
  };
}

function locationStats(leads: Lead[]) {
  return {
    insideTargetFound: leads.filter((lead) =>
      isInsideSearchTarget(lead.locationMatch)
    ).length,
    outsideTargetCount: leads.filter(
      (lead) => lead.locationMatch === "outside_target"
    ).length,
    unknownLocationCount: leads.filter(
      (lead) => lead.locationMatch === "unknown" || !lead.locationMatch
    ).length,
  };
}

export const serpApiProvider: SearchProvider = {
  name: "serpapi",
  async search(params) {
    const {
      keyword,
      location,
      maxResults,
      delayMs,
      serpApiKey,
      serpapiDeepPagination = false,
      useMaxLeads = false,
      strictMaxResults = false,
    } = params;

    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }

    const apiKey = getSerpApiKey(serpApiKey);

    if (!apiKey) {
      return emptyRealResult("serpapi-no-key-no-results", {
        requestedCount: maxResults,
      });
    }

    const region = resolveGeoRegion(location);
    const maxPages = region
      ? getSerpApiPagesPerSector({
          useMaxLeads,
          deepPagination: serpapiDeepPagination,
          leadsPerSector: useMaxLeads ? maxResults : Math.max(maxResults, 80),
        })
      : strictMaxResults
        ? 1
        : getSerpApiPagesPerSector({
            useMaxLeads,
            deepPagination: serpapiDeepPagination,
            leadsPerSector: maxResults,
          });
    const mapsQuery = buildSerpApiMapsQuery(keyword, location);

    try {
      let index = 0;
      const accumulated = await collectUntilTarget<Lead>({
        requestedInside: maxResults,
        maxPages,
        getId: (lead) => lead.id,
        isInside: (lead) =>
          region ? isInsideSearchTarget(lead.locationMatch) : true,
        fetchPage: async (pageIndex) => {
          const start = pageIndex * SERPAPI_PAGE_SIZE;
          const { places } = await fetchSerpApiPage(mapsQuery, apiKey, start);
          const unique = dedupePlaces(places);
          const leads = unique.map((place) =>
            mapPlaceToLead(place, keyword, location, index++)
          );
          return {
            items: leads,
            shortPage: unique.length < SERPAPI_PAGE_SIZE,
          };
        },
      });

      const sorted = sortByLocationMatch(accumulated.inspected);
      const stats = locationStats(sorted);
      const sourceParts = [
        useMaxLeads ? "serpapi-max-volume" : "serpapi-equilibrium",
        accumulated.pagesUsed > 1 ? `${accumulated.pagesUsed}p` : null,
        region ? "geo-target" : null,
      ].filter(Boolean);

      return {
        leads: sorted,
        source:
          sorted.length === 0
            ? "serpapi-empty-no-results"
            : sourceParts.join("-"),
        provider: "serpapi",
        isLive: sorted.length > 0,
        apiCallConsumed: true,
        apiCallsUsed: accumulated.pagesUsed,
        requestedCount: maxResults,
        foundRealCount: stats.insideTargetFound,
        sourceExhausted: accumulated.sourceExhausted,
        providerResultsInspected: accumulated.inspected.length,
        insideTargetFound: stats.insideTargetFound,
        outsideTargetCount: stats.outsideTargetCount,
        unknownLocationCount: stats.unknownLocationCount,
        selectedCount: selectOperationalSearchLeads(sorted, maxResults).length,
      };
    } catch (err) {
      console.error("[SerpAPI]", err);
      const creditExhausted =
        Boolean(
          err &&
            typeof err === "object" &&
            "creditExhausted" in err &&
            (err as { creditExhausted: boolean }).creditExhausted
        ) ||
        isSerpApiCreditError(err instanceof Error ? err.message : String(err));

      return emptyRealResult(
        creditExhausted ? "serpapi-quota-no-results" : "serpapi-error-no-results",
        {
          requestedCount: maxResults,
          apiCallConsumed: creditExhausted,
          creditExhausted,
        }
      );
    }
  },
};
