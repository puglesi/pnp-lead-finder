import { create } from "zustand";
import type {
  OfficialSendHistoryRecord,
  RecoveredCampaignSummary,
} from "@/types/local-data";

interface OfficialHistoryStore {
  sendHistory: OfficialSendHistoryRecord[];
  recoveredCampaigns: RecoveredCampaignSummary[];
  hydrateOfficialHistory: (input: {
    sendHistory: OfficialSendHistoryRecord[];
    recoveredCampaigns: RecoveredCampaignSummary[];
  }) => void;
}

/** Memory-only read model. Every application start refills it from SQLite. */
export const useOfficialHistoryStore = create<OfficialHistoryStore>((set) => ({
  sendHistory: [],
  recoveredCampaigns: [],
  hydrateOfficialHistory: (input) => set({
    sendHistory: Array.isArray(input.sendHistory) ? input.sendHistory : [],
    recoveredCampaigns: Array.isArray(input.recoveredCampaigns)
      ? input.recoveredCampaigns
      : [],
  }),
}));
