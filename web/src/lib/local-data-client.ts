"use client";

import { useEffect, useState } from "react";
import {
  COMMERCIAL_STORE_KEYS,
  LOCAL_DATA_MIGRATION_VERSION,
  type CommercialStoreKey,
  type LocalDataBridgeSnapshot,
  type LocalDataHealth,
  type LocalDataHydration,
} from "@/types/local-data";
import { createIndexedDbOfficialSignatureRepository } from "@/lib/operation-signature-repository";
import { createIndexedDbSearchBatchRepository } from "@/lib/search/batch-repository";
import {
  getLocalDataAvailability,
  subscribeLocalDataAvailability,
} from "@/lib/local-data-availability";

export const LOCAL_DATA_MIGRATION_MARKER =
  "pnp-local-database-migration-v1";

export {
  LOCAL_DATA_CHECKING_MESSAGE,
  LOCAL_DATA_HEALTH_CHANGE_EVENT,
  LOCAL_DATA_UNAVAILABLE_ERROR_NAME,
  LOCAL_DATA_UNAVAILABLE_MESSAGE,
  LocalDataUnavailableError,
  assertLocalDataWritable,
  ensureLocalDataWritable,
  getLocalDataAvailability,
  getLocalDataAvailabilityMessage,
  isLocalDataUnavailableError,
  isWritableHealth,
  prepareLocalDataWrite,
  probeLocalDataHealth,
  setLocalDataAvailability,
  setLocalDataWritable,
  subscribeLocalDataAvailability,
} from "@/lib/local-data-availability";
export type { LocalDataAvailability } from "@/lib/local-data-availability";

export function useLocalDataAvailability() {
  const [status, setStatus] = useState(getLocalDataAvailability);
  useEffect(
    () => subscribeLocalDataAvailability(() => setStatus(getLocalDataAvailability())),
    []
  );
  return status;
}

function parsePersisted(raw: string | null): unknown {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "state" in parsed
    ) {
      return (parsed as { state?: unknown }).state;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function sanitizeLegacySettings(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const allowed = [
    "workers",
    "delayMs",
    "maxResults",
    "useMaxLeads",
    "queueMode",
    "provider",
    "searchProfile",
    "mode24h",
    "autoSaveLeads",
    "serpapiDeepPagination",
    "autonomousSources",
    "autonomousSourceStrategy",
    "autonomousSingleSource",
    "autonomousEnrichWebsites",
    "hardwareProfile",
    "profileUserOverride",
    "emailProvider",
    "autonomousDailySentDate",
    "autonomousDailySentCount",
    "localProductionEnabled",
    "nightModeAuto",
    "nightModeActive",
    "nightScheduleStart",
    "nightScheduleEnd",
  ];
  return Object.fromEntries(
    allowed
      .filter((key) => key in source)
      .map((key) => [key, source[key]])
  );
}

export async function collectLegacySnapshot(): Promise<LocalDataBridgeSnapshot> {
  const stores: LocalDataBridgeSnapshot["stores"] = {};
  for (const key of COMMERCIAL_STORE_KEYS) {
    const value = parsePersisted(window.localStorage.getItem(key));
    if (value !== undefined) {
      stores[key] =
        key === "pnp-settings" ? sanitizeLegacySettings(value) : value;
    }
  }

  const signatures = await createIndexedDbOfficialSignatureRepository()
    .getAll()
    .catch(() => []);
  const searchBatches = await createIndexedDbSearchBatchRepository()
    .getAllBatches()
    .catch(() => []);

  return {
    migrationVersion: LOCAL_DATA_MIGRATION_VERSION,
    stores,
    indexedDb: { signatures, searchBatches },
  };
}

export async function migrateLegacyBrowserData(): Promise<Record<string, number>> {
  const snapshot = await collectLegacySnapshot();
  const response = await fetch("/api/local-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  });
  const body = await response.json().catch(() => null) as {
    error?: string;
    migrated?: Record<string, number>;
  } | null;
  if (!response.ok) {
    throw new Error(body?.error ?? "Falha ao migrar dados para o banco local.");
  }
  window.localStorage.setItem(
    LOCAL_DATA_MIGRATION_MARKER,
    String(LOCAL_DATA_MIGRATION_VERSION)
  );
  return body?.migrated ?? {};
}

export async function fetchLocalHydration(): Promise<LocalDataHydration> {
  const response = await fetch("/api/local-data", { cache: "no-store" });
  const body = await response.json().catch(() => null) as {
    data?: LocalDataHydration;
    error?: string;
  } | null;
  if (!response.ok || !body?.data) {
    throw new Error(body?.error ?? "Banco local indisponível.");
  }
  return body.data;
}

export async function fetchLocalDataHealth(): Promise<LocalDataHealth> {
  const response = await fetch("/api/local-data/health", {
    cache: "no-store",
  });
  const body = await response.json() as LocalDataHealth;
  return body;
}

export async function persistCommercialStore(
  storeKey: CommercialStoreKey,
  state: unknown
): Promise<void> {
  const response = await fetch("/api/local-data", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storeKey, state }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Banco local indisponível.");
  }
}

export function serializeStoreState(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

export function isCommercialStoreKey(value: string): value is CommercialStoreKey {
  return COMMERCIAL_STORE_KEYS.includes(value as CommercialStoreKey);
}
