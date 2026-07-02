import { MOCK_MAX_RESULTS } from "@/lib/mock-data";
import type { SearchProfile, SearchProviderType } from "@/types/search";

export const SERPAPI_FREE_MONTHLY_LIMIT = 250;
export const SERPAPI_PAGE_SIZE = 20;
export const SERPAPI_PAGES_STANDARD = 1;
export const SERPAPI_PAGES_DEEP_MAX = 3;
export const SERPAPI_PAGES_EQUILIBRIUM_MIN = 4;
export const SERPAPI_PAGES_EQUILIBRIUM_MAX = 5;
export const SERPAPI_PAGES_VOLUME_MAX = 10;
export const SERPAPI_PAGES_VOLUME_MIN = 8;
export const SERPAPI_LEADS_PER_PAGE_ESTIMATE = 20;

export const SERPAPI_EQUILIBRIUM_DEFAULT = 160;
export const SERPAPI_EQUILIBRIUM_MIN = 150;
export const SERPAPI_EQUILIBRIUM_MAX = 180;
export const SERPAPI_VOLUME_DEFAULT = 200;
export const SERPAPI_VOLUME_MIN = 200;
export const SERPAPI_VOLUME_MAX = 200;
export const SERPAPI_VOLUME_EXECUTION_LEADS_MIN = 800;
export const SERPAPI_VOLUME_EXECUTION_LEADS_MAX = 1500;

export const DEFAULT_LEADS_PER_SECTOR = SERPAPI_EQUILIBRIUM_DEFAULT;
export const SERPAPI_MAX_LEADS = SERPAPI_VOLUME_MAX;
export const AUTONOMOUS_STANDARD_MAX = 500;
export const AUTONOMOUS_VOLUME_MIN = 1000;
export const AUTONOMOUS_VOLUME_MAX = 2000;
export const AUTONOMOUS_VOLUME_DEFAULT = 2000;
export const AUTONOMOUS_REALISTIC_EXECUTION_MIN = 500;
export const AUTONOMOUS_REALISTIC_EXECUTION_MAX = 1000;
/** @deprecated Use AUTONOMOUS_STANDARD_MAX or AUTONOMOUS_VOLUME_MAX */
export const AUTONOMOUS_MAX_LEADS = AUTONOMOUS_STANDARD_MAX;
export const AUTONOMOUS_MIN_LEADS = 50;
export const CUSTOM_LEADS_MIN = 10;
export const SERPAPI_MANUAL_MAX = SERPAPI_EQUILIBRIUM_MAX;

export const RECOMMENDED_LEADS_DEFAULT = SERPAPI_EQUILIBRIUM_DEFAULT;
export const RECOMMENDED_LEADS_MIN = SERPAPI_EQUILIBRIUM_MIN;
export const RECOMMENDED_LEADS_MAX = SERPAPI_EQUILIBRIUM_MAX;

export const SERPAPI_EQUILIBRIUM_MODE_LABEL =
  "Modo Equilíbrio — recomendado para bom volume sem alto consumo";

export const SERPAPI_VOLUME_MODE_LABEL =
  "Modo Volume Máximo — alto consumo de buscas, mas máximo de leads por execução";

/** @deprecated Use AUTONOMOUS_MIN_LEADS */
export const AUTONOMOUS_BALANCE_MIN = AUTONOMOUS_MIN_LEADS;
/** @deprecated Use AUTONOMOUS_MAX_LEADS */
export const AUTONOMOUS_BALANCE_MAX = AUTONOMOUS_MAX_LEADS;
/** @deprecated Use SERPAPI_EQUILIBRIUM_DEFAULT */
export const AUTONOMOUS_BALANCE_DEFAULT = SERPAPI_EQUILIBRIUM_DEFAULT;
/** @deprecated Use SERPAPI_EQUILIBRIUM_MAX */
export const CUSTOM_LEADS_MAX = SERPAPI_MANUAL_MAX;

export const AUTONOMOUS_DELAY_MIN = 3500;
export const AUTONOMOUS_DELAY_MAX = 5000;
export const AUTONOMOUS_WORKERS_MIN = 2;
export const AUTONOMOUS_WORKERS_MAX = 4;

export const MAX_POSSIBLE_SERPAPI_LABEL =
  "Modo Volume Máximo — 200 leads/setor · até 10 páginas SerpAPI";

