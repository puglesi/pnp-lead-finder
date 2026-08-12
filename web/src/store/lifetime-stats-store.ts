import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  computeLifetimeStats,
  raiseLifetimeFloors,
  type LifetimeStats,
  type LifetimeStatsInput,
} from "@/lib/lifetime-stats";
import { normalizeLifetimePersistSlice } from "@/lib/store-rehydrate";

interface LifetimeStatsStore {
  /** High-water floors — never decrease when UI/session is cleared. */
  companiesFound: number;
  leadsFound: number;
  validEmailsFound: number;
  campaignsSent: number;
  syncFromPersistedData: (input: LifetimeStatsInput) => LifetimeStats;
  recordSearchCompanies: (count: number) => void;
  recordLeadsFound: (count: number) => void;
  recordValidEmails: (count: number) => void;
  recordCampaignSent: () => void;
  getFloors: () => Pick<
    LifetimeStats,
    "companiesFound" | "leadsFound" | "validEmailsFound" | "campaignsSent"
  >;
}

export const useLifetimeStatsStore = create<LifetimeStatsStore>()(
  persist(
    (set, get) => ({
      companiesFound: 0,
      leadsFound: 0,
      validEmailsFound: 0,
      campaignsSent: 0,

      getFloors: () => {
        const s = get();
        return {
          companiesFound: s.companiesFound,
          leadsFound: s.leadsFound,
          validEmailsFound: s.validEmailsFound,
          campaignsSent: s.campaignsSent,
        };
      },

      syncFromPersistedData: (input) => {
        const current = get().getFloors();
        let derived: LifetimeStats;
        try {
          derived = computeLifetimeStats({
            ...input,
            floors: current,
          });
        } catch {
          // Nested legacy campaign/lead fields must never abort Dashboard sync.
          derived = {
            companiesFound: current.companiesFound,
            leadsFound: current.leadsFound,
            validEmailsFound: current.validEmailsFound,
            campaignsSent: current.campaignsSent,
            campaignsActive: 0,
          };
        }
        const raised = raiseLifetimeFloors(current, derived);
        // Avoid set() when unchanged — prevents re-render churn on Dashboard.
        if (
          raised.companiesFound !== current.companiesFound ||
          raised.leadsFound !== current.leadsFound ||
          raised.validEmailsFound !== current.validEmailsFound ||
          raised.campaignsSent !== current.campaignsSent
        ) {
          set(raised);
        }
        return {
          ...derived,
          ...raised,
          campaignsActive: derived.campaignsActive,
        };
      },

      recordSearchCompanies: (count) => {
        if (count <= 0) return;
        set((state) => ({
          companiesFound: state.companiesFound + count,
        }));
      },

      recordLeadsFound: (count) => {
        if (count <= 0) return;
        set((state) => ({
          leadsFound: Math.max(state.leadsFound, state.leadsFound + count),
        }));
      },

      recordValidEmails: (count) => {
        if (count <= 0) return;
        set((state) => ({
          validEmailsFound: Math.max(
            state.validEmailsFound,
            state.validEmailsFound + count
          ),
        }));
      },

      recordCampaignSent: () => {
        set((state) => ({
          campaignsSent: state.campaignsSent + 1,
        }));
      },
    }),
    {
      name: "pnp-lifetime-stats",
      version: 1,
      migrate: (persisted) => normalizeLifetimePersistSlice(persisted),
      merge: (persisted, current) => {
        const normalized = normalizeLifetimePersistSlice(persisted);
        return {
          ...current,
          ...normalized,
        };
      },
    }
  )
);
