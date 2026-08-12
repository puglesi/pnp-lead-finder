/**
 * Normalizes persisted Zustand payloads BEFORE UI selectors consume them.
 * Preserves all durable data; only repairs null/undefined/wrong-type fields.
 */

import type { Campaign } from "../types/campaign.ts";
import type { Lead, SearchRecord } from "../types/lead.ts";
import { asArray } from "./safe-object.ts";

export function normalizeLeadPersistSlice(raw: unknown): {
  sidebarCollapsed: boolean;
  recentSearches: SearchRecord[];
  fullSearchHistory: SearchRecord[];
  sectorHistory: string[];
  savedLeads: Lead[];
  importedLeads: Lead[];
} {
  const state =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const recent = asArray<SearchRecord>(state.recentSearches);
  const full = asArray<SearchRecord>(state.fullSearchHistory);
  return {
    sidebarCollapsed:
      typeof state.sidebarCollapsed === "boolean"
        ? state.sidebarCollapsed
        : false,
    recentSearches: recent,
    fullSearchHistory: full.length > 0 ? full : [...recent],
    sectorHistory: asArray<string>(state.sectorHistory).filter(
      (s) => typeof s === "string"
    ),
    savedLeads: asArray<Lead>(state.savedLeads).filter((l) => l && l.id),
    importedLeads: asArray<Lead>(state.importedLeads).filter((l) => l && l.id),
  };
}

export function normalizeCampaignPersistSlice(raw: unknown): {
  campaigns: Campaign[];
} {
  const state =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const campaigns = asArray<Campaign>(state.campaigns)
    .filter((c) => c && typeof c === "object" && c.id)
    .map((c) => ({
      ...c,
      leadIds: asArray<string>(c.leadIds).filter(
        (id): id is string => typeof id === "string"
      ),
      // Nested legacy: leadStatuses/sendErrors may contain null slots.
      leadStatuses: asArray(c.leadStatuses).filter(
        (item) => item && typeof item === "object"
      ),
      sendErrors: asArray(c.sendErrors).filter(
        (item) => item && typeof item === "object"
      ),
      status:
        c.status === "draft" ||
        c.status === "saved" ||
        c.status === "active" ||
        c.status === "paused" ||
        c.status === "completed" ||
        c.status === "archived"
          ? c.status
          : ("draft" as const),
    })) as Campaign[];
  return { campaigns };
}

export function normalizeBlocklistPersistSlice(raw: unknown): {
  entries: Array<Record<string, unknown>>;
} {
  const state =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  // Exact field: entries may contain null slots or non-objects from legacy writes.
  const entries = asArray(state.entries)
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item)
    )
    .map((item) => item as Record<string, unknown>);
  return { entries };
}

export function normalizeLifetimePersistSlice(raw: unknown): {
  companiesFound: number;
  leadsFound: number;
  validEmailsFound: number;
  campaignsSent: number;
} {
  const state =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  return {
    companiesFound: num(state.companiesFound),
    leadsFound: num(state.leadsFound),
    validEmailsFound: num(state.validEmailsFound),
    campaignsSent: num(state.campaignsSent),
  };
}

export function normalizeThemePersistSlice(raw: unknown): {
  preference: "light" | "dark" | "system";
} {
  const state =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const pref = state.preference;
  if (pref === "light" || pref === "dark" || pref === "system") {
    return { preference: pref };
  }
  return { preference: "system" };
}

export function normalizeTemplatesPersistSlice(raw: unknown): {
  templates: unknown[];
} {
  const state =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    templates: asArray(state.templates).filter(
      (t) => t && typeof t === "object"
    ),
  };
}

/**
 * Describes localStorage keys without exposing sensitive values.
 * Used by /diagnostico-storage and tests.
 */
export function inspectPersistKeys(
  storage: { getItem(key: string): string | null },
  keys: string[]
): Array<{
  key: string;
  present: boolean;
  parseOk: boolean;
  valueType: string;
  version: number | null;
  nullFields: string[];
  missingFields: string[];
}> {
  return keys.map((key) => {
    const raw = storage.getItem(key);
    if (raw == null) {
      return {
        key,
        present: false,
        parseOk: false,
        valueType: "absent",
        version: null,
        nullFields: [],
        missingFields: [],
      };
    }
    try {
      const parsed = JSON.parse(raw) as {
        state?: Record<string, unknown>;
        version?: number;
      };
      const state =
        parsed && typeof parsed === "object" && parsed.state
          ? parsed.state
          : (parsed as Record<string, unknown>);
      const nullFields: string[] = [];
      const missingFields: string[] = [];
      if (state && typeof state === "object") {
        for (const [k, v] of Object.entries(state)) {
          if (v === null) nullFields.push(k);
          if (v === undefined) missingFields.push(k);
        }
      }
      return {
        key,
        present: true,
        parseOk: true,
        valueType: Array.isArray(state)
          ? "array"
          : state && typeof state === "object"
            ? "object"
            : typeof state,
        version:
          typeof parsed?.version === "number" ? parsed.version : null,
        nullFields,
        missingFields,
      };
    } catch {
      return {
        key,
        present: true,
        parseOk: false,
        valueType: "invalid-json",
        version: null,
        nullFields: [],
        missingFields: [],
      };
    }
  });
}

export const PERSIST_STORAGE_KEYS = [
  "pnp-lead-finder",
  "pnp-campaigns",
  "pnp-email-templates",
  "pnp-email-blocklist",
  "pnp-lifetime-stats",
  "pnp-theme",
  "pnp-agent-three",
  "pnp-agent-one",
  "pnp-agent-two",
  "pnp-batch-pipeline",
  "pnp-usage",
  "pnp-settings",
] as const;
