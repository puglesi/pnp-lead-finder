import type { Lead } from "./lead";
import type {
  AutonomousSourceId,
  AutonomousSourceStrategy,
} from "./autonomous-sources";

export type SearchProviderType =
  | "mock"
  | "serpapi"
  | "google-custom"
  | "autonomous";
export type SearchProfile = "serpapi" | "autonomous-24h";
export type QueueMode = "parallel" | "sequential";

export interface SearchConfig {
  maxResults: number;
  useMaxLeads: boolean;
  delayMs: number;
  workers: number;
  provider: SearchProviderType;
  searchProfile: SearchProfile;
  mode24h: boolean;
  queueMode: QueueMode;
  autoSaveLeads: boolean;
  serpapiDeepPagination: boolean;
  autonomousSources: AutonomousSourceId[];
  autonomousSourceStrategy: AutonomousSourceStrategy;
  autonomousSingleSource: AutonomousSourceId;
  autonomousEnrichWebsites: boolean;
}

export interface SearchSummary {
  apiCallsConsumed: number;
  liveCalls: number;
  mockFallbackCalls: number;
  leadsFound: number;
  elapsedMs: number;
  creditExhausted?: boolean;
  autoSavedCount?: number;
}

export type SectorStatus = "pending" | "queued" | "running" | "done" | "error";

export interface SectorProgress {
  sector: string;
  status: SectorStatus;
  queueIndex: number;
  leadsFound: number;
  error?: string;
  durationMs?: number;
}

export interface BulkSearchProgress {
  active: boolean;
  location: string;
  sectors: SectorProgress[];
  completedCount: number;
  totalCount: number;
  leadsFound: number;
  runningSectors: string[];
  startedAt: number | null;
  elapsedMs: number;
  estimatedRemainingMs: number;
  searchSummary?: SearchSummary;
}

export interface SearchApiResponse {
  keyword: string;
  location: string;
  resultsCount: number;
  leads: Lead[];
  source: string;
  provider: SearchProviderType;
  activeProvider: SearchProviderType;
  isLive: boolean;
  resolveReason?: string;
  apiCallConsumed?: boolean;
  apiCallsUsed?: number;
  creditExhausted?: boolean;
}

export interface ProviderStatusResponse {
  serpapiConfigured: boolean;
  envKeyConfigured: boolean;
  clientKeyConfigured: boolean;
  keySource: "env" | "client" | "both" | "none";
  monthlyLimit: number;
  envHint: string;
  providers: {
    autonomous: { available: boolean; isLive: boolean; label: string };
    serpapi: {
      available: boolean;
      isLive: boolean;
      label: string;
      reason?: string;
    };
  };
}