import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  generateLeadsForSearch,
  MOCK_MAX_RESULTS,
  resolveCategory,
  recentSearches as initialSearches,
} from "@/lib/mock-data";
import { runWithConcurrency, parseSectors } from "@/lib/worker-pool";
import { estimateRemainingMs } from "@/lib/time-estimate";
import { useSettingsStore } from "@/store/settings-store";
import { useUsageStore } from "@/store/usage-store";
import { RECENT_SEARCHES_LIMIT } from "@/lib/mode-labels";
import { exportLeadsToCSV } from "@/lib/csv-export";
import {
  mergeAgentOneContactUpdates,
  type AgentOneContactUpdate,
} from "@/lib/agent-one-enrichment";
import { leadFingerprint, type Lead, type SearchRecord } from "@/types/lead";
import type { BulkSearchProgress, SearchApiResponse } from "@/types/search";
import type { LeadEmailValidationUpdate } from "@/types/email-validation";
import {
  clearBatchIdFromNonMembers,
  createLeadBatch,
  findSearchRecordForBatch,
  getSharedLeadBatchId,
  migrateLegacySearchToBatch,
  repairBatchFromSearchSnapshot,
  stampLeadsWithBatchId,
} from "@/lib/lead-batch";
import type { LeadBatch } from "@/types/batch";
import { useBatchPipelineStore } from "@/store/batch-pipeline-store";
import { useLifetimeStatsStore } from "@/store/lifetime-stats-store";
import {
  assessRealSearchResponse,
  REAL_SEARCH_UNAVAILABLE_MESSAGE,
} from "@/lib/search/live-search-result";

const FULL_HISTORY_LIMIT = 200;

const INITIAL_BULK: BulkSearchProgress = {
  active: false,
  location: "",
  sectors: [],
  completedCount: 0,
  totalCount: 0,
  leadsFound: 0,
  runningSectors: [],
  startedAt: null,
  elapsedMs: 0,
  estimatedRemainingMs: 0,
};

interface BulkSearchOptions {
  allowArtificialResults?: boolean;
  autoSaveResults?: boolean;
  requireLiveResults?: boolean;
  maxResultsOverride?: number;
}

interface LeadStore {
  sidebarCollapsed: boolean;
  userName: string;
  recentSearches: SearchRecord[];
  fullSearchHistory: SearchRecord[];
  sectorHistory: string[];
  lastBulkSearchSectors: string;
  lastBulkSearchLocation: string;
  currentLeads: Lead[];
  savedLeads: Lead[];
  importedLeads: Lead[];
  currentKeyword: string;
  currentLocation: string;
  isSearching: boolean;
  bulkProgress: BulkSearchProgress;
  lastSearchIsLive: boolean;
  lastSearchSource: string;
  selectedLeadIds: string[];
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  performBulkSearch: (
    keywordsInput: string,
    location: string,
    options?: BulkSearchOptions
  ) => Promise<void>;
  generateMoreLeads: (batchSize?: number) => number;
  loadSearchResults: (keyword: string, location: string) => void;
  loadSearchFromHistory: (recordId: string) => boolean;
  exportSearchFromHistory: (recordId: string) => boolean;
  getHistoryRecord: (recordId: string) => SearchRecord | undefined;
  clearRecentSearches: () => void;
  toggleLeadSelection: (id: string) => void;
  selectAllLeads: (ids: string[]) => void;
  clearSelection: () => void;
  getSelectedLeads: () => Lead[];
  saveLead: (lead: Lead) => boolean;
  /**
   * Ensures the completed current search has a pipeline batchId.
   * Migrates legacy results (no batchId) without re-running search or duplicating leads.
   * Returns the batchId to open in Agent 1, or null if there are no results.
   */
  ensureCurrentSearchBatch: () => string | null;
  /**
   * Continues a historical search (e.g. Buscas Recentes) in Agent 1.
   * Loads existing snapshot leads, locates/creates batchId, never re-runs search.
   */
  openSearchBatchInAgentOne: (recordId: string) => string | null;
  /**
   * Repair batch.leadIds from the original SearchRecord snapshot.
   * Detaches contaminants without deleting them. Returns the repaired batch.
   */
  repairBatchMembershipFromSnapshot: (batchId: string) => LeadBatch | null;
  applyAgentOneContactUpdates: (updates: AgentOneContactUpdate[]) => void;
  updateLeadEmailValidation: (
    leadId: string,
    validation: LeadEmailValidationUpdate
  ) => boolean;
  removeSavedLead: (id: string) => void;
  clearAllSavedLeads: () => void;
  isLeadSaved: (lead: Lead) => boolean;
  importExternalLeads: (leads: Lead[]) => Lead[];
  clearImportedLeads: () => void;
}

