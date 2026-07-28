import { generateLeadsForSearch } from "@/lib/mock-data";
import { isGoogleCseConfigured } from "@/lib/search/config";
import type { SearchProvider } from "./types";

interface GoogleCustomItem {
  title?: string;
  link?: string;
  snippet?: string;
}

export const googleCustomProvider: SearchProvider = {
  name: "google-custom",
  async search({
    keyword,
    location,
    maxResults,
    delayMs,
    googleApiKey,
    googleCseId,
    allowArtificialResults,
  }) {
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }

    const hasConfig = isGoogleCseConfigured({ googleApiKey, googleCseId });
    const apiKey =
      googleApiKey?.trim() || process.env.GOOGLE_CSE_API_KEY?.trim();
    const cseId = googleCseId?.trim() || process.env.GOOGLE_CSE_ID?.trim();

    if (!hasConfig || !apiKey || !cseId) {
      if (allowArtificialResults === false) {
        return {
          leads: [],
          source: "google-cse-unavailable",
          provider: "google-custom",
          isLive: false,
          apiCallConsumed: false,
        };
      }
      const leads = generateLeadsForSearch(keyword, location, maxResults);
      return {
        leads,
        source: "google-cse-mock-fallback",
        provider: "google-custom",
        isLive: false,
        apiCallConsumed: false,
      };
    }

    try {
      const query = `${keyword} ${location} UK contact`;
      const url = new URL("https://www.googleapis.com/customsearch/v1");
      url.searchParams.set("key", apiKey);
      url.searchParams.set("cx", cseId);
      url.searchParams.set("q", query);
      url.searchParams.set("num", String(Math.min(maxResults, 10)));

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Google CSE ${res.status}`);

      const data = await res.json();
      const items: GoogleCustomItem[] = data.items ?? [];
      const eligibleItems =
        allowArtificialResults === false
          ? items.filter((item) => item.title?.trim() && item.link?.trim())
          : items;

      const leads = eligibleItems.slice(0, maxResults).map((item, i) => ({
          id: `gcs-${keyword}-${location}-${i}`,
          company: item.title ?? `Business ${i + 1}`,
          website: item.link ?? `https://example.co.uk`,
          email: null as string | null,
          phone: "+44 20 0000 0000",
          address: `${location}, UK`,
          category: keyword,
          aiScore: Math.floor(60 + Math.random() * 35),
        })
      );

      return {
        leads,
        source: "google-cse-live",
        provider: "google-custom",
        isLive: true,
        apiCallConsumed: true,
      };
    } catch {
      if (allowArtificialResults === false) {
        return {
          leads: [],
          source: "google-cse-error-no-results",
          provider: "google-custom",
          isLive: false,
          apiCallConsumed: true,
        };
      }
      const leads = generateLeadsForSearch(keyword, location, maxResults);
      return {
        leads,
        source: "google-cse-error-fallback",
        provider: "google-custom",
        isLive: false,
        apiCallConsumed: true,
      };
    }
  },
};