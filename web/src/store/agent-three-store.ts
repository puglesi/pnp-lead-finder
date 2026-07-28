import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Lead } from "@/types/lead";
import type { CampaignProfileId } from "@/types/campaign-profile";
import {
  createInitialAgentThreeSnapshot,
  loadAgentThreeLeads,
  normalizeAgentThreeSnapshot,
  pauseAgentThree,
  resumeAgentThree,
  selectAgentThreeCampaign,
  selectAgentThreeProfile,
  selectPersistedAgentThreeSnapshot,
  startAgentThree,
  stopAgentThree,
  type AgentThreeLoadResult,
  type AgentThreeSnapshot,
  type AgentThreeStartResult,
} from "@/lib/agent-three-queue";

interface AgentThreeStore extends AgentThreeSnapshot {
  selectProfile: (profileId: CampaignProfileId) => void;
  selectCampaign: (
    profileId: CampaignProfileId,
    campaignId: string | null
  ) => void;
  loadLeads: (
    profileId: CampaignProfileId,
    campaignId: string,
    leads: Lead[],
    quantity: number
  ) => AgentThreeLoadResult;
  start: (profileId: CampaignProfileId) => AgentThreeStartResult;
  pause: (profileId: CampaignProfileId) => void;
  resume: (profileId: CampaignProfileId) => AgentThreeStartResult;
  stop: (profileId: CampaignProfileId) => void;
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

      start: (profileId) => {
        let result: AgentThreeStartResult = {
          snapshot: createInitialAgentThreeSnapshot(),
          started: false,
          message: null,
        };
        set((state) => {
          result = startAgentThree(state, profileId, false, nowIso());
          return result.snapshot;
        });
        return result;
      },

      pause: (profileId) =>
        set((state) => pauseAgentThree(state, profileId, nowIso())),

      resume: (profileId) => {
        let result: AgentThreeStartResult = {
          snapshot: createInitialAgentThreeSnapshot(),
          started: false,
          message: null,
        };
        set((state) => {
          result = resumeAgentThree(state, profileId, false, nowIso());
          return result.snapshot;
        });
        return result;
      },

      stop: (profileId) =>
        set((state) => stopAgentThree(state, profileId, nowIso())),
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
