/**
 * Client-side Dashboard hydration pipeline.
 * Simulates what the Dashboard overview runs after Zustand rehydrate,
 * without mounting Next.js routing. Used by tests and diagnostics.
 */

import type { Campaign } from "../types/campaign.ts";
import type { Lead, SearchRecord } from "../types/lead.ts";
import {
  EMAIL_BLOCK_OPERATION_LABELS,
  EMAIL_BLOCK_REASON_LABELS,
  type EmailBlocklistEntry,
} from "./email-blocklist.ts";
import { computeLifetimeStats } from "./lifetime-stats.ts";
import { searchGlobalHistory } from "./global-history-search.ts";
import { asArray } from "./safe-object.ts";
import {
  inspectPersistKeys,
  normalizeBlocklistPersistSlice,
  normalizeCampaignPersistSlice,
  normalizeLeadPersistSlice,
  normalizeLifetimePersistSlice,
  normalizeTemplatesPersistSlice,
  normalizeThemePersistSlice,
  PERSIST_STORAGE_KEYS,
} from "./store-rehydrate.ts";

export interface DashboardHydrationInput {
  leadPersist?: unknown;
  campaignPersist?: unknown;
  blocklistPersist?: unknown;
  lifetimePersist?: unknown;
  themePersist?: unknown;
  templatesPersist?: unknown;
  settingsPersist?: unknown;
}

export interface DashboardHydrationResult {
  ok: true;
  stats: ReturnType<typeof computeLifetimeStats>;
  recentCount: number;
  historyCount: number;
  sectorCount: number;
  campaignCount: number;
  blockedCount: number;
  historyHitsSample: number;
  theme: "light" | "dark" | "system";
  templateCount: number;
  /** Simulated DOM markers a real Dashboard mount would expose. */
  mountedMarkers: string[];
}

/**
 * Runs the exact data path of Dashboard overview after rehydrate.
 * Throws with a precise field path if any incompatible null still leaks.
 */
export function runDashboardClientHydration(
  input: DashboardHydrationInput
): DashboardHydrationResult {
  const lead = normalizeLeadPersistSlice(input.leadPersist);
  const campaignsSlice = normalizeCampaignPersistSlice(input.campaignPersist);
  const blocklist = normalizeBlocklistPersistSlice(input.blocklistPersist);
  const lifetime = normalizeLifetimePersistSlice(input.lifetimePersist);
  const theme = normalizeThemePersistSlice(input.themePersist);
  const templates = normalizeTemplatesPersistSlice(input.templatesPersist);

  // Selector-level contracts (same as components).
  const recentSearches = asArray<SearchRecord>(lead.recentSearches);
  const fullSearchHistory = asArray<SearchRecord>(lead.fullSearchHistory);
  const sectorHistory = asArray<string>(lead.sectorHistory);
  const savedLeads = asArray<Lead>(lead.savedLeads);
  const importedLeads = asArray<Lead>(lead.importedLeads);
  const campaigns = asArray<Campaign>(campaignsSlice.campaigns);
  const entries = asArray<EmailBlocklistEntry>(blocklist.entries);

  // Array ops that previously crashed on null.
  assertArray(recentSearches, "lead.recentSearches");
  assertArray(fullSearchHistory, "lead.fullSearchHistory");
  assertArray(sectorHistory, "lead.sectorHistory");
  assertArray(savedLeads, "lead.savedLeads");
  assertArray(campaigns, "campaign.campaigns");
  assertArray(entries, "blocklist.entries");

  recentSearches.map((r) => r?.id);
  fullSearchHistory.filter((r) => (r?.keyword ?? "").length >= 0);
  sectorHistory.map((s) => String(s).toLowerCase());
  savedLeads.map((l) => l?.category);
  campaigns.map((c) => asArray(c.leadIds).length + asArray(c.leadStatuses).length);
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const reason = (entry as EmailBlocklistEntry).reason;
    const operation = (entry as EmailBlocklistEntry).operation;
    const normalizedEmail = (entry as EmailBlocklistEntry).normalizedEmail;
    const reasonLabel =
      EMAIL_BLOCK_REASON_LABELS[reason as keyof typeof EMAIL_BLOCK_REASON_LABELS] ??
      String(reason ?? "manual");
    const opLabel =
      EMAIL_BLOCK_OPERATION_LABELS[
        operation as keyof typeof EMAIL_BLOCK_OPERATION_LABELS
      ] ?? String(operation ?? "both");
    void reasonLabel.toLowerCase();
    void opLabel.toLowerCase();
    void (normalizedEmail ?? "").includes("@");
  }

  const stats = computeLifetimeStats({
    fullSearchHistory,
    recentSearches,
    savedLeads,
    importedLeads,
    campaigns,
    floors: lifetime,
  });

  const hits = searchGlobalHistory({
    query: "a",
    fullSearchHistory,
    recentSearches,
    savedLeads,
    importedLeads,
    campaigns,
    blockedEmails: entries,
    limit: 10,
  });

  // Settings: autonomousSources null is the exact field that crashed
  // getActiveAutonomousSources / toggle when shallow-merged without repair.
  const settings =
    input.settingsPersist && typeof input.settingsPersist === "object"
      ? (input.settingsPersist as Record<string, unknown>)
      : {};
  const autonomousSources = Array.isArray(settings.autonomousSources)
    ? settings.autonomousSources
    : [];
  autonomousSources.map((s) => String(s));
  void autonomousSources.includes?.("google-maps");

  const mountedMarkers = [
    "stats-cards",
    "global-history-search",
    "blocked-emails-panel",
    "recent-searches",
    `theme:${theme.preference}`,
    `campaigns:${campaigns.length}`,
    `blocked:${entries.length}`,
  ];

  return {
    ok: true,
    stats,
    recentCount: recentSearches.length,
    historyCount: fullSearchHistory.length,
    sectorCount: sectorHistory.length,
    campaignCount: campaigns.length,
    blockedCount: entries.length,
    historyHitsSample: hits.length,
    theme: theme.preference,
    templateCount: asArray(templates.templates).length,
    mountedMarkers,
  };
}

