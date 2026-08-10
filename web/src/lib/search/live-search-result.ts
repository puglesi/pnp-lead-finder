import type { SearchApiResponse } from "../../types/search.ts";

export const REAL_SEARCH_UNAVAILABLE_MESSAGE =
  "Busca real indisponível — nenhum envio iniciado.";

const NON_LIVE_SOURCE_MARKERS = [
  "offline-fallback",
  "error-fallback",
  "error-no-results",
  "mock-fallback",
  "serpapi-no-key",
  "serpapi-empty",
  "serpapi-quota",
  "supplemented",
];

export function assessRealSearchResponse(
  response: Pick<SearchApiResponse, "isLive" | "source" | "leads">
): { available: boolean; reason: string | null } {
  const source = response.source.toLowerCase();
  if (NON_LIVE_SOURCE_MARKERS.some((marker) => source.includes(marker))) {
    return { available: false, reason: `fonte não-live: ${response.source}` };
  }
  if (!response.isLive) {
    return { available: false, reason: `provedor não-live: ${response.source}` };
  }
  if (response.leads.length === 0) {
    return { available: false, reason: "resposta real vazia" };
  }
  return { available: true, reason: null };
}
