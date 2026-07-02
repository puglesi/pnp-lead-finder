import { generateLeadsForSearch } from "@/lib/mock-data";
import type { SearchProvider } from "./types";

export const mockProvider: SearchProvider = {
  name: "mock",
  async search({ keyword, location, maxResults, delayMs }) {
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
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