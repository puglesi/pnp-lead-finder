import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Lead } from "@/types/lead";
import type { CampaignProfileId } from "@/types/campaign-profile";
import {
  claimNextAgentThreeItem,
  blockAgentThreeSendingItem,
  finishAgentThree,
  configureAgentThreeIntervals,
  configureAgentThreeLimit,
  createInitialAgentThreeSnapshot,
  loadAgentThreeLeads,
  normalizeAgentThreeSnapshot,
  pauseAgentThree,
  prepareAgentThreeCampaign,
  resumeAgentThree,
  selectAgentThreeCampaign,
  selectAgentThreeProfile,
  selectPersistedAgentThreeSnapshot,
  startAgentThree,
  stopAgentThree,
  type AgentThreeLoadResult,
  type AgentThreePreparationResult,
  type AgentThreeQueueItem,
  type AgentThreeExclusionReason,
  type AgentThreeSnapshot,
  type AgentThreeStartResult,
} from "@/lib/agent-three-queue";
import type { GlobalDeduplicationPreview } from "@/lib/global-email-deduplication";
import {
  applyAgentThreeSmtpResult,
  type AgentThreeDeliveryApplication,
} from "@/lib/agent-three-delivery";
import type { AgentThreeSmtpResult } from "@/lib/agent-three-smtp-contract";

