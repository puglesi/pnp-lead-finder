import type { SearchProviderType } from "@/types/search";
import { resolveActiveProvider } from "@/lib/search/config";
import { mockProvider } from "./providers/mock";
import { serpApiProvider } from "./providers/serpapi";
import { googleCustomProvider } from "./providers/google-custom";
import { autonomousProvider } from "./providers/autonomous";
import type { SearchParams, SearchProviderResult } from "./providers/types";
import {
  isExplicitMockSearch,
  rejectSyntheticLeadsForRealSearch,
} from "./real-search-guard";
import { selectOperationalSearchLeads } from "./targeted-search";

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

  const explicitMock = isExplicitMockSearch(params);

  if (
    params.provider === "serpapi" &&
    params.creditExhausted &&
    !explicitMock
  ) {
    const result = await autonomousProvider.search({
      ...params,
      allowArtificialResults: false,
    });
    const leads = rejectSyntheticLeadsForRealSearch(result.leads, true);
    return {
      ...result,
      leads,
      foundRealCount: leads.length,
      sourceExhausted: leads.length < params.maxResults,
      activeProvider: "autonomous",
      resolveReason: "Quota SerpAPI esgotada — fallback autônomo (Google/Bing/DDG)",
      source: `quota-fallback-${result.source}`,
      apiCallConsumed: false,
      creditExhausted: true,
    };
  }

  const resolved = resolveActiveProvider(params.provider, keys);
  const provider = providers[resolved.provider] ?? mockProvider;
  const searchParams = explicitMock
    ? params
    : { ...params, allowArtificialResults: false };
  const result = await provider.search(searchParams);
  const realSearch = !explicitMock;
  const leads = rejectSyntheticLeadsForRealSearch(result.leads, realSearch);
  const requestedCount = result.requestedCount ?? params.maxResults;
  const selectedCount = selectOperationalSearchLeads(
    leads,
    requestedCount
  ).length;

  return {
    ...result,
    leads,
    foundRealCount: result.insideTargetFound ?? result.foundRealCount ?? leads.length,
    requestedCount,
    sourceExhausted:
      result.sourceExhausted ?? leads.length < params.maxResults,
    providerResultsInspected:
      result.providerResultsInspected ?? leads.length,
    insideTargetFound: result.insideTargetFound,
    outsideTargetCount: result.outsideTargetCount,
    unknownLocationCount: result.unknownLocationCount,
    selectedCount: result.selectedCount ?? selectedCount,
    activeProvider: resolved.provider,
    resolveReason: resolved.reason,
    isLive: result.isLive && resolved.isLive,
  };
}