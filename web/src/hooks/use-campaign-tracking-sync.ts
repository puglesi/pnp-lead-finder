"use client";

import { useEffect, useRef } from "react";
import { useCampaignStore } from "@/store/campaign-store";

export function useCampaignTrackingSync(
  campaignId: string | undefined,
  enabled = true,
  intervalMs = 20_000
) {
  const syncCampaignTracking = useCampaignStore((s) => s.syncCampaignTracking);
  const active = useRef(false);

  useEffect(() => {
    if (!campaignId || !enabled) return;

    const sync = async () => {
      if (active.current) return;
      active.current = true;
      try {
        await syncCampaignTracking(campaignId);
      } finally {
        active.current = false;
      }
    };

    sync();
    const timer = setInterval(sync, intervalMs);
    return () => clearInterval(timer);
  }, [campaignId, enabled, intervalMs, syncCampaignTracking]);
}