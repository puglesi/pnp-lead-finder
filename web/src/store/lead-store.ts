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
import { leadFingerprint, type Lead, type SearchRecord } from "@/types/lead";
import type { BulkSearchProgress, SearchApiResponse } from "@/types/search";
import type { LeadEmailValidationUpdate } from "@/types/email-validation";

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
      maxResults: settings.maxResults,
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
  return res.json();
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

        const isAutonomousRun =
          settings.searchProfile === "autonomous-24h" ||
          config.provider === "autonomous";
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
          id: `${Date.now()}`,
          keyword: keywordsInput.trim(),
          location: location.trim(),
          resultsCount: finalLeads.length,
          date: new Date().toISOString(),
          leads: finalLeads,
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
            currentLeads: finalLeads,
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
              leadsFound: finalLeads.length,
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
        const saved: Lead = {
          ...lead,
          id: `saved-${Date.now()}-${lead.id}`,
          savedAt: new Date().toISOString(),
        };
        set((state) => ({ savedLeads: [saved, ...state.savedLeads] }));
        return true;
      },

      updateLeadEmailValidation: (leadId, validation) => {
        if (!get().savedLeads.some((lead) => lead.id === leadId)) return false;
        set((state) => ({
          savedLeads: state.savedLeads.map((lead) =>
            lead.id === leadId ? { ...lead, ...validation } : lead
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
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        recentSearches: state.recentSearches,
        fullSearchHistory: state.fullSearchHistory,
        sectorHistory: state.sectorHistory,
        lastBulkSearchSectors: state.lastBulkSearchSectors,
        lastBulkSearchLocation: state.lastBulkSearchLocation,
        currentLeads: state.currentLeads,
        currentKeyword: state.currentKeyword,
        currentLocation: state.currentLocation,
        savedLeads: state.savedLeads,
        importedLeads: state.importedLeads,
      }),
    }
  )
);