function mergeSectorHistory(existing: string[], newSectors: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const sector of [...newSectors, ...existing]) {
    const trimmed = sector.trim();
    const key = trimmed.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(trimmed);
  }
  return merged.slice(0, 50);
}

async function fetchSector(
  sector: string,
  location: string,
  sectorIndex: number,
  options: BulkSearchOptions
): Promise<SearchApiResponse> {
  const settings = useSettingsStore.getState();
  const config = settings.getSearchConfig();
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      keyword: sector,
      location,
      sectorIndex,
      maxResults: options.maxResultsOverride ?? settings.maxResults,
      strictMaxResults: options.maxResultsOverride !== undefined,
      useMaxLeads: settings.useMaxLeads,
      allowArtificialResults: options.allowArtificialResults !== false,
      delayMs: config.delayMs,
      provider: config.provider,
      searchProfile: settings.searchProfile,
      serpApiKey: settings.serpApiKey || undefined,
      googleApiKey: settings.googleApiKey || undefined,
      googleCseId: settings.googleCseId || undefined,
      creditExhausted: useUsageStore.getState().creditExhausted,
      serpapiDeepPagination: settings.serpapiDeepPagination,
      autonomousSources: settings.autonomousSources,
      autonomousSourceStrategy: settings.autonomousSourceStrategy,
      autonomousSingleSource: settings.autonomousSingleSource,
      autonomousEnrichWebsites: settings.autonomousEnrichWebsites,
    }),
  });
  if (!res.ok) throw new Error(`Falha ao buscar ${sector}`);
  const data = (await res.json()) as SearchApiResponse;
  if (options.requireLiveResults) {
    const assessment = assessRealSearchResponse(data);
    if (!assessment.available) {
      console.error("[one-click/search]", {
        sector,
        source: data.source,
        isLive: data.isLive,
        resultsCount: data.leads.length,
        reason: assessment.reason,
      });
      throw new Error(REAL_SEARCH_UNAVAILABLE_MESSAGE);
    }
  }
  return data;
}

function autoSaveAllLeads(
  leads: Lead[],
  saveLead: (lead: Lead) => boolean
): number {
  let saved = 0;
  for (const lead of leads) {
    if (saveLead(lead)) saved++;
  }
  return saved;
}

function dedupeLeads(leads: Lead[]): Lead[] {
  const seen = new Set<string>();
  return leads.filter((l) => {
    const fp = leadFingerprint(l);
    if (seen.has(fp)) return false;
    seen.add(fp);
    return true;
  });
}

function applyEmailValidationToLeads(
  leads: Lead[],
  leadId: string,
  validation: LeadEmailValidationUpdate
): Lead[] {
  return leads.map((lead) =>
    lead.id === leadId ? { ...lead, ...validation } : lead
  );
}

function searchRecordsContainLead(
  records: SearchRecord[],
  leadId: string
): boolean {
  return records.some((record) =>
    record.leads?.some((lead) => lead.id === leadId)
  );
}

function applyEmailValidationToRecords(
  records: SearchRecord[],
  leadId: string,
  validation: LeadEmailValidationUpdate
): SearchRecord[] {
  return records.map((record) =>
    record.leads?.some((lead) => lead.id === leadId)
      ? {
          ...record,
          leads: applyEmailValidationToLeads(
            record.leads,
            leadId,
            validation
          ),
        }
      : record
  );
}

function applyContactUpdatesToRecords(
  records: SearchRecord[],
  updates: AgentOneContactUpdate[]
): SearchRecord[] {
  const updatedIds = new Set(updates.map((update) => update.id));
  return records.map((record) =>
    record.leads?.some((lead) => updatedIds.has(lead.id))
      ? {
          ...record,
          leads: mergeAgentOneContactUpdates(record.leads, updates),
        }
      : record
  );
}

function updateTiming(
  progress: BulkSearchProgress,
  completed: number,
  workers: number
): Pick<BulkSearchProgress, "elapsedMs" | "estimatedRemainingMs"> {
  const startedAt = progress.startedAt ?? Date.now();
  const elapsedMs = Date.now() - startedAt;
  return {
    elapsedMs,
    estimatedRemainingMs: estimateRemainingMs(
      completed,
      progress.totalCount,
      elapsedMs,
      workers
    ),
  };
}

