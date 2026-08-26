import type { Lead } from "../../types/lead.ts";
import type { SearchProviderType } from "../../types/search.ts";

export const SYNTHETIC_FORBIDDEN_MESSAGE =
  "Leads sintéticos/mock são proibidos em busca real.";

const SYNTHETIC_ID_PREFIXES = ["auto-sup-", "mock-"];

export function isExplicitMockSearch(input: {
  provider?: SearchProviderType | string;
  allowArtificialResults?: boolean;
}): boolean {
  return input.provider === "mock" && input.allowArtificialResults === true;
}

export function isRealSearch(input: {
  provider?: SearchProviderType | string;
  allowArtificialResults?: boolean;
}): boolean {
  return !isExplicitMockSearch(input);
}

export function isSyntheticLead(
  lead: Pick<Lead, "id" | "synthetic" | "sourceKind">
): boolean {
  if (lead.synthetic === true) return true;
  if (lead.sourceKind === "mock") return true;
  const id = String(lead.id ?? "");
  return SYNTHETIC_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

export function assertNoSyntheticLeads(
  leads: readonly Pick<Lead, "id" | "synthetic" | "sourceKind">[],
  realSearch: boolean
): void {
  if (!realSearch) return;
  const synthetic = leads.filter(isSyntheticLead);
  if (synthetic.length === 0) return;
  throw new Error(
    SYNTHETIC_FORBIDDEN_MESSAGE + " (" + synthetic.length + " lead(s))"
  );
}

export function rejectSyntheticLeadsForRealSearch<T extends Lead>(
  leads: readonly T[],
  realSearch: boolean
): T[] {
  if (!realSearch) return [...leads];
  const synthetic = leads.filter(isSyntheticLead);
  if (synthetic.length > 0) {
    console.error("[real-search-guard]", SYNTHETIC_FORBIDDEN_MESSAGE, {
      count: synthetic.length,
      ids: synthetic.slice(0, 8).map((lead) => lead.id),
    });
  }
  return leads.filter((lead) => !isSyntheticLead(lead));
}

export function stampRealLeadOrigin<T extends Lead>(
  lead: T,
  sourceKind: NonNullable<Lead["sourceKind"]>,
  requestedLocation: string
): T {
  return {
    ...lead,
    synthetic: false,
    sourceKind,
    requestedLocation,
  };
}

export function capRealSearchResults<T>(
  leads: readonly T[],
  maxResults: number
): {
  leads: T[];
  requestedCount: number;
  foundRealCount: number;
  sourceExhausted: boolean;
} {
  const cap = Math.max(0, Math.floor(maxResults));
  const capped = leads.slice(0, cap);
  return {
    leads: capped,
    requestedCount: cap,
    foundRealCount: capped.length,
    sourceExhausted: capped.length < cap,
  };
}
