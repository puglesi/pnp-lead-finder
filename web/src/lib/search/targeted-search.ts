import type { LocationMatch } from "../../types/lead.ts";
import {
  DEFAULT_LOCATION_FILTER,
  isGeographicallyEligible,
  type LocationFilterOptions,
} from "../location-match.ts";

export function isInsideSearchTarget(
  match: LocationMatch | undefined
): boolean {
  return match === "verified" || match === "likely";
}

const MATCH_RANK: Record<LocationMatch, number> = {
  verified: 0,
  likely: 1,
  unknown: 2,
  outside_target: 3,
};

export function sortByLocationMatch<T extends { locationMatch?: LocationMatch }>(
  leads: readonly T[]
): T[] {
  return [...leads].sort((left, right) => {
    const a = MATCH_RANK[left.locationMatch ?? "unknown"] ?? 2;
    const b = MATCH_RANK[right.locationMatch ?? "unknown"] ?? 2;
    return a - b;
  });
}

/**
 * Operational lote: verified, then likely, then unknown only if enabled.
 * outside_target never enters. Capped at requested — extras stay for audit.
 */
export function selectOperationalSearchLeads<T extends { locationMatch?: LocationMatch }>(
  leads: readonly T[],
  requested: number,
  options: LocationFilterOptions = DEFAULT_LOCATION_FILTER
): T[] {
  const cap = Math.max(0, Math.floor(requested));
  const selected: T[] = [];
  for (const lead of sortByLocationMatch(leads)) {
    if (selected.length >= cap) break;
    if (!isGeographicallyEligible(lead.locationMatch, options)) continue;
    selected.push(lead);
  }
  return selected;
}

export interface TargetedSearchPageResult<T> {
  items: T[];
  /** True when the provider page was shorter than a full page (source drying up). */
  shortPage: boolean;
}

export interface TargetedSearchAccumulation<T> {
  inspected: T[];
  insideTargetFound: number;
  sourceExhausted: boolean;
  pagesUsed: number;
}

/**
 * Walk provider pages until the in-area cap is filled, the source dries up,
 * or the configured page budget is spent. Never invents items.
 */
export async function collectUntilTarget<T>(options: {
  requestedInside: number;
  maxPages: number;
  getId: (item: T) => string;
  isInside: (item: T) => boolean;
  fetchPage: (
    pageIndex: number
  ) => Promise<TargetedSearchPageResult<T> | T[]>;
}): Promise<TargetedSearchAccumulation<T>> {
  const requested = Math.max(0, Math.floor(options.requestedInside));
  const maxPages = Math.max(1, Math.floor(options.maxPages));
  const seen = new Set<string>();
  const inspected: T[] = [];
  let insideTargetFound = 0;
  let sourceExhausted = false;
  let pagesUsed = 0;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const raw = await options.fetchPage(pageIndex);
    const page = Array.isArray(raw) ? { items: raw, shortPage: raw.length === 0 } : raw;
    pagesUsed += 1;

    if (page.items.length === 0) {
      sourceExhausted = true;
      break;
    }

    for (const item of page.items) {
      const id = options.getId(item);
      if (seen.has(id)) continue;
      seen.add(id);
      inspected.push(item);
      if (options.isInside(item)) insideTargetFound += 1;
    }

    if (insideTargetFound >= requested) {
      sourceExhausted = false;
      break;
    }

    if (page.shortPage) {
      sourceExhausted = true;
      break;
    }

    if (pageIndex === maxPages - 1) {
      sourceExhausted = insideTargetFound < requested;
    }
  }

  return {
    inspected,
    insideTargetFound,
    sourceExhausted,
    pagesUsed,
  };
}
