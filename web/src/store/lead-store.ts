import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
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
  createLeadBatchId,
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
import { selectOperationalSearchLeads } from "@/lib/search/targeted-search";
import { normalizeLeadPersistSlice } from "@/lib/store-rehydrate";
import {
  createDurableSearchBatchRepository,
  createInitialPersistedSearchBatch,
  getResumableSectors,
  setActiveSearchBatchId,
} from "@/lib/search/batch-repository";
import type { PersistedSearchBatch } from "@/types/search";
import { assertLocalDataWritable } from "@/lib/local-data-client";

const FULL_HISTORY_LIMIT = 200;
const SEARCH_SECTOR_TIMEOUT_MS = 120_000;

const searchBatchRepository = createDurableSearchBatchRepository();
const pendingLeadAutosaves = new Map<string, Map<string, Lead>>();
let leadAutosaveTimer: ReturnType<typeof setTimeout> | null = null;

function queueDurableLeadAutosave(leads: Lead[]): void {
  for (const lead of leads) {
    if (!lead.batchId) continue;
    const batch = pendingLeadAutosaves.get(lead.batchId) ?? new Map<string, Lead>();
    batch.set(lead.id, lead);
    pendingLeadAutosaves.set(lead.batchId, batch);
  }
  if (pendingLeadAutosaves.size === 0) return;
  useLeadStore.setState((state) => ({
    bulkProgress: { ...state.bulkProgress, persistenceStatus: "saving" },
  }));
  if (leadAutosaveTimer) clearTimeout(leadAutosaveTimer);
  leadAutosaveTimer = setTimeout(async () => {
    leadAutosaveTimer = null;
    const writes = [...pendingLeadAutosaves.entries()];
    pendingLeadAutosaves.clear();
    try {
      let latest: PersistedSearchBatch | null = null;
      for (const [batchId, byId] of writes) {
        latest = await searchBatchRepository.upsertLeads(batchId, [...byId.values()]);
      }
      useLeadStore.setState((state) => ({
        bulkProgress: {
          ...state.bulkProgress,
          persistenceStatus: "saved",
          persistenceError: undefined,
          lastSavedAt: latest?.lastSavedAt ?? state.bulkProgress.lastSavedAt,
          lastActivityAt: latest?.lastActivityAt ?? state.bulkProgress.lastActivityAt,
        },
      }));
    } catch (error) {
      useLeadStore.setState((state) => ({
        bulkProgress: {
          ...state.bulkProgress,
          persistenceStatus: "error",
          persistenceError:
            error instanceof Error ? error.message : "Falha no autosave dos leads",
        },
      }));
    }
  }, 300);
}

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
  /** Internal recovery path. Completed/failed sectors are never requested again. */
  resumeBatchId?: string;
  providerOverride?: PersistedSearchBatch["provider"];
  searchProfileOverride?: PersistedSearchBatch["searchProfile"];
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
  resumeBulkSearch: (batchId: string) => Promise<void>;
  loadPersistedSearchBatch: (batchId: string) => Promise<boolean>;
  getRecoverableSearchBatch: () => Promise<PersistedSearchBatch | null>;
  generateMoreLeads: (batchSize?: number) => number;
  loadSearchResults: (keyword: string, location: string) => void;
  loadSearchFromHistory: (recordId: string) => boolean;
  exportSearchFromHistory: (recordId: string) => boolean;
  exportPersistedSearchBatch: (recordId: string) => Promise<boolean>;
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_SECTOR_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
      keyword: sector,
      location,
      sectorIndex,
      maxResults: options.maxResultsOverride ?? settings.maxResults,
      strictMaxResults: options.maxResultsOverride !== undefined,
      useMaxLeads: settings.useMaxLeads,
      allowArtificialResults:
        (options.providerOverride ?? config.provider) === "mock" &&
        options.allowArtificialResults === true,
      delayMs: config.delayMs,
      provider: options.providerOverride ?? config.provider,
      searchProfile: options.searchProfileOverride ?? settings.searchProfile,
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
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Timeout de ${Math.round(SEARCH_SECTOR_TIMEOUT_MS / 1000)}s ao buscar ${sector}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
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

