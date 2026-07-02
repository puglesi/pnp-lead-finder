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
}

export interface SearchProviderResult {
  leads: Lead[];
  source: string;
  provider: SearchProviderType;
  isLive: boolean;
  apiCallConsumed?: boolean;
  apiCallsUsed?: number;
  creditExhausted?: boolean;
}

export interface SearchProvider {
  name: SearchProviderType;
  search: (params: SearchParams) => Promise<SearchProviderResult>;
}