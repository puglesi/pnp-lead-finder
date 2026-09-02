"use client";

import { useEffect } from "react";
import { AlertTriangle, Database, Loader2 } from "lucide-react";
import {
  LOCAL_DATA_CHECKING_MESSAGE,
  LOCAL_DATA_UNAVAILABLE_MESSAGE,
  fetchLocalHydration,
  persistCommercialStore,
  probeLocalDataHealth,
  recoverBrowserCacheIntoSqlite,
  serializeStoreState,
  setLocalDataAvailability,
  useLocalDataAvailability,
} from "@/lib/local-data-client";
import type { CommercialStoreKey, LocalDataHydration } from "@/types/local-data";
import { sqliteWinsArrayMerge } from "@/lib/store-rehydrate";
import { useLeadStore } from "@/store/lead-store";
import { useCampaignStore } from "@/store/campaign-store";
import { useEmailTemplateStore } from "@/store/email-template-store";
import { useEmailBlocklistStore } from "@/store/email-blocklist-store";
import { useLifetimeStatsStore } from "@/store/lifetime-stats-store";
import { useAgentOneStore } from "@/store/agent-one-store";
import { useAgentTwoStore } from "@/store/agent-two-store";
import { useAgentThreeStore } from "@/store/agent-three-store";
import { useBatchPipelineStore } from "@/store/batch-pipeline-store";
import { useSettingsStore } from "@/store/settings-store";
import { useUsageStore } from "@/store/usage-store";
import { useOfficialHistoryStore } from "@/store/official-history-store";

async function rehydratePersistCaches(): Promise<void> {
  await Promise.all([
    useLeadStore.persist.rehydrate(),
    useCampaignStore.persist.rehydrate(),
    useEmailBlocklistStore.persist.rehydrate(),
    useLifetimeStatsStore.persist.rehydrate(),
    useEmailTemplateStore.persist.rehydrate(),
    useAgentThreeStore.persist.rehydrate(),
    useBatchPipelineStore.persist.rehydrate(),
  ]);
}

function hydrateStores(data: LocalDataHydration): void {
  const stores = data.stores;
  if (stores["pnp-lead-finder"]) {
    const incoming = stores["pnp-lead-finder"] as Partial<
      ReturnType<typeof useLeadStore.getState>
    >;
    const current = useLeadStore.getState();
    useLeadStore.setState({
      ...incoming,
      savedLeads: sqliteWinsArrayMerge(
        incoming.savedLeads ?? [],
        current.savedLeads,
        (lead) => lead.id
      ),
      fullSearchHistory: sqliteWinsArrayMerge(
        incoming.fullSearchHistory ?? [],
        current.fullSearchHistory,
        (record) => record.id
      ),
      importedLeads: sqliteWinsArrayMerge(
        incoming.importedLeads ?? [],
        current.importedLeads,
        (lead) => lead.id
      ),
    });
  }
  if (stores["pnp-campaigns"]) {
    const incoming = stores["pnp-campaigns"] as Partial<
      ReturnType<typeof useCampaignStore.getState>
    >;
    useCampaignStore.setState({
      ...incoming,
      campaigns: sqliteWinsArrayMerge(
        incoming.campaigns ?? [],
        useCampaignStore.getState().campaigns,
        (campaign) => campaign.id
      ),
    });
  }
  if (stores["pnp-email-templates"]) {
    const incoming = stores["pnp-email-templates"] as Partial<
      ReturnType<typeof useEmailTemplateStore.getState>
    >;
    useEmailTemplateStore.setState({
      ...incoming,
      templates: sqliteWinsArrayMerge(
        incoming.templates ?? [],
        useEmailTemplateStore.getState().templates,
        (template) => template.id
      ),
    });
  }
  if (stores["pnp-email-blocklist"]) {
    const incoming = stores["pnp-email-blocklist"] as Partial<
      ReturnType<typeof useEmailBlocklistStore.getState>
    >;
    useEmailBlocklistStore.setState({
      ...incoming,
      entries: sqliteWinsArrayMerge(
        incoming.entries ?? [],
        useEmailBlocklistStore.getState().entries,
        (entry) => entry.normalizedEmail || entry.id
      ),
    });
  }
  if (stores["pnp-lifetime-stats"]) {
    useLifetimeStatsStore.setState(stores["pnp-lifetime-stats"] as Partial<ReturnType<typeof useLifetimeStatsStore.getState>>);
  }
  if (stores["pnp-agent-one"]) {
    useAgentOneStore.setState(stores["pnp-agent-one"] as Partial<ReturnType<typeof useAgentOneStore.getState>>);
  }
  if (stores["pnp-agent-two"]) {
    useAgentTwoStore.setState(stores["pnp-agent-two"] as Partial<ReturnType<typeof useAgentTwoStore.getState>>);
  }
  if (stores["pnp-agent-three"]) {
    useAgentThreeStore.setState(stores["pnp-agent-three"] as Partial<ReturnType<typeof useAgentThreeStore.getState>>);
  }
  if (stores["pnp-batch-pipeline"]) {
    useBatchPipelineStore.setState(stores["pnp-batch-pipeline"] as Partial<ReturnType<typeof useBatchPipelineStore.getState>>);
  }
  if (stores["pnp-settings"]) {
    useSettingsStore.setState(stores["pnp-settings"] as Partial<ReturnType<typeof useSettingsStore.getState>>);
  }
  if (stores["pnp-usage"]) {
    useUsageStore.setState(stores["pnp-usage"] as Partial<ReturnType<typeof useUsageStore.getState>>);
  }
  useOfficialHistoryStore.getState().hydrateOfficialHistory({
    sendHistory: data.sendHistory,
    recoveredCampaigns: data.recoveredCampaigns,
  });
}

