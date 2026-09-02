import type { OfficialSignatureRecord } from "../lib/operation-signature-repository.ts";
import type { Lead } from "./lead.ts";
import type { PersistedSearchBatch } from "./search.ts";

export const LOCAL_DATA_MIGRATION_VERSION = 1;

export const COMMERCIAL_STORE_KEYS = [
  "pnp-lead-finder",
  "pnp-campaigns",
  "pnp-email-templates",
  "pnp-email-blocklist",
  "pnp-lifetime-stats",
  "pnp-agent-one",
  "pnp-agent-two",
  "pnp-agent-three",
  "pnp-batch-pipeline",
  "pnp-settings",
  "pnp-usage",
] as const;

export type CommercialStoreKey = (typeof COMMERCIAL_STORE_KEYS)[number];

export interface LegacySearchBatchSnapshot {
  batch: PersistedSearchBatch;
  leads: Lead[];
}

export interface LocalDataBridgeSnapshot {
  migrationVersion: number;
  stores: Partial<Record<CommercialStoreKey, unknown>>;
  indexedDb: {
    signatures: OfficialSignatureRecord[];
    searchBatches: LegacySearchBatchSnapshot[];
  };
}

export interface LocalDataHydration {
  migrationVersion: number;
  stores: Partial<Record<CommercialStoreKey, unknown>>;
  signatures: OfficialSignatureRecord[];
  searchBatches: LegacySearchBatchSnapshot[];
  sendHistory: OfficialSendHistoryRecord[];
  recoveredCampaigns: RecoveredCampaignSummary[];
}

export interface OfficialSendHistoryRecord {
  id: string;
  intentKey: string;
  campaignId: string | null;
  campaignName: string | null;
  leadId: string | null;
  company: string | null;
  email: string;
  operation: string;
  contactKind: string;
  queueItemId: string | null;
  providerMessageId: string | null;
  confirmedAt: string | null;
  attemptedAt: string | null;
  status: string;
  error: string | null;
}

/** Read-only recovery view. It never fabricates a campaign body or recipients. */
export interface RecoveredCampaignSummary {
  campaignId: string;
  operation: string;
  label: "Campanha histórica recuperada";
  confirmed: number;
  failed: number;
  firstActivityAt: string;
  lastActivityAt: string;
  uniqueEmails: number;
  uniqueProviderMessageIds: number;
}

export interface LocalDataCounts {
  leads: number;
  campaigns: number;
  searchHistory: number;
  confirmedSends: number;
  failedSends: number;
  blocklist: number;
  templates: number;
}

export type LocalDataAvailability = "checking" | "available" | "unavailable";

export interface LocalDataHealth {
  ok: boolean;
  status: "ok" | "error";
  writable: boolean;
  message: string;
  databasePath: string | null;
  backupPath: string | null;
  lastBackup: string | null;
  sizeBytes: number;
  migrationVersion: number;
  counts: LocalDataCounts;
  signatures: {
    "panek-puglesi": boolean;
    modeclean: boolean;
  };
}
