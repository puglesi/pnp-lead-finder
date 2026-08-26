import { generateLeadsForSearch } from "@/lib/mock-data";
import type { SearchProvider } from "./types";

export const mockProvider: SearchProvider = {
  name: "mock",
  async search({
    keyword,
    location,
    maxResults,
    delayMs,
    allowArtificialResults,
  }) {
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    if (allowArtificialResults !== true) {
      return {
        leads: [],
        source: "mock-disabled-for-real-search",
        provider: "mock",
        isLive: false,
        apiCallConsumed: false,
        requestedCount: maxResults,
        foundRealCount: 0,
        sourceExhausted: true,
      };
    }
    const leads = generateLeadsForSearch(keyword, location, maxResults).map(
      (lead) => ({
        ...lead,
        synthetic: true,
        syntheticReason: "explicit_mock_provider",
        sourceKind: "mock" as const,
        emailIsGuessed: Boolean(lead.email),
        requestedLocation: location,
      })
    );
    return {
      leads,
      source: "mock-engine",
      provider: "mock",
      isLive: false,
      apiCallConsumed: false,
      requestedCount: maxResults,
      foundRealCount: 0,
      sourceExhausted: false,
    };
  },
};