interface AgentThreeStore extends AgentThreeSnapshot {
  selectProfile: (profileId: CampaignProfileId) => void;
  selectCampaign: (
    profileId: CampaignProfileId,
    campaignId: string | null
  ) => void;
  configureLimit: (
    profileId: CampaignProfileId,
    numericLimit: number,
    untilQueueEnds: boolean
  ) => void;
  configureIntervals: (
    profileId: CampaignProfileId,
    minIntervalSeconds: number,
    maxIntervalSeconds: number
  ) => void;
  loadLeads: (
    profileId: CampaignProfileId,
    campaignId: string,
    leads: Lead[],
    quantity: number
  ) => AgentThreeLoadResult;
  prepareCampaign: (
    profileId: CampaignProfileId,
    campaignId: string,
    leads: Lead[]
  ) => AgentThreePreparationResult;
  start: (
    profileId: CampaignProfileId,
    providerConfigured?: boolean
  ) => AgentThreeStartResult;
  pause: (profileId: CampaignProfileId) => void;
  resume: (
    profileId: CampaignProfileId,
    providerConfigured?: boolean
  ) => AgentThreeStartResult;
  stop: (profileId: CampaignProfileId) => void;
  claimNext: (profileId: CampaignProfileId) => AgentThreeQueueItem | null;
  applyDeduplicationPreview: (
    profileId: CampaignProfileId,
    campaignId: string,
    preview: GlobalDeduplicationPreview
  ) => void;
  blockClaimed: (
    profileId: CampaignProfileId,
    itemId: string,
    message: string,
    reason: AgentThreeExclusionReason
  ) => void;
  applyDeliveryResult: (
    profileId: CampaignProfileId,
    itemId: string,
    result: AgentThreeSmtpResult
  ) => AgentThreeDeliveryApplication;
  finish: (profileId: CampaignProfileId) => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

export const useAgentThreeStore = create<AgentThreeStore>()(
  persist(
    (set) => ({
      ...createInitialAgentThreeSnapshot(),

      selectProfile: (profileId) =>
        set((state) => selectAgentThreeProfile(state, profileId)),

      selectCampaign: (profileId, campaignId) =>
        set((state) =>
          selectAgentThreeCampaign(state, profileId, campaignId, nowIso())
        ),

      configureLimit: (profileId, numericLimit, untilQueueEnds) =>
        set((state) =>
          configureAgentThreeLimit(
            state,
            profileId,
            numericLimit,
            untilQueueEnds,
            nowIso()
          )
        ),

      configureIntervals: (
        profileId,
        minIntervalSeconds,
        maxIntervalSeconds
      ) =>
        set((state) =>
          configureAgentThreeIntervals(
            state,
            profileId,
            minIntervalSeconds,
            maxIntervalSeconds,
            nowIso()
          )
        ),

      loadLeads: (profileId, campaignId, leads, quantity) => {
        let result = loadAgentThreeLeads(
          createInitialAgentThreeSnapshot(),
          profileId,
          campaignId,
          [],
          0,
          nowIso()
        );
        set((state) => {
          result = loadAgentThreeLeads(
            state,
            profileId,
            campaignId,
            leads,
            quantity,
            nowIso()
          );
          return result.snapshot;
        });
        return result;
      },

      prepareCampaign: (profileId, campaignId, leads) => {
        let result: AgentThreePreparationResult = {
          snapshot: createInitialAgentThreeSnapshot(),
          eligibleCount: 0,
          preparedCount: 0,
          removedCount: 0,
        };
        set((state) => {
          result = prepareAgentThreeCampaign(
            state,
            profileId,
            campaignId,
            leads,
            nowIso()
          );
          return result.snapshot;
        });
        return result;
      },

      start: (profileId, providerConfigured = false) => {
        let result: AgentThreeStartResult = {
          snapshot: createInitialAgentThreeSnapshot(),
          started: false,
          message: null,
        };
        set((state) => {
          result = startAgentThree(
            state,
            profileId,
            providerConfigured,
            nowIso()
          );
          return result.snapshot;
        });
        return result;
      },

      pause: (profileId) =>
        set((state) => pauseAgentThree(state, profileId, nowIso())),

      resume: (profileId, providerConfigured = false) => {
        let result: AgentThreeStartResult = {
          snapshot: createInitialAgentThreeSnapshot(),
          started: false,
          message: null,
        };
        set((state) => {
          result = resumeAgentThree(
            state,
            profileId,
            providerConfigured,
            nowIso()
          );
          return result.snapshot;
        });
        return result;
      },

      stop: (profileId) =>
        set((state) => stopAgentThree(state, profileId, nowIso())),

      claimNext: (profileId) => {
        let item: AgentThreeQueueItem | null = null;
        set((state) => {
          const claimed = claimNextAgentThreeItem(
            state,
            profileId,
            nowIso()
          );
          item = claimed.item;
          return claimed.snapshot;
        });
        return item;
      },

      applyDeduplicationPreview: (profileId, campaignId, preview) =>
        set((state) => {
          const operation = state.operations[profileId];
          const byLead = new Map(
            preview.decisions.map((decision) => [decision.leadId, decision])
          );
          const byEmail = new Map(
            preview.decisions
              .filter((decision) => decision.normalizedEmail)
              .map((decision) => [decision.normalizedEmail!, decision])
          );
          const globalReasons = new Set<AgentThreeExclusionReason>([
            "already_contacted",
            "unsubscribed",
            "permanent_bounce",
            "contact_blocked",
            "send_locked",
          ]);
          const queue = operation.queue.map((item) => {
            if (item.campaignId !== campaignId || item.queueStatus === "sent") {
              return item;
            }
            const decision =
              byLead.get(item.leadId) ??
              (item.normalizedEmail
                ? byEmail.get(item.normalizedEmail)
                : undefined);
            if (!decision) return item;
            if (decision.included) {
              if (!item.exclusionReason || !globalReasons.has(item.exclusionReason)) {
                return item;
              }
              return {
                ...item,
                queueStatus: "pending" as const,
                exclusionReason: undefined,
                errorMessage: undefined,
              };
            }
            let exclusionReason: AgentThreeExclusionReason = "already_contacted";
            if (decision.code === "duplicate_in_batch") exclusionReason = "duplicate";
            if (decision.reason === "Descadastrado") exclusionReason = "unsubscribed";
            if (decision.reason === "Bounce permanente") exclusionReason = "permanent_bounce";
            if (decision.reason === "Contato bloqueado") exclusionReason = "contact_blocked";
            if (decision.code === "invalid_email") exclusionReason = "invalid_request";
            return {
              ...item,
              queueStatus: "blocked" as const,
              exclusionReason,
              errorMessage: decision.reason,
            };
          });
          return {
            ...state,
            operations: {
              ...state.operations,
              [profileId]: { ...operation, queue },
            },
          };
        }),

      blockClaimed: (profileId, itemId, message, reason) =>
        set((state) =>
          blockAgentThreeSendingItem(
            state,
            profileId,
            itemId,
            message,
            nowIso(),
            reason
          )
        ),

      applyDeliveryResult: (profileId, itemId, smtpResult) => {
        let application: AgentThreeDeliveryApplication = {
          snapshot: createInitialAgentThreeSnapshot(),
          shouldPause: false,
          stopReason: null,
          isSystemic: false,
        };
        set((state) => {
          application = applyAgentThreeSmtpResult(
            state,
            profileId,
            itemId,
            smtpResult,
            nowIso()
          );
          return application.snapshot;
        });
        return application;
      },

      finish: (profileId) =>
        set((state) => finishAgentThree(state, profileId, nowIso())),
    }),
    {
      name: "pnp-agent-three",
      version: 1,
      partialize: (state) => selectPersistedAgentThreeSnapshot(state),
      merge: (persisted, current) => ({
        ...current,
        ...normalizeAgentThreeSnapshot(persisted),
      }),
    }
  )
);
