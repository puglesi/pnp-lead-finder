import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  INITIAL_AGENT_ONE_SNAPSHOT,
  addAgentOneSector,
  claimNextAgentOneSector,
  completeAgentOneSector,
  failAgentOne,
  failAgentOneSector,
  finishAgentOne,
  normalizeAgentOneSnapshot,
  pauseAgentOne,
  removeAgentOneSector,
  resumeAgentOne,
  selectPersistedAgentOneSnapshot,
  startAgentOne,
  stopAgentOne,
  updateAgentOneSector,
  type AgentOneSectorInput,
  type AgentOneSectorItem,
  type AgentOneSnapshot,
} from "@/lib/agent-one-queue";

interface AgentOneStore extends AgentOneSnapshot {
  addSector: (input: AgentOneSectorInput) => string;
  updateSector: (id: string, input: AgentOneSectorInput) => void;
  removeSector: (id: string) => void;
  start: () => boolean;
  pause: () => void;
  resume: (currentSearchIsActive?: boolean) => void;
  stop: () => void;
  claimNextSector: () => AgentOneSectorItem | null;
  completeSector: (id: string, foundLeadCount: number) => void;
  failSector: (id: string, errorMessage: string) => void;
  finish: () => void;
  fail: (errorMessage: string) => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createSectorId(): string {
  return globalThis.crypto.randomUUID();
}

export const useAgentOneStore = create<AgentOneStore>()(
  persist(
    (set) => ({
      ...INITIAL_AGENT_ONE_SNAPSHOT,

      addSector: (input) => {
        const id = createSectorId();
        set((state) => addAgentOneSector(state, input, id, nowIso()));
        return id;
      },

      updateSector: (id, input) =>
        set((state) => updateAgentOneSector(state, id, input)),

      removeSector: (id) =>
        set((state) => removeAgentOneSector(state, id)),

      start: () => {
        let didStart = false;
        set((state) => {
          const next = startAgentOne(state);
          didStart = next !== state;
          return next;
        });
        return didStart;
      },

      pause: () => set((state) => pauseAgentOne(state)),

      resume: (currentSearchIsActive = false) =>
        set((state) => resumeAgentOne(state, currentSearchIsActive)),

      stop: () => set((state) => stopAgentOne(state)),

      claimNextSector: () => {
        let claimed: AgentOneSectorItem | null = null;
        set((state) => {
          const result = claimNextAgentOneSector(state, nowIso());
          claimed = result.sector;
          return result.snapshot;
        });
        return claimed;
      },

      completeSector: (id, foundLeadCount) =>
        set((state) =>
          completeAgentOneSector(state, id, foundLeadCount, nowIso())
        ),

      failSector: (id, errorMessage) =>
        set((state) =>
          failAgentOneSector(state, id, errorMessage, nowIso())
        ),

      finish: () => set((state) => finishAgentOne(state)),

      fail: (errorMessage) =>
        set((state) => failAgentOne(state, errorMessage)),
    }),
    {
      name: "pnp-agent-one",
      version: 1,
      partialize: (state) => selectPersistedAgentOneSnapshot(state),
      merge: (persisted, current) => ({
        ...current,
        ...normalizeAgentOneSnapshot(persisted),
      }),
    }
  )
);
