import {
  CAMPAIGN_PROFILE_IDS,
  isCampaignProfileId,
  type CampaignProfileId,
} from "../types/campaign-profile.ts";
import type {
  AgentThreeOperationState,
  AgentThreeRecipientSourceMode,
  AgentThreeSnapshot,
} from "./agent-three-queue.ts";

export interface AgentThreeBrowserOperationPreferences {
  currentCampaignId: string | null;
  numericLimit: number;
  untilQueueEnds: boolean;
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
}

export interface AgentThreeBrowserPreferences {
  selectedProfileId: CampaignProfileId;
  recipientSourceMode: AgentThreeRecipientSourceMode;
  importTemplateId: string | null;
  operations: Record<
    CampaignProfileId,
    AgentThreeBrowserOperationPreferences
  >;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeOperationPreferences(
  value: unknown
): Partial<AgentThreeBrowserOperationPreferences> {
  if (!isRecord(value)) return {};
  const preferences: Partial<AgentThreeBrowserOperationPreferences> = {};
  if (typeof value.currentCampaignId === "string" || value.currentCampaignId === null) {
    preferences.currentCampaignId = value.currentCampaignId;
  }
  if (
    typeof value.numericLimit === "number" &&
    Number.isInteger(value.numericLimit) &&
    value.numericLimit >= 1
  ) {
    preferences.numericLimit = value.numericLimit;
  }
  if (typeof value.untilQueueEnds === "boolean") {
    preferences.untilQueueEnds = value.untilQueueEnds;
  }
  if (
    typeof value.minIntervalSeconds === "number" &&
    Number.isFinite(value.minIntervalSeconds) &&
    value.minIntervalSeconds >= 0
  ) {
    preferences.minIntervalSeconds = value.minIntervalSeconds;
  }
  if (
    typeof value.maxIntervalSeconds === "number" &&
    Number.isFinite(value.maxIntervalSeconds) &&
    value.maxIntervalSeconds >= 0
  ) {
    preferences.maxIntervalSeconds = value.maxIntervalSeconds;
  }
  return preferences;
}

export function selectAgentThreeBrowserPreferences(
  snapshot: AgentThreeSnapshot
): AgentThreeBrowserPreferences {
  return {
    selectedProfileId: snapshot.selectedProfileId,
    recipientSourceMode: snapshot.recipientSourceMode ?? "campaign",
    importTemplateId: snapshot.importTemplateId ?? null,
    operations: Object.fromEntries(
      CAMPAIGN_PROFILE_IDS.map((profileId) => {
        const operation = snapshot.operations[profileId];
        return [
          profileId,
          {
            currentCampaignId: operation.currentCampaignId,
            numericLimit: operation.numericLimit,
            untilQueueEnds: operation.untilQueueEnds,
            minIntervalSeconds: operation.minIntervalSeconds,
            maxIntervalSeconds: operation.maxIntervalSeconds,
          },
        ];
      })
    ) as Record<CampaignProfileId, AgentThreeBrowserOperationPreferences>,
  };
}

/**
 * Applies only small browser preferences over the SQLite-hydrated snapshot.
 * Operational evidence (queue, recipients, sent index and history) is never
 * read from localStorage and therefore cannot be duplicated or replace SQLite.
 */
export function mergeAgentThreeBrowserPreferences(
  official: AgentThreeSnapshot,
  persisted: unknown
): AgentThreeSnapshot {
  if (!isRecord(persisted)) return official;
  const rawOperations = isRecord(persisted.operations)
    ? persisted.operations
    : {};
  const operations = Object.fromEntries(
    CAMPAIGN_PROFILE_IDS.map((profileId) => {
      const current = official.operations[profileId];
      const preferences = normalizeOperationPreferences(
        rawOperations[profileId]
      );
      const minIntervalSeconds =
        preferences.minIntervalSeconds ?? current.minIntervalSeconds;
      const requestedMax =
        preferences.maxIntervalSeconds ?? current.maxIntervalSeconds;
      return [
        profileId,
        {
          ...current,
          ...preferences,
          minIntervalSeconds,
          maxIntervalSeconds: Math.max(minIntervalSeconds, requestedMax),
        } satisfies AgentThreeOperationState,
      ];
    })
  ) as Record<CampaignProfileId, AgentThreeOperationState>;

  return {
    ...official,
    selectedProfileId: isCampaignProfileId(persisted.selectedProfileId)
      ? persisted.selectedProfileId
      : official.selectedProfileId,
    recipientSourceMode:
      persisted.recipientSourceMode === "campaign" ||
      persisted.recipientSourceMode === "import"
        ? persisted.recipientSourceMode
        : official.recipientSourceMode,
    importTemplateId:
      typeof persisted.importTemplateId === "string" ||
      persisted.importTemplateId === null
        ? persisted.importTemplateId
        : official.importTemplateId,
    operations,
  };
}
