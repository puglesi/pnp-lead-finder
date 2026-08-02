/**
 * Clears ephemeral UI session state only.
 * NEVER deletes leads, history, campaigns, deliveries, templates, settings, SMTP.
 */
import { INITIAL_AGENT_ONE_SNAPSHOT } from "./agent-one-queue.ts";
import { INITIAL_AGENT_TWO_SNAPSHOT } from "./agent-two-queue.ts";
import { createInitialAgentThreeSnapshot } from "./agent-three-queue.ts";

export const CLEAR_UI_TOAST =
  "Interface limpa. Seus dados salvos foram preservados.";

export type ClearUiSessionResult = {
  preserved: {
    savedLeads: number;
    history: number;
    campaigns: number;
    batches: number;
  };
};

/**
 * Pure description of what clearUiSession must preserve (for tests).
 */
export function getClearUiPreserveContract(): string[] {
  return [
    "savedLeads",
    "fullSearchHistory",
    "recentSearches",
    "campaigns",
    "batches",
    "settings",
    "smtp",
    "templates",
    "deliveryMetrics",
  ];
}

/**
 * Clears active UI/session fields without wiping durable stores.
 * Callers inject store snapshots so this module stays free of circular imports in tests.
 */
export function buildClearedLeadUiState() {
  return {
    currentKeyword: "",
    currentLocation: "",
    currentLeads: [] as import("../types/lead.ts").Lead[],
    selectedLeadIds: [] as string[],
    isSearching: false,
    bulkProgress: {
      active: false as boolean,
      location: "",
      sectors: [] as import("../types/search.ts").SectorProgress[],
      completedCount: 0,
      totalCount: 0,
      leadsFound: 0,
      runningSectors: [] as string[],
      startedAt: null as number | null,
      elapsedMs: 0,
      estimatedRemainingMs: 0,
    },
    lastBulkSearchSectors: "",
    lastBulkSearchLocation: "",
    lastSearchIsLive: false,
    lastSearchSource: "",
  };
}

export function shouldSkipSessionUiReset(pathname: string, search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get("batchId")) return true;
  if (params.get("campaignId")) return true;
  // Deep link to campaign detail /campanhas/[id]
  if (/^\/campanhas\/[^/]+$/.test(pathname) && pathname !== "/campanhas/nova") {
    return true;
  }
  return false;
}

export async function clearUiSessionState(): Promise<ClearUiSessionResult> {
  // Dynamic imports avoid circular deps between stores at module load.
  const [
    { useLeadStore },
    { useBatchPipelineStore },
    { useCampaignStore },
    { useAgentOneStore },
    { useAgentTwoStore },
    { useAgentThreeStore },
  ] = await Promise.all([
    import("../store/lead-store.ts"),
    import("../store/batch-pipeline-store.ts"),
    import("../store/campaign-store.ts"),
    import("../store/agent-one-store.ts"),
    import("../store/agent-two-store.ts"),
    import("../store/agent-three-store.ts"),
  ]);

  const leadBefore = useLeadStore.getState();
  const campaignsBefore = useCampaignStore.getState().campaigns;
  const batchesBefore = useBatchPipelineStore.getState().batches;

  useLeadStore.setState({
    ...buildClearedLeadUiState(),
  });

  useBatchPipelineStore.setState({ activeBatchId: null });

  useCampaignStore.setState({
    sendingCampaignId: null,
    sendingProgress: null,
    sendPaused: false,
  });

  const agentOne = useAgentOneStore.getState();
  if (agentOne.status !== "running" && agentOne.status !== "paused") {
    useAgentOneStore.setState({
      ...INITIAL_AGENT_ONE_SNAPSHOT,
    });
  }

  const agentTwo = useAgentTwoStore.getState();
  if (agentTwo.status !== "running" && agentTwo.status !== "paused") {
    useAgentTwoStore.setState({
      ...INITIAL_AGENT_TWO_SNAPSHOT,
    });
  }

  const agentThree = useAgentThreeStore.getState();
  const initialThree = createInitialAgentThreeSnapshot();
  const nextOps = { ...agentThree.operations };
  for (const profileId of Object.keys(nextOps) as Array<
    keyof typeof nextOps
  >) {
    const op = nextOps[profileId];
    if (op.status === "running" || op.status === "paused") continue;
    nextOps[profileId] = {
      ...initialThree.operations[profileId],
      // Keep profile-level interval/limit prefs; drop selection + queue work.
      numericLimit: op.numericLimit,
      untilQueueEnds: op.untilQueueEnds,
      minIntervalSeconds: op.minIntervalSeconds,
      maxIntervalSeconds: op.maxIntervalSeconds,
      currentCampaignId: null,
    };
  }
  useAgentThreeStore.setState({ operations: nextOps });

  return {
    preserved: {
      savedLeads: leadBefore.savedLeads.length,
      history: leadBefore.fullSearchHistory.length,
      campaigns: campaignsBefore.length,
      batches: Object.keys(batchesBefore).length,
    },
  };
}

/**
 * After rehydrate: mark fully-delivered campaigns Concluída and batch stage complete.
 */
export async function syncCompletedCampaignsAndBatches(): Promise<void> {
  const [{ useCampaignStore }, { useBatchPipelineStore }] = await Promise.all([
    import("../store/campaign-store.ts"),
    import("../store/batch-pipeline-store.ts"),
  ]);
  const { isCampaignFullyDelivered } = await import("./campaign-completion.ts");

  useCampaignStore.getState().normalizeLegacyDeliveryMetrics();

  const campaigns = useCampaignStore.getState().campaigns;
  const pipeline = useBatchPipelineStore.getState();
  for (const campaign of campaigns) {
    if (!campaign.batchId) continue;
    if (!isCampaignFullyDelivered(campaign)) continue;
    pipeline.updateBatchStage(campaign.batchId, "complete");
  }
}