function applyEmailValidationToLeads(
  leads: Lead[],
  leadId: string,
  validation: LeadEmailValidationUpdate
): Lead[] {
  return leads.map((lead) =>
    lead.id === leadId
      ? { ...lead, ...validation, lastProcessedAt: new Date().toISOString() }
      : lead
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

      generateMoreLeads: () => {
        return 0;
      },

      performBulkSearch: async (keywordsInput, location, options = {}) => {
        assertLocalDataWritable();
        const requestedSectors = parseSectors(keywordsInput);
        if (requestedSectors.length === 0 || !location.trim()) {
          throw new Error("Setores e localização são obrigatórios");
        }

        const settings = useSettingsStore.getState();
        const config = settings.getSearchConfig();
        const effectiveWorkers = settings.getEffectiveWorkers();
        const startedAt = Date.now();
        let checkpoint: PersistedSearchBatch | null = null;
        let persistenceFailed = false;
        let fatalError: Error | null = null;
        let anyLive = false;
        let lastSource = "checkpoint";
        let apiCallsConsumed = 0;
        let liveCalls = 0;
        let mockFallbackCalls = 0;
        let anyCreditExhausted = false;

        try {
          if (options.resumeBatchId) {
            const restored = await searchBatchRepository.getBatch(options.resumeBatchId);
            if (!restored) throw new Error("Checkpoint da busca não encontrado");
            checkpoint = restored;
          } else {
            const createdAt = new Date().toISOString();
            const batchId = createLeadBatchId({
              sector: keywordsInput,
              location: location.trim(),
              createdAt,
              foundCount: 0,
            });
            checkpoint = createInitialPersistedSearchBatch({
              batchId,
              sectorsInput: keywordsInput.trim(),
              sectors: requestedSectors,
              location: location.trim(),
              configuredQuantity: options.maxResultsOverride ?? settings.getEffectiveMaxResults(),
              provider: config.provider,
              searchProfile: config.searchProfile,
              workers: effectiveWorkers,
              now: createdAt,
            });
            await searchBatchRepository.createBatch(checkpoint);
          }

          if (!checkpoint) throw new Error("Falha ao inicializar checkpoint da busca");
          const durableBatchId = checkpoint.batchId;
          const durableLocation = checkpoint.location;
          const durableQuantity = checkpoint.configuredQuantity;
          const durableProvider = checkpoint.provider;
          const durableSearchProfile = checkpoint.searchProfile;
          setActiveSearchBatchId(checkpoint.batchId);
          const initialLeads = stampLeadsWithBatchId(
            await searchBatchRepository.getLeads(checkpoint.batchId),
            checkpoint.batchId
          );
          const sectors = checkpoint.sectors.map((sector) => sector.sector);
          const completedAtStart = checkpoint.sectors.filter(
            (sector) => sector.status === "completed" || sector.status === "failed"
          ).length;

          set({
            isSearching: true,
            selectedLeadIds: [],
            currentKeyword: checkpoint.sectorsInput,
            currentLocation: checkpoint.location,
            currentLeads: initialLeads,
            bulkProgress: {
              batchId: checkpoint.batchId,
              active: true,
              location: checkpoint.location,
              sectors: checkpoint.sectors.map((sector) => ({
                sector: sector.sector,
                status:
                  sector.status === "completed"
                    ? "done"
                    : sector.status === "failed"
                      ? "error"
                      : "pending",
                queueIndex: sector.index + 1,
                leadsFound: sector.leadsFound,
                error: sector.error,
              })),
              completedCount: completedAtStart,
              totalCount: sectors.length,
              leadsFound: initialLeads.length,
              runningSectors: [],
              startedAt,
              elapsedMs: 0,
              estimatedRemainingMs: estimateRemainingMs(
                completedAtStart,
                sectors.length,
                0,
                effectiveWorkers
              ),
              currentStage: checkpoint.currentStage,
              lastActivityAt: checkpoint.lastActivityAt,
              lastSavedAt: checkpoint.lastSavedAt,
              persistenceStatus: "saved",
              failedCount: checkpoint.failedSectors,
            },
          });

          const pendingSectors = getResumableSectors(checkpoint);

          await runWithConcurrency(
            pendingSectors,
            effectiveWorkers,
            async (sectorCheckpoint) => {
              if (persistenceFailed || !get().isSearching) return;
              const sector = sectorCheckpoint.sector;
              const index = sectorCheckpoint.index;
              const t0 = Date.now();

              try {
                const running = await searchBatchRepository.markSectorRunning(
                  durableBatchId,
                  index
                );
                set((state) => ({
                  bulkProgress: {
                    ...state.bulkProgress,
                    runningSectors: [...new Set([...state.bulkProgress.runningSectors, sector])],
                    sectors: state.bulkProgress.sectors.map((item) =>
                      item.queueIndex === index + 1 ? { ...item, status: "running" } : item
                    ),
                    lastActivityAt: running.lastActivityAt,
                    persistenceStatus: "saved",
                  },
                }));

                let data: SearchApiResponse | null = null;
                let itemError: string | undefined;
                try {
                  data = await fetchSector(sector, durableLocation, index, {
                    ...options,
                    maxResultsOverride: durableQuantity,
                  });
                } catch (error) {
                  itemError = error instanceof Error ? error.message : "Erro na busca do setor";
                }

                const saved = await searchBatchRepository.saveSectorResult({
                  batchId: durableBatchId,
                  sectorIndex: index,
                  leads: data?.leads ?? [],
                  error: itemError,
                });
                checkpoint = saved;

                if (data) {
                  anyLive ||= data.isLive;
                  lastSource = data.source;
                  if (data.apiCallConsumed) {
                    const used = data.apiCallsUsed ?? 1;
                    apiCallsConsumed += used;
                    if (data.isLive) liveCalls += used;
                    else mockFallbackCalls += used;
                    if (durableSearchProfile === "serpapi" && durableProvider === "serpapi") {
                      useUsageStore.getState().recordSerpApiCalls(used);
                    }
                  }
                  anyCreditExhausted ||= Boolean(data.creditExhausted);
                  if (data.creditExhausted) useUsageStore.getState().markCreditExhausted();
                }

                const durableLeads = stampLeadsWithBatchId(
                  await searchBatchRepository.getLeads(durableBatchId),
                  durableBatchId
                );
                const completed = saved.completedSectors + saved.failedSectors;
                set((state) => ({
                  currentLeads: durableLeads,
                  bulkProgress: {
                    ...state.bulkProgress,
                    completedCount: completed,
                    leadsFound: durableLeads.length,
                    failedCount: saved.failedSectors,
                    runningSectors: state.bulkProgress.runningSectors.filter(
                      (runningSector) => runningSector !== sector
                    ),
                    sectors: state.bulkProgress.sectors.map((item) =>
                      item.queueIndex === index + 1
                        ? {
                            ...item,
                            status: itemError ? "error" : "done",
                            leadsFound: data?.leads.length ?? 0,
                            requestedCount: data?.requestedCount,
                            foundRealCount: data?.foundRealCount ?? data?.leads.length ?? 0,
                            sourceExhausted: data?.sourceExhausted,
                            providerResultsInspected: data?.providerResultsInspected,
                            insideTargetFound: data?.insideTargetFound,
                            outsideTargetCount: data?.outsideTargetCount,
                            unknownLocationCount: data?.unknownLocationCount,
                            selectedCount:
                              data?.selectedCount ??
                              selectOperationalSearchLeads(
                                data?.leads ?? [],
                                data?.requestedCount ?? durableQuantity
                              ).length,
                            error: itemError,
                            durationMs: Date.now() - t0,
                          }
                        : item
                    ),
                    ...updateTiming(state.bulkProgress, completed, effectiveWorkers),
                    lastActivityAt: saved.lastActivityAt,
                    lastSavedAt: saved.lastSavedAt,
                    persistenceStatus: "saved",
                    persistenceError: undefined,
                  },
                }));
              } catch (error) {
                persistenceFailed = true;
                fatalError = error instanceof Error ? error : new Error("Falha ao salvar checkpoint");
                set((state) => ({
                  bulkProgress: {
                    ...state.bulkProgress,
                    persistenceStatus: "error",
                    persistenceError: fatalError?.message ?? "Falha ao salvar checkpoint",
                    runningSectors: state.bulkProgress.runningSectors.filter(
                      (runningSector) => runningSector !== sector
                    ),
                  },
                }));
              }
            }
          );

          if (fatalError) throw fatalError;

          checkpoint = (await searchBatchRepository.getBatch(checkpoint.batchId)) ?? checkpoint;
          const finalLeads = stampLeadsWithBatchId(
            await searchBatchRepository.getLeads(checkpoint.batchId),
            checkpoint.batchId
          );
          const elapsedMs = Date.now() - startedAt;
          const realSearchFailed =
            options.requireLiveResults && (!anyLive || finalLeads.length === 0);
          if (realSearchFailed) throw new Error(REAL_SEARCH_UNAVAILABLE_MESSAGE);

          const searchRecordId = checkpoint.historyRecordId ?? `${Date.now()}`;
          const requestedTotal =
            durableQuantity * Math.max(1, sectors.length);
          const operationalLeads = selectOperationalSearchLeads(
            finalLeads,
            requestedTotal
          );
          const batch = createLeadBatch({
            sector: checkpoint.sectorsInput,
            location: checkpoint.location,
            foundCount: operationalLeads.length,
            searchRecordId,
            createdAt: checkpoint.createdAt,
            batchId: checkpoint.batchId,
            leadIds: operationalLeads.map((lead) => lead.id),
          });
          useBatchPipelineStore.getState().upsertBatch(batch);

          const isAutonomousRun =
            checkpoint.searchProfile === "autonomous-24h" || checkpoint.provider === "autonomous";
          let autoSavedCount = 0;
          if (
            options.autoSaveResults !== false &&
            (settings.autoSaveLeads || isAutonomousRun) &&
            finalLeads.length > 0
          ) {
            autoSavedCount = autoSaveAllLeads(finalLeads, get().saveLead);
          }

          const searchSummary = {
            apiCallsConsumed,
            liveCalls,
            mockFallbackCalls,
            leadsFound: finalLeads.length,
            elapsedMs,
            creditExhausted: anyCreditExhausted,
            autoSavedCount,
          };
          useUsageStore.getState().setLastSearchSummary(searchSummary);

          const search: SearchRecord = {
            id: searchRecordId,
            keyword: checkpoint.sectorsInput,
            location: checkpoint.location,
            resultsCount: finalLeads.length,
            date: checkpoint.createdAt,
            // Large payload stays in IndexedDB; history keeps only its batch reference.
            batchId: checkpoint.batchId,
          };

          checkpoint = await searchBatchRepository.finishBatch(
            checkpoint.batchId,
            searchRecordId
          );
          const completedCheckpoint = checkpoint;
          set((state) => {
            const fullSearchHistory = [
              search,
              ...state.fullSearchHistory.filter((record) => record.id !== search.id),
            ].slice(0, FULL_HISTORY_LIMIT);
            const recentSearches = [
              search,
              ...state.recentSearches.filter((record) => record.id !== search.id),
            ].slice(0, RECENT_SEARCHES_LIMIT);
            return {
              currentLeads: finalLeads,
              currentKeyword: completedCheckpoint.sectorsInput,
              currentLocation: completedCheckpoint.location,
              lastSearchIsLive: anyLive || options.resumeBatchId !== undefined,
              lastSearchSource: lastSource,
              lastBulkSearchSectors: completedCheckpoint.sectorsInput,
              lastBulkSearchLocation: completedCheckpoint.location,
              sectorHistory: mergeSectorHistory(state.sectorHistory, sectors),
              bulkProgress: {
                ...state.bulkProgress,
                active: false,
                completedCount: sectors.length,
                leadsFound: finalLeads.length,
                runningSectors: [],
                elapsedMs,
                estimatedRemainingMs: 0,
                currentStage: "completed",
                lastActivityAt: completedCheckpoint.lastActivityAt,
                lastSavedAt: completedCheckpoint.lastSavedAt,
                persistenceStatus: "saved",
                failedCount: completedCheckpoint.failedSectors,
                searchSummary,
              },
              fullSearchHistory,
              recentSearches,
            };
          });

          const after = get();
          useLifetimeStatsStore.getState().syncFromPersistedData({
            fullSearchHistory: after.fullSearchHistory,
            recentSearches: after.recentSearches,
            savedLeads: after.savedLeads,
            importedLeads: after.importedLeads,
            campaigns: [],
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Busca interrompida";
          if (!checkpoint) {
            persistenceFailed = true;
            set((state) => ({
              bulkProgress: {
                ...state.bulkProgress,
                persistenceStatus: "error",
                persistenceError: message,
              },
            }));
          }
          if (checkpoint) {
            try {
              checkpoint = await searchBatchRepository.failBatch(checkpoint.batchId, message);
            } catch {
              // A falha original de persistência já está exposta no estado da UI.
            }
          }
          throw error;
        } finally {
          set((state) => ({
            isSearching: false,
            bulkProgress: {
              ...state.bulkProgress,
              active: false,
              runningSectors: [],
              estimatedRemainingMs: 0,
              persistenceStatus: persistenceFailed ? "error" : state.bulkProgress.persistenceStatus,
            },
          }));
        }
      },

      resumeBulkSearch: async (batchId) => {
        const checkpoint = await searchBatchRepository.getBatch(batchId);
        if (!checkpoint) throw new Error("Checkpoint da busca não encontrado");
        await get().performBulkSearch(
          checkpoint.sectorsInput,
          checkpoint.location,
          {
            resumeBatchId: batchId,
            maxResultsOverride: checkpoint.configuredQuantity,
            providerOverride: checkpoint.provider,
            searchProfileOverride: checkpoint.searchProfile,
          }
        );
      },

      loadPersistedSearchBatch: async (batchId) => {
        const checkpoint = await searchBatchRepository.getBatch(batchId);
        if (!checkpoint) return false;
        const leads = stampLeadsWithBatchId(
          await searchBatchRepository.getLeads(batchId),
          batchId
        );
        setActiveSearchBatchId(batchId);
        useBatchPipelineStore.getState().setActiveBatch(batchId);
        set({
          currentLeads: leads,
          currentKeyword: checkpoint.sectorsInput,
          currentLocation: checkpoint.location,
          isSearching: false,
          selectedLeadIds: [],
          bulkProgress: {
            batchId,
            active: false,
            location: checkpoint.location,
            sectors: checkpoint.sectors.map((sector) => ({
              sector: sector.sector,
              status: sector.status === "completed" ? "done" : sector.status === "failed" ? "error" : "pending",
              queueIndex: sector.index + 1,
              leadsFound: sector.leadsFound,
              error: sector.error,
            })),
            completedCount: checkpoint.completedSectors + checkpoint.failedSectors,
            totalCount: checkpoint.sectors.length,
            leadsFound: leads.length,
            runningSectors: [],
            startedAt: null,
            elapsedMs: 0,
            estimatedRemainingMs: 0,
            currentStage: checkpoint.currentStage,
            lastActivityAt: checkpoint.lastActivityAt,
            lastSavedAt: checkpoint.lastSavedAt,
            persistenceStatus: "saved",
            failedCount: checkpoint.failedSectors,
          },
        });
        return true;
      },

      getRecoverableSearchBatch: () =>
        searchBatchRepository.getLatestRecoverableBatch(),

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
        // New durable records keep their payload in IndexedDB. Never fabricate
        // replacements when that payload must be loaded by batchId.
        if (record.batchId && (!record.leads || record.leads.length === 0)) {
          return false;
        }
        const leads =
          record.leads && record.leads.length > 0 ? record.leads : [];
        if (leads.length === 0) return false;

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

      exportPersistedSearchBatch: async (recordId) => {
        const record = get().getHistoryRecord(recordId);
        if (!record) return false;
        if (record.leads?.length) return get().exportSearchFromHistory(recordId);
        if (!record.batchId) return false;
        const leads = await searchBatchRepository.getLeads(record.batchId);
        if (leads.length === 0) return false;
        const slug = record.location.replace(/\s+/g, "-").toLowerCase();
        exportLeadsToCSV(leads, `pnp-${slug}-${record.date.slice(0, 10)}.csv`);
        return true;
      },

      loadSearchResults: (keyword, location) => {
        const sectors = parseSectors(keyword);
        const deduped: Lead[] = [];
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
        assertLocalDataWritable();
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
        assertLocalDataWritable();
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
        assertLocalDataWritable();
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
        const updatedIds = new Set(updates.map((update) => update.id));
        queueDurableLeadAutosave(
          get().currentLeads.filter((lead) => updatedIds.has(lead.id))
        );
      },

      updateLeadEmailValidation: (leadId, validation) => {
        assertLocalDataWritable();
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
        const durableLead = get().currentLeads.find((lead) => lead.id === leadId);
        if (durableLead) queueDurableLeadAutosave([durableLead]);
        return true;
      },

      removeSavedLead: (id) =>
        (assertLocalDataWritable(), set((state) => ({
          savedLeads: state.savedLeads.filter((l) => l.id !== id),
        }))),

      clearAllSavedLeads: () =>
        (assertLocalDataWritable(), set({ savedLeads: [] })),

      importExternalLeads: (leads) => {
        assertLocalDataWritable();
        const existingEmails = new Set(
          get()
            .importedLeads.map((l) =>
              (l.normalizedEmail ?? l.email)?.toLowerCase()
            )
            .filter(Boolean) as string[]
        );
        const fresh: Lead[] = [];
        for (const lead of leads) {
          const key = (lead.normalizedEmail ?? lead.email)?.toLowerCase();
          if (!key || existingEmails.has(key)) continue;
          existingEmails.add(key);
          fresh.push(lead);
        }
        // Also accept re-stamp of existing importBatchId on leads already in store
        // (membership is driven by importBatchId on form, not only "fresh" emails).
        if (fresh.length === 0) {
          // Still update importBatchId on matching emails if provided
          const batchId = leads.find((l) => l.importBatchId)?.importBatchId;
          if (batchId) {
            set((state) => ({
              importedLeads: state.importedLeads.map((existing) => {
                const key = (
                  existing.normalizedEmail ?? existing.email
                )?.toLowerCase();
                const match = leads.find(
                  (l) =>
                    (l.normalizedEmail ?? l.email)?.toLowerCase() === key
                );
                if (!match) return existing;
                return { ...existing, importBatchId: batchId };
              }),
            }));
          }
          return [];
        }
        set((state) => ({
          importedLeads: [...fresh, ...state.importedLeads],
        }));
        return fresh;
      },

      clearImportedLeads: () =>
        (assertLocalDataWritable(), set({ importedLeads: [] })),
    }),
    {
      name: "pnp-lead-finder",
      version: 5,
      migrate: (persisted, version) => {
        const state = persisted as Partial<LeadStore>;
        if (!state || typeof state !== "object") return persisted;

        const next = { ...state };

        if (version < 2) {
          const sectorLen = Array.isArray(next.sectorHistory)
            ? next.sectorHistory.length
            : 0;
          if (sectorLen === 0 && Array.isArray(next.recentSearches)) {
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
          const fullLen = Array.isArray(next.fullSearchHistory)
            ? next.fullSearchHistory.length
            : 0;
          if (fullLen === 0 && Array.isArray(next.recentSearches)) {
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

        // v5+: never leave durable arrays as null after partial legacy payloads.
        // Always re-normalize (even when version already advanced) so a bad write
        // cannot leave null arrays for the next rehydrate.
        const normalized = normalizeLeadPersistSlice(next);
        return {
          ...next,
          ...normalized,
        };
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
      merge: (persisted, current) => {
        const normalized = normalizeLeadPersistSlice(persisted);
        return {
          ...current,
          ...normalized,
        };
      },
    }
  )
);
