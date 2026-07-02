import type { SearchProviderType } from "@/types/search";
import { resolveActiveProvider } from "@/lib/search/config";
import { mockProvider } from "./providers/mock";
import { serpApiProvider } from "./providers/serpapi";
import { googleCustomProvider } from "./providers/google-custom";
import { autonomousProvider } from "./providers/autonomous";
import type { SearchParams, SearchProviderResult } from "./providers/types";

const providers = {
  mock: mockProvider,
  serpapi: serpApiProvider,
  "google-custom": googleCustomProvider,
  autonomous: autonomousProvider,
};

export async function executeSearch(
  params: SearchParams & { provider: SearchProviderType }
): Promise<
  SearchProviderResult & {
    activeProvider: SearchProviderType;
    resolveReason: string;
  }
> {
  const keys = {
    serpApiKey: params.serpApiKey,
    googleApiKey: params.googleApiKey,
    googleCseId: params.googleCseId,
  };

  if (
    params.provider === "serpapi" &&
    params.creditExhausted
  ) {
    const result = await autonomousProvider.search(params);
    return {
      ...result,
      activeProvider: "autonomous",
      resolveReason: "Quota SerpAPI esgotada — fallback autônomo (Google/Bing/DDG)",
      source: `quota-fallback-${result.source}`,
      apiCallConsumed: false,
      creditExhausted: true,
    };
  }

  const resolved = resolveActiveProvider(params.provider, keys);
  const provider = providers[resolved.provider] ?? mockProvider;
  const result = await provider.search(params);

  return {
    ...result,
    activeProvider: resolved.provider,
    resolveReason: resolved.reason,
    isLive: result.isLive && resolved.isLive,
  };
}