export const AUTONOMOUS_VOLUME_24H_LABEL =
  "Volume Alto 24h — pode demorar várias horas e consumir mais recursos do PC";

export const MAX_POSSIBLE_AUTONOMOUS_LABEL =
  "Volume Alto 24h — 1000–2000 leads/setor · operação noturna prolongada";

export interface SerpApiPaginationOptions {
  useMaxLeads?: boolean;
  deepPagination?: boolean;
  leadsPerSector?: number;
}

export function isSerpApiProfile(
  searchProfile?: SearchProfile,
  provider?: SearchProviderType
): boolean {
  return (
    searchProfile === "serpapi" &&
    (provider === undefined || provider === "serpapi")
  );
}

export function isAutonomousProfile(
  searchProfile?: SearchProfile,
  provider?: SearchProviderType
): boolean {
  return searchProfile === "autonomous-24h" || provider === "autonomous";
}

export function isAutonomousVolumeMode(
  useMaxLeads: boolean,
  searchProfile?: SearchProfile,
  provider?: SearchProviderType
): boolean {
  return isAutonomousProfile(searchProfile, provider) && useMaxLeads;
}

export function getMaxLeadsForProvider(
  provider: SearchProviderType,
  searchProfile?: SearchProfile,
  useMaxLeads?: boolean
): number {
  if (isAutonomousProfile(searchProfile, provider)) {
    return useMaxLeads ? AUTONOMOUS_VOLUME_MAX : AUTONOMOUS_STANDARD_MAX;
  }
  if (provider === "mock") return MOCK_MAX_RESULTS;
  if (useMaxLeads) return SERPAPI_VOLUME_MAX;
  return SERPAPI_EQUILIBRIUM_MAX;
}

export function getManualLeadsCap(
  searchProfile?: SearchProfile,
  provider?: SearchProviderType,
  useMaxLeads?: boolean
): number {
  if (isAutonomousProfile(searchProfile, provider)) {
    return useMaxLeads ? AUTONOMOUS_VOLUME_MAX : AUTONOMOUS_STANDARD_MAX;
  }
  if (useMaxLeads) return SERPAPI_VOLUME_MAX;
  return SERPAPI_EQUILIBRIUM_MAX;
}

export function resolveEffectiveMaxResults(
  maxResults: number,
  useMaxLeads: boolean,
  provider: SearchProviderType,
  searchProfile?: SearchProfile
): number {
  const isAutonomous = isAutonomousProfile(searchProfile, provider);

  if (useMaxLeads) {
    return getMaxLeadsForProvider(provider, searchProfile, true);
  }

  if (isAutonomous) {
    return Math.min(
      AUTONOMOUS_STANDARD_MAX,
      Math.max(AUTONOMOUS_MIN_LEADS, maxResults)
    );
  }

  return Math.min(
    SERPAPI_EQUILIBRIUM_MAX,
    Math.max(SERPAPI_EQUILIBRIUM_MIN, maxResults)
  );
}

export function isSerpApiVolumeMode(
  useMaxLeads: boolean,
  searchProfile?: SearchProfile,
  provider?: SearchProviderType
): boolean {
  return isSerpApiProfile(searchProfile, provider) && useMaxLeads;
}

export function isSerpApiEquilibriumMode(
  useMaxLeads: boolean,
  searchProfile?: SearchProfile,
  provider?: SearchProviderType
): boolean {
  return isSerpApiProfile(searchProfile, provider) && !useMaxLeads;
}

export function getSerpApiPagesPerSector(
  options: SerpApiPaginationOptions = {}
): number {
  const {
    useMaxLeads = false,
    deepPagination = false,
    leadsPerSector = SERPAPI_EQUILIBRIUM_DEFAULT,
  } = options;

  if (useMaxLeads) {
    const needed = Math.ceil(leadsPerSector / SERPAPI_PAGE_SIZE);
    return Math.min(
      SERPAPI_PAGES_VOLUME_MAX,
      Math.max(SERPAPI_PAGES_VOLUME_MIN, needed)
    );
  }

  if (deepPagination) {
    const needed = Math.ceil(leadsPerSector / SERPAPI_PAGE_SIZE);
    return Math.min(SERPAPI_PAGES_DEEP_MAX, Math.max(1, needed));
  }

  const needed = Math.ceil(leadsPerSector / SERPAPI_PAGE_SIZE);
  return Math.min(
    SERPAPI_PAGES_EQUILIBRIUM_MAX,
    Math.max(SERPAPI_PAGES_EQUILIBRIUM_MIN, needed)
  );
}

