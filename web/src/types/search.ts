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
  requestedCount?: number;
  foundRealCount?: number;
  sourceExhausted?: boolean;
  providerResultsInspected?: number;
  insideTargetFound?: number;
  outsideTargetCount?: number;
  unknownLocationCount?: number;
  selectedCount?: number;
  error?: string;
  durationMs?: number;
}

export interface BulkSearchProgress {
  batchId?: string;
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
  currentStage?: SearchBatchStage;
  lastActivityAt?: string;
  lastSavedAt?: string;
  persistenceStatus?: "idle" | "saving" | "saved" | "error";
  persistenceError?: string;
  failedCount?: number;
  searchSummary?: SearchSummary;
}

export type SearchSectorCheckpointStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export type SearchBatchStatus =
  | "running"
  | "interrupted"
  | "completed"
  | "completed_with_errors"
  | "failed";

export type SearchBatchStage =
  | "search"
  | "enrichment"
  | "validation"
  | "scoring"
  | "completed";

export interface PersistedSearchSector {
  index: number;
  sector: string;
  status: SearchSectorCheckpointStatus;
  leadsFound: number;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
  error?: string;
}

export interface PersistedSearchBatch {
  batchId: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  lastSavedAt: string;
  status: SearchBatchStatus;
  currentStage: SearchBatchStage;
  sectorsInput: string;
  sectors: PersistedSearchSector[];
  location: string;
  configuredQuantity: number;
  provider: SearchProviderType;
  searchProfile: SearchProfile;
  workers: number;
  leadsFound: number;
  deduplicatedLeads: number;
  completedSectors: number;
  pendingSectors: number;
  failedSectors: number;
  enrichmentCompleted: number;
  enrichmentFailed: number;
  validationCompleted: number;
  validationFailed: number;
  scoringCompleted: number;
  scoringFailed: number;
  error?: string;
  historyRecordId?: string;
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
  requestedCount?: number;
  foundRealCount?: number;
  sourceExhausted?: boolean;
  providerResultsInspected?: number;
  insideTargetFound?: number;
  outsideTargetCount?: number;
  unknownLocationCount?: number;
  selectedCount?: number;
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
