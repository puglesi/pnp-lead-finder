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
    if (allowArtificialResults === false) {
      return {
        leads: [],
        source: "mock-disabled-for-agent-one",
        provider: "mock",
        isLive: false,
        apiCallConsumed: false,
      };
    }
    const leads = generateLeadsForSearch(keyword, location, maxResults);
    return {
      leads,
      source: "mock-engine",
      provider: "mock",
      isLive: false,
      apiCallConsumed: false,
    };
  },
};