/** @deprecated Use getSerpApiPagesPerSector with options */
export function estimateSerpApiPagesPerSector(
  leadsPerSector: number,
  deepPagination = false,
  useMaxLeads = false
): number {
  return getSerpApiPagesPerSector({
    useMaxLeads,
    deepPagination,
    leadsPerSector,
  });
}

export function estimateSerpApiCalls(
  sectorCount: number,
  provider: SearchProviderType,
  searchProfile: SearchProfile,
  leadsPerSector = SERPAPI_EQUILIBRIUM_DEFAULT,
  pagination: SerpApiPaginationOptions = {}
): number {
  if (
    searchProfile !== "serpapi" ||
    provider !== "serpapi" ||
    sectorCount <= 0
  ) {
    return 0;
  }
  return (
    sectorCount *
    getSerpApiPagesPerSector({ ...pagination, leadsPerSector })
  );
}

export interface LeadsRangeOptions {
  useMaxLeads?: boolean;
  searchProfile?: SearchProfile;
  provider?: SearchProviderType;
}

export function estimateTotalLeadsRange(
  sectorCount: number,
  leadsPerSector: number,
  options: LeadsRangeOptions = {}
): { min: number; max: number } {
  if (sectorCount <= 0) return { min: 0, max: 0 };

  if (isAutonomousProfile(options.searchProfile, options.provider)) {
    if (options.useMaxLeads) {
      const max = sectorCount * AUTONOMOUS_VOLUME_MAX;
      const min = Math.max(
        sectorCount * AUTONOMOUS_VOLUME_MIN,
        AUTONOMOUS_REALISTIC_EXECUTION_MIN
      );
      return {
        min: Math.min(min, max),
        max: Math.max(max, AUTONOMOUS_REALISTIC_EXECUTION_MAX),
      };
    }
    const max = sectorCount * leadsPerSector;
    return {
      min: Math.max(
        Math.round(max * 0.7),
        AUTONOMOUS_REALISTIC_EXECUTION_MIN
      ),
      max: Math.min(
        Math.max(max, AUTONOMOUS_REALISTIC_EXECUTION_MIN),
        AUTONOMOUS_REALISTIC_EXECUTION_MAX
      ),
    };
  }

  if (options.useMaxLeads) {
    return {
      min: SERPAPI_VOLUME_EXECUTION_LEADS_MIN,
      max: SERPAPI_VOLUME_EXECUTION_LEADS_MAX,
    };
  }

  const max = sectorCount * leadsPerSector;
  const min = Math.round(max * 0.85);
  return { min, max };
}

export function formatVolumeExecutionEstimate(): string {
  return `Estimativa de ${SERPAPI_VOLUME_EXECUTION_LEADS_MIN.toLocaleString("pt-BR")}–${SERPAPI_VOLUME_EXECUTION_LEADS_MAX.toLocaleString("pt-BR")} leads`;
}

export function formatSerpApiForecast(
  sectorCount: number,
  pagesPerSector: number
): string {
  const total = sectorCount * pagesPerSector;
  const sectorLabel = sectorCount === 1 ? "setor" : "setores";
  const pageLabel = pagesPerSector === 1 ? "página" : "páginas";
  return `${sectorCount} ${sectorLabel} × ${pagesPerSector} ${pageLabel} = ~${total} buscas`;
}

export function isRecommendedLeadCount(count: number): boolean {
  return count >= RECOMMENDED_LEADS_MIN && count <= RECOMMENDED_LEADS_MAX;
}

export function formatLeadsLabel(
  maxResults: number,
  useMaxLeads: boolean,
  provider: SearchProviderType,
  searchProfile?: SearchProfile
): string {
  if (useMaxLeads) {
    const max = resolveEffectiveMaxResults(0, true, provider, searchProfile);
    return `Máx. (${max})`;
  }
  return String(maxResults);
}

export function getProfileLabel(profile: SearchProfile): string {
  if (profile === "serpapi") return "SerpAPI Premium";
  return "Modo Scraping Autônomo";
}