export const useLeadStore = create<LeadStore>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      userName: "Panek Puglesi",
      recentSearches: initialSearches.slice(0, RECENT_SEARCHES_LIMIT),
      fullSearchHistory: [...initialSearches],
      sectorHistory: [],
      lastBulkSearchSectors: "",
      lastBulkSearchLocation: "",
      currentLeads: [],
      savedLeads: [],
      importedLeads: [],
      currentKeyword: "",
      currentLocation: "",
      isSearching: false,
      bulkProgress: INITIAL_BULK,
      lastSearchIsLive: false,
      lastSearchSource: "autonomous",
      selectedLeadIds: [],

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      generateMoreLeads: (batchSize = 50) => {
        const { currentKeyword, currentLocation, currentLeads } = get();
        const sectors = parseSectors(currentKeyword);
        if (sectors.length === 0 || !currentLocation.trim()) return 0;

        const settings = useSettingsStore.getState();
        const perSector = Math.min(
          MOCK_MAX_RESULTS,
          Math.max(10, batchSize ?? Math.min(50, settings.getEffectiveMaxResults()))
        );

        const newLeads: Lead[] = [];
        for (const sector of sectors) {
          const resolved = resolveCategory(sector);
          const existing = currentLeads.filter(
            (l) => l.category === resolved || l.category === sector
          ).length;
          newLeads.push(
            ...generateLeadsForSearch(
              sector,
              currentLocation,
              perSector,
              existing
            )
          );
        }

        const before = currentLeads.length;
        const deduped = dedupeLeads([...currentLeads, ...newLeads]);

        set((state) => ({
          currentLeads: deduped,
          bulkProgress: {
            ...state.bulkProgress,
            leadsFound: deduped.length,
          },
        }));

        return deduped.length - before;
      },

      performBulkSearch: async (keywordsInput, location, options = {}) => {
        const sectors = parseSectors(keywordsInput);
        if (sectors.length === 0 || !location.trim()) {
          throw new Error("Setores e localização são obrigatórios");
        }

        const settings = useSettingsStore.getState();
        const config = settings.getSearchConfig();
        const effectiveWorkers = settings.getEffectiveWorkers();
        const startedAt = Date.now();

        set({
          isSearching: true,
          selectedLeadIds: [],
          currentKeyword: sectors.join(" → "),
          currentLocation: location.trim(),
          currentLeads: [],
          bulkProgress: {
            active: true,
            location: location.trim(),
            sectors: sectors.map((s, i) => ({
              sector: s,
              status: "pending" as const,
              queueIndex: i + 1,
              leadsFound: 0,
            })),
            completedCount: 0,
            totalCount: sectors.length,
            leadsFound: 0,
            runningSectors: [],
            startedAt,
            elapsedMs: 0,
            estimatedRemainingMs: estimateRemainingMs(
              0,
              sectors.length,
              0,
              effectiveWorkers
            ),
          },
        });

        const allLeads: Lead[] = [];
        let completed = 0;
        let anyLive = false;
        let lastSource = "autonomous";
        let apiCallsConsumed = 0;
        let liveCalls = 0;
        let mockFallbackCalls = 0;
        let anyCreditExhausted = false;

        await runWithConcurrency(
            sectors,
            effectiveWorkers,
            async (sector, index) => {
              if (!get().isSearching) {
                throw new Error("Busca interrompida");
              }

              const t0 = Date.now();
              set((state) => ({
                bulkProgress: {
                  ...state.bulkProgress,
                  runningSectors: [
                    ...state.bulkProgress.runningSectors,
                    sector,
                  ],
                  sectors: state.bulkProgress.sectors.map((s) =>
                    s.sector === sector
                      ? { ...s, status: "running" }
                      : s.status === "pending" &&
                          config.queueMode === "sequential"
                        ? { ...s, status: "queued" }
                        : s
                  ),
                  ...updateTiming(
                    state.bulkProgress,
                    completed,
                    effectiveWorkers
                  ),
                },
              }));

              try {
                const data = await fetchSector(
                  sector,
                  location.trim(),
                  index,
                  options
                );
                return {
                  sector,
                  index,
                  leads: data.leads,
                  isLive: data.isLive,
                  source: data.source,
                  apiCallConsumed: data.apiCallConsumed ?? false,
                  apiCallsUsed: data.apiCallsUsed,
                  creditExhausted: data.creditExhausted ?? false,
                  error: null,
                  durationMs: Date.now() - t0,
                };
              } catch (e) {
                return {
                  sector,
                  index,
                  leads: [] as Lead[],
                  isLive: false,
                  source: "error",
                  apiCallConsumed: false,
                  creditExhausted: false,
                  error: e instanceof Error ? e.message : "Erro",
                  durationMs: Date.now() - t0,
                };
              }
            },
            (result) => {
              completed++;
              allLeads.push(...result.leads);
              if (result.isLive) anyLive = true;
              if (result.apiCallConsumed) {
                const used = result.apiCallsUsed ?? 1;
                apiCallsConsumed += used;
                if (result.isLive) liveCalls += used;
                else mockFallbackCalls += used;
              }
              if (result.creditExhausted) anyCreditExhausted = true;
              lastSource = result.source;
              const deduped = dedupeLeads(allLeads);

              set((state) => {
                const timing = updateTiming(
                  state.bulkProgress,
                  completed,
                  effectiveWorkers
                );
                const nextPending = state.bulkProgress.sectors.find(
                  (s) => s.status === "pending" || s.status === "queued"
                );

                return {
                  bulkProgress: {
                    ...state.bulkProgress,
                    completedCount: completed,
                    leadsFound: deduped.length,
                    runningSectors: state.bulkProgress.runningSectors.filter(
                      (s) => s !== result.sector
                    ),
                    sectors: state.bulkProgress.sectors.map((s) => {
                      if (s.sector === result.sector) {
                        return {
                          ...s,
                          status: result.error ? "error" : "done",
                          leadsFound: result.leads.length,
                          error: result.error ?? undefined,
                          durationMs: result.durationMs,
                        };
                      }
                      if (
                        config.queueMode === "sequential" &&
                        nextPending?.sector === s.sector &&
                        s.status !== "done"
                      ) {
                        return { ...s, status: "queued" as const };
                      }
                      return s;
                    }),
                    ...timing,
                  },
                  currentLeads: deduped,
                };
              });
            }
        );

        const finalLeads = dedupeLeads(allLeads);
        const elapsedMs = Date.now() - startedAt;
        const realSearchFailed =
          options.requireLiveResults &&
          (!anyLive ||
            finalLeads.length === 0 ||
            get().bulkProgress.sectors.some(
              (sector) => sector.status === "error"
            ));
        if (realSearchFailed) {
          set((state) => ({
            isSearching: false,
            currentLeads: [],
            lastSearchIsLive: false,
            lastSearchSource: lastSource,
            bulkProgress: {
              ...state.bulkProgress,
              active: false,
              runningSectors: [],
              elapsedMs,
              estimatedRemainingMs: 0,
            },
          }));
          throw new Error(REAL_SEARCH_UNAVAILABLE_MESSAGE);
        }
        const searchRecordId = `${Date.now()}`;
        const searchDate = new Date().toISOString();
        const batch = useBatchPipelineStore.getState().registerSearchBatch({
          sector: keywordsInput.trim(),
          location: location.trim(),
          foundCount: finalLeads.length,
          searchRecordId,
          createdAt: searchDate,
          leadIds: finalLeads.map((lead) => lead.id),
        });
        const batchedLeads = stampLeadsWithBatchId(finalLeads, batch.batchId);

        const isAutonomousRun =
          settings.searchProfile === "autonomous-24h" ||
          config.provider === "autonomous";
        let autoSavedCount = 0;
        if (
          options.autoSaveResults !== false &&
          (settings.autoSaveLeads || isAutonomousRun) &&
          batchedLeads.length > 0
        ) {
          autoSavedCount = autoSaveAllLeads(batchedLeads, get().saveLead);
        }

        const searchSummary = {
          apiCallsConsumed,
          liveCalls,
          mockFallbackCalls,
          leadsFound: batchedLeads.length,
          elapsedMs,
          creditExhausted: anyCreditExhausted,
          autoSavedCount,
        };

        const usage = useUsageStore.getState();
        usage.ensureCurrentMonth();
        if (
          config.searchProfile === "serpapi" &&
          config.provider === "serpapi" &&
          apiCallsConsumed > 0
        ) {
          usage.recordSerpApiCalls(apiCallsConsumed);
        }
        if (anyCreditExhausted) usage.markCreditExhausted();
        usage.setLastSearchSummary(searchSummary);

        const search: SearchRecord = {
          id: searchRecordId,
          keyword: keywordsInput.trim(),
          location: location.trim(),
          resultsCount: batchedLeads.length,
          date: searchDate,
          leads: batchedLeads,
          batchId: batch.batchId,
        };

        set((state) => {
          const withoutDup = state.fullSearchHistory.filter(
            (r) => r.id !== search.id
          );
          const fullSearchHistory = [search, ...withoutDup].slice(
            0,
            FULL_HISTORY_LIMIT
          );
          const recentWithoutDup = state.recentSearches.filter(
            (r) => r.id !== search.id
          );

          return {
            isSearching: false,
            currentLeads: batchedLeads,
            currentKeyword: keywordsInput.trim(),
            currentLocation: location.trim(),
            lastSearchIsLive: anyLive,
            lastSearchSource: lastSource,
            lastBulkSearchSectors: keywordsInput.trim(),
            lastBulkSearchLocation: location.trim(),
            sectorHistory: mergeSectorHistory(state.sectorHistory, sectors),
            bulkProgress: {
              ...state.bulkProgress,
              active: false,
              completedCount: sectors.length,
              leadsFound: batchedLeads.length,
              runningSectors: [],
              elapsedMs,
              estimatedRemainingMs: 0,
              searchSummary,
            },
            fullSearchHistory,
            recentSearches: [search, ...recentWithoutDup].slice(
              0,
              RECENT_SEARCHES_LIMIT
            ),
          };
        });

        // Lifetime floors only rise (never reset on UI clear / batch switch).
        const after = get();
        useLifetimeStatsStore.getState().syncFromPersistedData({
          fullSearchHistory: after.fullSearchHistory,
          recentSearches: after.recentSearches,
          savedLeads: after.savedLeads,
          importedLeads: after.importedLeads,
          campaigns: [],
        });
      },

      clearRecentSearches: () => set({ recentSearches: [] }),

      getHistoryRecord: (recordId) => {
        const state = get();
        return (
          state.fullSearchHistory.find((r) => r.id === recordId) ??
          state.recentSearches.find((r) => r.id === recordId)
        );
      },

      loadSearchFromHistory: (recordId) => {
        const record = get().getHistoryRecord(recordId);
        if (!record) return false;

        const sectors = parseSectors(record.keyword);
        const settings = useSettingsStore.getState();
        const maxResults = settings.getEffectiveMaxResults();
        const leads =
          record.leads && record.leads.length > 0
            ? record.leads
            : (() => {
                const generated: Lead[] = [];
                for (const sector of sectors) {
                  generated.push(
                    ...generateLeadsForSearch(
                      sector,
                      record.location,
                      maxResults
                    )
                  );
                }
                return dedupeLeads(generated);
              })();

        set({
          currentLeads: leads,
          currentKeyword: record.keyword,
          currentLocation: record.location,
          isSearching: false,
          selectedLeadIds: [],
          bulkProgress: {
            active: false,
            location: record.location,
            sectors: sectors.map((s, i) => ({
              sector: s,
              status: "done" as const,
              queueIndex: i + 1,
              leadsFound: leads.filter((l) => l.category === s).length,
            })),
            completedCount: sectors.length,
            totalCount: sectors.length,
            leadsFound: leads.length,
            runningSectors: [],
            startedAt: null,
            elapsedMs: 0,
            estimatedRemainingMs: 0,
          },
        });
        return true;
      },

      exportSearchFromHistory: (recordId) => {
        const record = get().getHistoryRecord(recordId);
        if (!record?.leads?.length) return false;
        const slug = record.location.replace(/\s+/g, "-").toLowerCase();
        exportLeadsToCSV(
          record.leads,
          `pnp-${slug}-${record.date.slice(0, 10)}.csv`
        );
        return true;
      },

      loadSearchResults: (keyword, location) => {
        const sectors = parseSectors(keyword);
        const settings = useSettingsStore.getState();
        const maxResults = settings.getEffectiveMaxResults();
        const allLeads: Lead[] = [];
        for (const sector of sectors) {
          allLeads.push(
            ...generateLeadsForSearch(sector, location, maxResults)
          );
        }
        const deduped = dedupeLeads(allLeads);
        set({
          currentLeads: deduped,
          currentKeyword: keyword,
          currentLocation: location,
          isSearching: false,
          selectedLeadIds: [],
          bulkProgress: {
            active: false,
            location,
            sectors: sectors.map((s, i) => ({
              sector: s,
              status: "done" as const,
              queueIndex: i + 1,
              leadsFound: deduped.filter((l) => l.category === s).length,
            })),
            completedCount: sectors.length,
            totalCount: sectors.length,
            leadsFound: deduped.length,
            runningSectors: [],
            startedAt: null,
            elapsedMs: 0,
            estimatedRemainingMs: 0,
          },
        });
      },

      toggleLeadSelection: (id) =>
        set((state) => ({
          selectedLeadIds: state.selectedLeadIds.includes(id)
            ? state.selectedLeadIds.filter((x) => x !== id)
            : [...state.selectedLeadIds, id],
        })),

      selectAllLeads: (ids) => set({ selectedLeadIds: ids }),

      clearSelection: () => set({ selectedLeadIds: [] }),

      getSelectedLeads: () => {
        const { currentLeads, selectedLeadIds } = get();
        const selected = new Set(selectedLeadIds);
        return currentLeads.filter((lead) => selected.has(lead.id));
      },

      isLeadSaved: (lead) => {
        const fp = leadFingerprint(lead);
        return get().savedLeads.some((s) => leadFingerprint(s) === fp);
      },

      saveLead: (lead) => {
        if (get().isLeadSaved(lead)) return false;
        const activeBatchId =
          lead.batchId ??
          useBatchPipelineStore.getState().activeBatchId ??
          undefined;
        const saved: Lead = {
          ...lead,
          id: `saved-${Date.now()}-${lead.id}`,
          batchId: activeBatchId,
          savedAt: new Date().toISOString(),
        };
        set((state) => ({ savedLeads: [saved, ...state.savedLeads] }));
        return true;
      },

      ensureCurrentSearchBatch: () => {
        const state = get();
        if (state.currentLeads.length === 0) return null;

        const sharedId = getSharedLeadBatchId(state.currentLeads);
        if (sharedId) {
          const pipeline = useBatchPipelineStore.getState();
          const existing = pipeline.getBatch(sharedId);
          const snapshotIds = state.currentLeads.map((lead) => lead.id);
          if (existing) {
            // Ensure exclusive membership is locked to the current snapshot IDs.
            pipeline.upsertBatch({
              ...existing,
              leadIds: snapshotIds,
              foundCount: snapshotIds.length,
            });
            set({
              savedLeads: clearBatchIdFromNonMembers(
                state.savedLeads,
                sharedId,
                snapshotIds
              ),
            });
            pipeline.setActiveBatch(sharedId);
            return sharedId;
          }
          // Leads already stamped but pipeline entry missing — rehydrate metadata.
          const rehydrated = migrateLegacySearchToBatch({
            sector: state.currentKeyword || "Busca",
            location: state.currentLocation || "UK",
            leads: state.currentLeads,
            savedLeads: state.savedLeads,
            recentSearches: state.recentSearches,
            fullSearchHistory: state.fullSearchHistory,
            createdAt: new Date().toISOString(),
          });
          pipeline.upsertBatch(rehydrated.batch);
          set({
            currentLeads: rehydrated.currentLeads,
            savedLeads: rehydrated.savedLeads,
            recentSearches: rehydrated.recentSearches,
            fullSearchHistory: rehydrated.fullSearchHistory,
          });
          return rehydrated.batch.batchId;
        }

        // Legacy completed search: no batchId on results — create lote from existing leads.
        const matchingRecord =
          state.fullSearchHistory.find(
            (r) =>
              !r.batchId &&
              r.keyword.trim().toLowerCase() ===
                state.currentKeyword.trim().toLowerCase() &&
              r.location.trim().toLowerCase() ===
                state.currentLocation.trim().toLowerCase()
          ) ??
          state.recentSearches.find(
            (r) =>
              !r.batchId &&
              r.keyword.trim().toLowerCase() ===
                state.currentKeyword.trim().toLowerCase() &&
              r.location.trim().toLowerCase() ===
                state.currentLocation.trim().toLowerCase()
          );

        const migrated = migrateLegacySearchToBatch({
          sector: state.currentKeyword || "Busca",
          location: state.currentLocation || "UK",
          leads: state.currentLeads,
          savedLeads: state.savedLeads,
          recentSearches: state.recentSearches,
          fullSearchHistory: state.fullSearchHistory,
          createdAt: matchingRecord?.date,
          searchRecordId: matchingRecord?.id,
        });

        useBatchPipelineStore.getState().upsertBatch(migrated.batch);
        set({
          currentLeads: migrated.currentLeads,
          savedLeads: migrated.savedLeads,
          recentSearches: migrated.recentSearches,
          fullSearchHistory: migrated.fullSearchHistory,
        });
        return migrated.batch.batchId;
      },

      openSearchBatchInAgentOne: (recordId) => {
        const record = get().getHistoryRecord(recordId);
        if (!record) return null;

        // Prefer stored snapshot; fall back to matching in-session results only.
        // Never re-run search or fabricate leads for Agent 1 handoff.
        let leads: Lead[] =
          record.leads && record.leads.length > 0 ? [...record.leads] : [];
        if (leads.length === 0) {
          const state = get();
          const sameSession =
            state.currentKeyword.trim().toLowerCase() ===
              record.keyword.trim().toLowerCase() &&
            state.currentLocation.trim().toLowerCase() ===
              record.location.trim().toLowerCase() &&
            state.currentLeads.length > 0;
          if (sameSession) leads = [...state.currentLeads];
        }
        if (leads.length === 0) return null;

        const sectors = parseSectors(record.keyword);
        const applySession = (nextLeads: Lead[]) => {
          set({
            currentLeads: nextLeads,
            currentKeyword: record.keyword,
            currentLocation: record.location,
            isSearching: false,
            selectedLeadIds: [],
            bulkProgress: {
              active: false,
              location: record.location,
              sectors: sectors.map((s, i) => ({
                sector: s,
                status: "done" as const,
                queueIndex: i + 1,
                leadsFound: nextLeads.filter((l) => l.category === s).length,
              })),
              completedCount: sectors.length,
              totalCount: Math.max(sectors.length, 1),
              leadsFound: nextLeads.length,
              runningSectors: [],
              startedAt: null,
              elapsedMs: 0,
              estimatedRemainingMs: 0,
            },
          });
        };

        applySession(leads);

        const snapshotIds = leads.map((lead) => lead.id);

        // Record already has batchId — rehydrate pipeline with exclusive membership.
        if (record.batchId) {
          const pipeline = useBatchPipelineStore.getState();
          const existing = pipeline.getBatch(record.batchId);
          pipeline.upsertBatch(
            createLeadBatch({
              sector: record.keyword,
              location: record.location,
              foundCount: snapshotIds.length,
              createdAt: record.date,
              searchRecordId: record.id,
              batchId: record.batchId,
              stage: existing?.stage ?? "search",
              leadIds: snapshotIds,
              campaignId: existing?.campaignId,
            })
          );
          const stamped = stampLeadsWithBatchId(leads, record.batchId);
          // Detach contaminants from this batch without deleting those leads.
          set((state) => ({
            currentLeads: stamped,
            currentKeyword: record.keyword,
            currentLocation: record.location,
            isSearching: false,
            selectedLeadIds: [],
            savedLeads: clearBatchIdFromNonMembers(
              state.savedLeads,
              record.batchId!,
              snapshotIds
            ),
            recentSearches: state.recentSearches.map((r) =>
              r.id === record.id
                ? {
                    ...r,
                    batchId: record.batchId,
                    leads: stamped,
                    resultsCount: stamped.length,
                  }
                : r
            ),
            fullSearchHistory: state.fullSearchHistory.map((r) =>
              r.id === record.id
                ? {
                    ...r,
                    batchId: record.batchId,
                    leads: stamped,
                    resultsCount: stamped.length,
                  }
                : r
            ),
            bulkProgress: {
              active: false,
              location: record.location,
              sectors: sectors.map((s, i) => ({
                sector: s,
                status: "done" as const,
                queueIndex: i + 1,
                leadsFound: stamped.filter((l) => l.category === s).length,
              })),
              completedCount: sectors.length,
              totalCount: Math.max(sectors.length, 1),
              leadsFound: stamped.length,
              runningSectors: [],
              startedAt: null,
              elapsedMs: 0,
              estimatedRemainingMs: 0,
            },
          }));
          pipeline.setActiveBatch(record.batchId);
          return record.batchId;
        }

        // Legacy search without batchId: create from existing snapshot only.
        return get().ensureCurrentSearchBatch();
      },

      repairBatchMembershipFromSnapshot: (batchId) => {
        const pipeline = useBatchPipelineStore.getState();
        const existing = pipeline.getBatch(batchId);
        if (!existing) return null;

        const state = get();
        const records = [
          ...state.fullSearchHistory,
          ...state.recentSearches,
        ];
        const searchRecord = findSearchRecordForBatch(existing, records);

        const repaired = repairBatchFromSearchSnapshot({
          batch: existing,
          searchRecord,
          currentLeads: state.currentLeads,
          savedLeads: state.savedLeads,
        });

        pipeline.upsertBatch(repaired.batch);

        // Also re-stamp only the owning SearchRecord snapshot leads.
        const stampRecord = (record: SearchRecord): SearchRecord => {
          if (
            record.id !== repaired.batch.searchRecordId &&
            record.batchId !== batchId
          ) {
            return record;
          }
          if (!record.leads || record.leads.length === 0) {
            return {
              ...record,
              batchId: batchId,
              resultsCount:
                repaired.batch.leadIds?.length ?? record.resultsCount,
            };
          }
          const allowed = new Set(repaired.batch.leadIds ?? []);
          return {
            ...record,
            batchId: batchId,
            resultsCount: repaired.batch.leadIds?.length ?? record.leads.length,
            leads: record.leads.map((lead) => {
              if (allowed.has(lead.id)) {
                return { ...lead, batchId };
              }
              if (lead.batchId === batchId) {
                const next = { ...lead };
                delete next.batchId;
                return next;
              }
              return lead;
            }),
          };
        };

        set({
          currentLeads: repaired.currentLeads,
          savedLeads: repaired.savedLeads,
          recentSearches: state.recentSearches.map(stampRecord),
          fullSearchHistory: state.fullSearchHistory.map(stampRecord),
        });

        pipeline.setActiveBatch(batchId);
        return repaired.batch;
      },

      applyAgentOneContactUpdates: (updates) => {
        if (updates.length === 0) return;
        set((state) => ({
          currentLeads: mergeAgentOneContactUpdates(
            state.currentLeads,
            updates
          ),
          savedLeads: mergeAgentOneContactUpdates(state.savedLeads, updates),
          importedLeads: mergeAgentOneContactUpdates(
            state.importedLeads,
            updates
          ),
          recentSearches: applyContactUpdatesToRecords(
            state.recentSearches,
            updates
          ),
          fullSearchHistory: applyContactUpdatesToRecords(
            state.fullSearchHistory,
            updates
          ),
        }));
      },

      updateLeadEmailValidation: (leadId, validation) => {
        const state = get();
        const found =
          state.currentLeads.some((lead) => lead.id === leadId) ||
          state.savedLeads.some((lead) => lead.id === leadId) ||
          state.importedLeads.some((lead) => lead.id === leadId) ||
          searchRecordsContainLead(state.recentSearches, leadId) ||
          searchRecordsContainLead(state.fullSearchHistory, leadId);
        if (!found) return false;
        set((state) => ({
          currentLeads: applyEmailValidationToLeads(
            state.currentLeads,
            leadId,
            validation
          ),
          savedLeads: applyEmailValidationToLeads(
            state.savedLeads,
            leadId,
            validation
          ),
          importedLeads: applyEmailValidationToLeads(
            state.importedLeads,
            leadId,
            validation
          ),
          recentSearches: applyEmailValidationToRecords(
            state.recentSearches,
            leadId,
            validation
          ),
          fullSearchHistory: applyEmailValidationToRecords(
            state.fullSearchHistory,
            leadId,
            validation
          ),
        }));
        return true;
      },

      removeSavedLead: (id) =>
        set((state) => ({
          savedLeads: state.savedLeads.filter((l) => l.id !== id),
        })),

      clearAllSavedLeads: () => set({ savedLeads: [] }),

      importExternalLeads: (leads) => {
        const existingEmails = new Set(
          get()
            .importedLeads.map((l) => l.email?.toLowerCase())
            .filter(Boolean)
        );
        const fresh: Lead[] = [];
        for (const lead of leads) {
          const key = lead.email?.toLowerCase();
          if (!key || existingEmails.has(key)) continue;
          existingEmails.add(key);
          fresh.push(lead);
        }
        if (fresh.length === 0) return [];
        set((state) => ({
          importedLeads: [...fresh, ...state.importedLeads],
        }));
        return fresh;
      },

      clearImportedLeads: () => set({ importedLeads: [] }),
    }),
    {
      name: "pnp-lead-finder",
      version: 4,
      migrate: (persisted, version) => {
        const state = persisted as Partial<LeadStore>;
        if (!state || typeof state !== "object") return persisted;

        const next = { ...state };

        if (version < 2) {
          if (
            (!next.sectorHistory || next.sectorHistory.length === 0) &&
            Array.isArray(next.recentSearches)
          ) {
            const fromRecent: string[] = [];
            for (const record of next.recentSearches) {
              if (record?.keyword) {
                fromRecent.push(...parseSectors(record.keyword));
              }
            }
            if (fromRecent.length > 0) {
              next.sectorHistory = mergeSectorHistory([], fromRecent);
            }
          }
        }

        if (version < 3) {
          if (
            (!next.fullSearchHistory ||
              next.fullSearchHistory.length === 0) &&
            Array.isArray(next.recentSearches)
          ) {
            next.fullSearchHistory = [...next.recentSearches];
          }
          if (Array.isArray(next.recentSearches)) {
            next.recentSearches = next.recentSearches.slice(
              0,
              RECENT_SEARCHES_LIMIT
            );
          }
        }

        if (version < 4) {
          next.importedLeads = next.importedLeads ?? [];
        }

        return next;
      },
      // Session UI (keyword/location/current results) is NOT persisted so each
      // session opens with Nova Busca empty. Durable data remains.
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        recentSearches: state.recentSearches,
        fullSearchHistory: state.fullSearchHistory,
        sectorHistory: state.sectorHistory,
        savedLeads: state.savedLeads,
        importedLeads: state.importedLeads,
      }),
    }
  )
);