function selectSettings() {
  const state = useSettingsStore.getState();
  return {
    workers: state.workers,
    delayMs: state.delayMs,
    maxResults: state.maxResults,
    useMaxLeads: state.useMaxLeads,
    queueMode: state.queueMode,
    provider: state.provider,
    searchProfile: state.searchProfile,
    mode24h: state.mode24h,
    autoSaveLeads: state.autoSaveLeads,
    serpapiDeepPagination: state.serpapiDeepPagination,
    autonomousSources: state.autonomousSources,
    autonomousSourceStrategy: state.autonomousSourceStrategy,
    autonomousSingleSource: state.autonomousSingleSource,
    autonomousEnrichWebsites: state.autonomousEnrichWebsites,
    hardwareProfile: state.hardwareProfile,
    profileUserOverride: state.profileUserOverride,
    emailProvider: state.emailProvider,
    autonomousDailySentDate: state.autonomousDailySentDate,
    autonomousDailySentCount: state.autonomousDailySentCount,
    localProductionEnabled: state.localProductionEnabled,
    nightModeAuto: state.nightModeAuto,
    nightModeActive: state.nightModeActive,
    nightScheduleStart: state.nightScheduleStart,
    nightScheduleEnd: state.nightScheduleEnd,
  };
}

function installStoreMirrors(onFailure: (message: string) => void): () => void {
  const timers = new Map<CommercialStoreKey, ReturnType<typeof setTimeout>>();
  const queue = (key: CommercialStoreKey, state: unknown) => {
    const previous = timers.get(key);
    if (previous) clearTimeout(previous);
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        void persistCommercialStore(key, serializeStoreState(state)).catch(
          (error) => onFailure(
            error instanceof Error ? error.message : LOCAL_DATA_UNAVAILABLE_MESSAGE
          )
        );
      }, 75)
    );
  };

  const unsubscribers = [
    useLeadStore.subscribe((state) => queue("pnp-lead-finder", {
      recentSearches: state.recentSearches,
      fullSearchHistory: state.fullSearchHistory,
      sectorHistory: state.sectorHistory,
      savedLeads: state.savedLeads,
      importedLeads: state.importedLeads,
    })),
    useCampaignStore.subscribe((state) => queue("pnp-campaigns", {
      campaigns: state.campaigns,
    })),
    useEmailTemplateStore.subscribe((state) => queue("pnp-email-templates", {
      templates: state.templates,
    })),
    useEmailBlocklistStore.subscribe((state) => queue("pnp-email-blocklist", {
      entries: state.entries,
    })),
    useLifetimeStatsStore.subscribe((state) => queue("pnp-lifetime-stats", state)),
    useAgentOneStore.subscribe((state) => queue("pnp-agent-one", state)),
    useAgentTwoStore.subscribe((state) => queue("pnp-agent-two", state)),
    useAgentThreeStore.subscribe((state) => queue("pnp-agent-three", state)),
    useBatchPipelineStore.subscribe((state) => queue("pnp-batch-pipeline", {
      batches: state.batches,
    })),
    useSettingsStore.subscribe(() => queue("pnp-settings", selectSettings())),
    useUsageStore.subscribe((state) => queue("pnp-usage", state)),
  ];
  return () => {
    for (const timer of timers.values()) clearTimeout(timer);
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}

export function LocalDataBootstrap() {
  const availability = useLocalDataAvailability();

  useEffect(() => {
    let disposed = false;
    let uninstall = () => {};
    setLocalDataAvailability("checking");

    const confirmUnavailable = async (message: string) => {
      const status = await probeLocalDataHealth();
      if (disposed || status === "available") return;
      setLocalDataAvailability("unavailable", message);
    };

    void (async () => {
      const status = await probeLocalDataHealth();
      if (disposed) return;
      if (status !== "available") return;

      try {
        // Recover cache-only records first; server-side recovery never replaces
        // existing SQLite entities. Hydration then makes SQLite win in memory.
        await recoverBrowserCacheIntoSqlite();
        const hydration = await fetchLocalHydration();
        if (disposed) return;
        hydrateStores(hydration);
        await rehydratePersistCaches();
        if (disposed) return;
        uninstall = installStoreMirrors((message) => {
          void confirmUnavailable(message);
        });
        useSettingsStore.getState().resetAutonomousDailyCountIfNeeded();
        setLocalDataAvailability("available");
      } catch {
        if (disposed) return;
        const confirmed = await probeLocalDataHealth();
        if (disposed) return;
        await rehydratePersistCaches();
        if (disposed || confirmed === "available") {
          uninstall = installStoreMirrors((message) => {
            void confirmUnavailable(message);
          });
          return;
        }
      }
    })();

    return () => {
      disposed = true;
      uninstall();
    };
  }, []);

  if (availability === "checking") {
    return (
      <div
        role="status"
        className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 border-b border-amber-500/40 bg-amber-950/90 px-4 py-2 text-sm font-medium text-amber-50"
      >
        <Loader2 className="size-4 shrink-0 animate-spin" />
        <Database className="size-4 shrink-0" />
        {LOCAL_DATA_CHECKING_MESSAGE}
      </div>
    );
  }

  if (availability !== "unavailable") return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 border-b border-red-500/70 bg-red-950 px-4 py-3 text-sm font-semibold text-red-50 shadow-xl"
    >
      <AlertTriangle className="size-5 shrink-0" />
      <Database className="size-5 shrink-0" />
      {LOCAL_DATA_UNAVAILABLE_MESSAGE}
    </div>
  );
}

export { LOCAL_DATA_HEALTH_CHANGE_EVENT } from "@/lib/local-data-client";