/**
 * Builds adversarial "old browser storage" for the full Dashboard suite.
 * Values are the inner `state` payloads (not the zustand wrapper).
 */
export function buildAdversarialDashboardStorage(): DashboardHydrationInput {
  return {
    leadPersist: {
      sidebarCollapsed: null,
      recentSearches: null,
      fullSearchHistory: undefined,
      sectorHistory: null,
      savedLeads: null,
      importedLeads: undefined,
    },
    campaignPersist: {
      campaigns: [
        {
          id: "legacy-c1",
          name: "Old campaign",
          subject: "Hi",
          status: "sending", // invalid → draft
          leadIds: null,
          leadStatuses: null,
          sendErrors: undefined,
          campaignProfileId: "panek-puglesi",
        },
        null,
        {
          id: "legacy-c2",
          name: "Completed-ish",
          status: "active",
          leadIds: ["l1"],
          // leadStatuses missing
          sendErrors: null,
        },
      ],
    },
    blocklistPersist: {
      entries: [
        {
          id: "b1",
          normalizedEmail: "old@example.com",
          reason: "legacy_reason_unknown",
          operation: "invalid_op",
          blockedAt: "2026-01-01T00:00:00.000Z",
        },
        null,
        { email: "not-an-email" },
      ],
    },
    lifetimePersist: {
      companiesFound: null,
      leadsFound: "12",
      validEmailsFound: undefined,
      campaignsSent: -3,
    },
    themePersist: { preference: "neon" },
    templatesPersist: { templates: null },
    settingsPersist: {
      autonomousSources: null,
      autonomousSourceStrategy: "parallel",
      nightScheduleStart: null,
      localProductionEnabled: "yes",
    },
  };
}

/**
 * Storage inspection used by /diagnostico-storage + tests (no secrets).
 */
export function inspectDashboardStorageKeys(
  storage: { getItem(key: string): string | null }
) {
  return inspectPersistKeys(storage, [...PERSIST_STORAGE_KEYS]);
}

function assertArray(value: unknown, path: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `Dashboard hydration: expected array at ${path}, got ${String(value)}`
    );
  }
}
