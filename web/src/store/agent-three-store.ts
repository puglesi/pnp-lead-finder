import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Lead } from "@/types/lead";
import type { CampaignProfileId } from "@/types/campaign-profile";
import {
  claimNextAgentThreeItem,
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
  type AgentThreeSnapshot,
  type AgentThreeStartResult,
} from "@/lib/agent-three-queue";
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

      applyDeliveryResult: (profileId, itemId, smtpResult) => {
        let application: AgentThreeDeliveryApplication = {
          snapshot: createInitialAgentThreeSnapshot(),
          shouldPause: false,
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
