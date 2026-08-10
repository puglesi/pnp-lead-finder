import { generateLeadsForSearch } from "@/lib/mock-data";
import { getSerpApiKey, isSerpApiCreditError } from "@/lib/search/config";
import {
  getSerpApiPagesPerSector,
  SERPAPI_PAGE_SIZE,
} from "@/lib/search/volume";
import { leadFingerprint, type Lead } from "@/types/lead";
import { autonomousProvider } from "./autonomous";
import type { SearchProvider, SearchParams, SearchProviderResult } from "./types";

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
}

function guessEmail(website?: string): string | null {
  if (!website) return null;
  try {
    const host = new URL(website).hostname.replace(/^www\./, "");
    const prefixes = ["info", "contact", "hello", "enquiries"];
    const prefix = prefixes[host.length % prefixes.length];
    return `${prefix}@${host}`;
  } catch {
    return null;
  }
}

function scoreFromRating(rating?: number, reviews?: number): number {
  const base = rating ? Math.round(rating * 18) : 65;
  const reviewBoost =
    reviews && reviews > 50 ? 8 : reviews && reviews > 10 ? 4 : 0;
  return Math.min(99, Math.max(55, base + reviewBoost));
}

function mapPlaceToLead(
  place: SerpPlace,
  keyword: string,
  location: string,
  index: number,
  allowGuessedEmail: boolean
): Lead {
  const website =
    place.website ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.title ?? keyword)}`;

  return {
    id: `serp-${place.place_id ?? `${keyword}-${index}`}`,
    company: place.title ?? `Business ${index + 1}`,
    website,
    email: allowGuessedEmail ? guessEmail(place.website) : null,
    phone: place.phone ?? "—",
    address: place.address ?? `${location}, UK`,
    category: place.types?.[0] ?? place.type ?? keyword,
    aiScore: scoreFromRating(place.rating, place.reviews),
  };
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

function mergeLeadsPrimaryFirst(primary: Lead[], extra: Lead[], max: number): Lead[] {
  const seen = new Set<string>();
  const merged: Lead[] = [];

  for (const lead of primary) {
    const fp = leadFingerprint(lead);
    if (seen.has(fp)) continue;
    seen.add(fp);
    merged.push(lead);
    if (merged.length >= max) return merged;
  }

  for (const lead of extra) {
    const fp = leadFingerprint(lead);
    if (seen.has(fp)) continue;
    seen.add(fp);
    merged.push({
      ...lead,
      aiScore: Math.min(lead.aiScore, 75),
    });
    if (merged.length >= max) break;
  }

  return merged;
}

async function fetchSerpApiPage(
  query: string,
  apiKey: string,
  start: number
): Promise<{ places: SerpPlace[]; creditExhausted: boolean }> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_maps");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "uk");
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

async function fetchSerpApiPlaces(
  query: string,
  apiKey: string,
  maxPages: number
): Promise<{
  places: SerpPlace[];
  creditExhausted: boolean;
  apiCallsUsed: number;
}> {
  const all: SerpPlace[] = [];
  let apiCallsUsed = 0;
  let start = 0;

  for (let page = 0; page < maxPages; page++) {
    const { places } = await fetchSerpApiPage(query, apiKey, start);
    apiCallsUsed++;

    if (places.length === 0) break;

    all.push(...places);
    if (places.length < SERPAPI_PAGE_SIZE) break;

    start += SERPAPI_PAGE_SIZE;
    if (page < maxPages - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return {
    places: dedupePlaces(all),
    creditExhausted: false,
    apiCallsUsed,
  };
}

async function supplementVolume(
  params: SearchParams,
  serpLeads: Lead[]
): Promise<{ leads: Lead[]; supplemented: boolean }> {
  if (serpLeads.length >= params.maxResults) {
    return { leads: serpLeads.slice(0, params.maxResults), supplemented: false };
  }

  const needed = params.maxResults - serpLeads.length;
  const extra = await autonomousProvider.search({
    ...params,
    maxResults: needed,
    delayMs: 0,
  });

  return {
    leads: mergeLeadsPrimaryFirst(serpLeads, extra.leads, params.maxResults),
    supplemented: extra.leads.length > 0,
  };
}

async function autonomousFallback(
  params: SearchParams,
  source: string,
  creditExhausted = false
): Promise<SearchProviderResult> {
  const result = await autonomousProvider.search(params);
  return {
    ...result,
    source: `${source}-${result.source}`,
    provider: "serpapi",
    isLive: result.isLive,
    apiCallConsumed: creditExhausted,
    creditExhausted,
  };
}

function mockFallback(
  keyword: string,
  location: string,
  maxResults: number,
  source: string
) {
  const leads = generateLeadsForSearch(keyword, location, maxResults);
  return {
    leads,
    source,
    provider: "serpapi" as const,
    isLive: false,
    apiCallConsumed: false,
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
      strictMaxResults = false,
      serpapiDeepPagination = false,
      useMaxLeads = false,
    } = params;

    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }

    const apiKey = getSerpApiKey(serpApiKey);

    if (!apiKey) {
      if (params.allowArtificialResults === false) {
        return {
          leads: [],
          source: "serpapi-no-key-no-results",
          provider: "serpapi",
          isLive: false,
          apiCallConsumed: false,
        };
      }
      return autonomousFallback(params, "serpapi-no-key");
    }

    const maxPages = strictMaxResults
      ? 1
      : getSerpApiPagesPerSector({
          useMaxLeads,
          deepPagination: serpapiDeepPagination,
          leadsPerSector: maxResults,
        });

    try {
      const query = `${keyword} in ${location}, UK`;
      const { places, apiCallsUsed } = await fetchSerpApiPlaces(
        query,
        apiKey,
        maxPages
      );

      if (places.length === 0) {
        if (params.allowArtificialResults === false) {
          return {
            leads: [],
            source: "serpapi-empty-no-results",
            provider: "serpapi",
            isLive: false,
            apiCallConsumed: true,
            apiCallsUsed,
          };
        }
        return autonomousFallback(params, "serpapi-empty");
      }

      const serpLeads = places.map((place, i) =>
        mapPlaceToLead(place, keyword, location, i, params.allowArtificialResults !== false)
      );

      const { leads, supplemented } =
        serpLeads.length < maxResults && params.allowArtificialResults !== false
          ? await supplementVolume(params, serpLeads)
          : { leads: serpLeads.slice(0, maxResults), supplemented: false };

      const sourceParts = [
        useMaxLeads ? "serpapi-max-volume" : "serpapi-equilibrium",
        apiCallsUsed > 1 ? `${apiCallsUsed}p` : null,
        supplemented ? "supplemented" : null,
      ].filter(Boolean);

      return {
        leads,
        source: sourceParts.join("-"),
        provider: "serpapi",
        isLive: true,
        apiCallConsumed: true,
        apiCallsUsed,
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

      if (creditExhausted) {
        if (params.allowArtificialResults === false) {
          return {
            leads: [],
            source: "serpapi-quota-no-results",
            provider: "serpapi",
            isLive: false,
            apiCallConsumed: true,
            creditExhausted: true,
          };
        }
        return autonomousFallback(params, "serpapi-quota", true);
      }

      if (params.allowArtificialResults === false) {
        return {
          leads: [],
          source: "serpapi-error-no-results",
          provider: "serpapi",
          isLive: false,
          apiCallConsumed: false,
        };
      }

      return mockFallback(
        keyword,
        location,
        maxResults,
        "serpapi-error-fallback"
      );
    }
  },
};
