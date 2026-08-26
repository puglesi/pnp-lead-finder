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
}

export interface LocalDataCounts {
  leads: number;
  campaigns: number;
  searchHistory: number;
  confirmedSends: number;
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
