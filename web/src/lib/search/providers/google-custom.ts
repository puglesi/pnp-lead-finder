import { isGoogleCseConfigured } from "@/lib/search/config";
import { stampRealLeadOrigin } from "@/lib/search/real-search-guard";
import { classifyLocationMatch, extractUkPostcode } from "@/lib/location-match";
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
  }) {
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }

    const hasConfig = isGoogleCseConfigured({ googleApiKey, googleCseId });
    const apiKey =
      googleApiKey?.trim() || process.env.GOOGLE_CSE_API_KEY?.trim();
    const cseId = googleCseId?.trim() || process.env.GOOGLE_CSE_ID?.trim();

    if (!hasConfig || !apiKey || !cseId) {
      return {
        leads: [],
        source: "google-cse-unavailable",
        provider: "google-custom",
        isLive: false,
        apiCallConsumed: false,
        requestedCount: maxResults,
        foundRealCount: 0,
        sourceExhausted: true,
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
      const eligibleItems = items.filter(
        (item) => item.title?.trim() && item.link?.trim()
      );

      const leads = eligibleItems.slice(0, maxResults).map((item, i) => {
        const website = item.link!;
        const snippet = item.snippet ?? "";
        const postcode = extractUkPostcode(snippet);
        return stampRealLeadOrigin(
          {
            id: `gcs-${keyword}-${location}-${i}`,
            company: item.title ?? `Business ${i + 1}`,
            website,
            email: null,
            phone: "",
            address: snippet,
            category: keyword,
            aiScore: Math.min(92, 60 + (i % 20)),
            emailIsGuessed: false,
            discoveredAddress: snippet || undefined,
            postcode,
            locationMatch: classifyLocationMatch({
              requestedLocation: location,
              address: snippet,
              postcode,
            }),
          },
          "google-custom",
          location
        );
      });

      return {
        leads,
        source: "google-cse-live",
        provider: "google-custom",
        isLive: true,
        apiCallConsumed: true,
        requestedCount: maxResults,
        foundRealCount: leads.length,
        sourceExhausted: leads.length < maxResults,
      };
    } catch {
      return {
        leads: [],
        source: "google-cse-error-no-results",
        provider: "google-custom",
        isLive: false,
        apiCallConsumed: true,
        requestedCount: maxResults,
        foundRealCount: 0,
        sourceExhausted: true,
      };
    }
  },
};
