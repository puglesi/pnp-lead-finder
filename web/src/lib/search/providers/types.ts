import type { Lead } from "@/types/lead";
import type {
  AutonomousSourceId,
  AutonomousSourceStrategy,
} from "@/types/autonomous-sources";
import type { SearchProviderType } from "@/types/search";

export interface SearchParams {
  keyword: string;
  location: string;
  maxResults: number;
  strictMaxResults?: boolean;
  delayMs: number;
  sectorIndex?: number;
  serpApiKey?: string;
  googleApiKey?: string;
  googleCseId?: string;
  creditExhausted?: boolean;
  serpapiDeepPagination?: boolean;
  useMaxLeads?: boolean;
  autonomousSources?: AutonomousSourceId[];
  autonomousSourceStrategy?: AutonomousSourceStrategy;
  autonomousSingleSource?: AutonomousSourceId;
  autonomousEnrichWebsites?: boolean;
  allowArtificialResults?: boolean;
}

export interface SearchProviderResult {
  leads: Lead[];
  source: string;
  provider: SearchProviderType;
  isLive: boolean;
  apiCallConsumed?: boolean;
  apiCallsUsed?: number;
  creditExhausted?: boolean;
  requestedCount?: number;
  foundRealCount?: number;
  sourceExhausted?: boolean;
  providerResultsInspected?: number;
  insideTargetFound?: number;
  outsideTargetCount?: number;
  unknownLocationCount?: number;
  selectedCount?: number;
}

export interface SearchProvider {
  name: SearchProviderType;
  search: (params: SearchParams) => Promise<SearchProviderResult>;
}
