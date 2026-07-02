import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SERPAPI_FREE_MONTHLY_LIMIT } from "@/lib/search/volume";
import type { SearchSummary } from "@/types/search";

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

interface UsageStore {
  serpApiUsedThisMonth: number;
  usageMonth: string;
  lastSearchSummary: SearchSummary | null;
  creditExhausted: boolean;
  recordSerpApiCalls: (count: number) => void;
  markCreditExhausted: () => void;
  clearCreditExhausted: () => void;
  setLastSearchSummary: (summary: SearchSummary) => void;
  getRemainingSerpApi: () => number;
  ensureCurrentMonth: () => void;
  resetMonthlyUsage: () => void;
}

export const useUsageStore = create<UsageStore>()(
  persist(
    (set, get) => ({
      serpApiUsedThisMonth: 0,
      usageMonth: currentMonthKey(),
      lastSearchSummary: null,
      creditExhausted: false,

      ensureCurrentMonth: () => {
        const month = currentMonthKey();
        if (get().usageMonth !== month) {
          set({
            usageMonth: month,
            serpApiUsedThisMonth: 0,
            creditExhausted: false,
          });
        }
      },

      recordSerpApiCalls: (count) => {
        get().ensureCurrentMonth();
        if (count <= 0) return;
        set((s) => ({
          serpApiUsedThisMonth: s.serpApiUsedThisMonth + count,
        }));
      },

      markCreditExhausted: () => set({ creditExhausted: true }),

      clearCreditExhausted: () => set({ creditExhausted: false }),

      setLastSearchSummary: (summary) => set({ lastSearchSummary: summary }),

      getRemainingSerpApi: () => {
        get().ensureCurrentMonth();
        return Math.max(
          0,
          SERPAPI_FREE_MONTHLY_LIMIT - get().serpApiUsedThisMonth
        );
      },

      resetMonthlyUsage: () =>
        set({
          serpApiUsedThisMonth: 0,
          usageMonth: currentMonthKey(),
          creditExhausted: false,
        }),
    }),
    { name: "pnp-usage" }
  )
);