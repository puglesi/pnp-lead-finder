import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Lead } from "@/types/lead";
import type { EmailValidationResult } from "@/types/email-validation";
import {
  INITIAL_AGENT_TWO_SNAPSHOT,
  appendAgentTwoQueue,
  appendAllAgentTwoQueue,
  buildAgentTwoQueue,
  claimNextAgentTwoItem,
  completeAgentTwoItem,
  failAgentTwo,
  failAgentTwoItem,
  finishAgentTwo,
  normalizeAgentTwoSnapshot,
  pauseAgentTwo,
  resumeAgentTwo,
  selectPersistedAgentTwoSnapshot,
  startAgentTwo,
  stopAgentTwo,
  type AgentTwoQueueAppendResult,
  type AgentTwoQueueItem,
  type AgentTwoSnapshot,
  type ConfirmAgentTwoLoad,
} from "@/lib/agent-two-queue";

interface AgentTwoStore extends AgentTwoSnapshot {
  loadQueue: (leads: Lead[], revalidate?: boolean) => AgentTwoQueueItem[];
  appendSample: (leads: Lead[], limit: number) => AgentTwoQueueAppendResult;
  appendAll: (
    leads: Lead[],
    confirmLoad: ConfirmAgentTwoLoad
  ) => AgentTwoQueueAppendResult;
  start: () => boolean;
  pause: () => void;
  resume: (currentValidationIsActive?: boolean) => void;
  stop: () => void;
  claimNextItem: () => AgentTwoQueueItem | null;
  completeItem: (id: string, result: EmailValidationResult) => void;
  failItem: (id: string, errorMessage: string) => void;
  finish: () => void;
  fail: (errorMessage: string) => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

export const useAgentTwoStore = create<AgentTwoStore>()(
  persist(
    (set) => ({
      ...INITIAL_AGENT_TWO_SNAPSHOT,

      loadQueue: (leads, revalidate = false) => {
        const queue = buildAgentTwoQueue(leads, nowIso(), revalidate);
        set({
          status: "idle",
          queue,
          currentItemId: null,
          errorMessage: null,
        });
        return queue;
      },

      appendSample: (leads, limit) => {
        let result: AgentTwoQueueAppendResult = {
          snapshot: INITIAL_AGENT_TWO_SNAPSHOT,
          addedItems: [],
          eligibleCount: 0,
          confirmed: true,
        };
        set((state) => {
          result = appendAgentTwoQueue(state, leads, limit, nowIso());
          return result.snapshot;
        });
        return result;
      },

      appendAll: (leads, confirmLoad) => {
        let result: AgentTwoQueueAppendResult = {
          snapshot: INITIAL_AGENT_TWO_SNAPSHOT,
          addedItems: [],
          eligibleCount: 0,
          confirmed: false,
        };
        set((state) => {
          result = appendAllAgentTwoQueue(
            state,
            leads,
            nowIso(),
            confirmLoad
          );
          return result.snapshot;
        });
        return result;
      },

      start: () => {
        let didStart = false;
        set((state) => {
          const next = startAgentTwo(state);
          didStart = next !== state;
          return next;
        });
        return didStart;
      },

      pause: () => set((state) => pauseAgentTwo(state)),

      resume: (currentValidationIsActive = false) =>
        set((state) => resumeAgentTwo(state, currentValidationIsActive)),

      stop: () => set((state) => stopAgentTwo(state)),

      claimNextItem: () => {
        let claimed: AgentTwoQueueItem | null = null;
        set((state) => {
          const result = claimNextAgentTwoItem(state, nowIso());
          claimed = result.item;
          return result.snapshot;
        });
        return claimed;
      },

      completeItem: (id, result) =>
        set((state) => completeAgentTwoItem(state, id, result)),

      failItem: (id, errorMessage) =>
        set((state) =>
          failAgentTwoItem(state, id, errorMessage, nowIso())
        ),

      finish: () => set((state) => finishAgentTwo(state)),

      fail: (errorMessage) =>
        set((state) => failAgentTwo(state, errorMessage)),
    }),
    {
      name: "pnp-agent-two",
      version: 1,
      partialize: (state) => selectPersistedAgentTwoSnapshot(state),
      merge: (persisted, current) => ({
        ...current,
        ...normalizeAgentTwoSnapshot(persisted),
      }),
    }
  )
);
