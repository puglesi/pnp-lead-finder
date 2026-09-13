"use client";

import { useCallback, useEffect, useState } from "react";
import { useSettingsStore } from "@/store/settings-store";
import { useUsageStore } from "@/store/usage-store";
import type { ProviderStatusResponse } from "@/types/search";

let cachedStatus: ProviderStatusResponse | null = null;
let inflight: Promise<ProviderStatusResponse> | null = null;

export function fetchSerpApiStatus(): Promise<ProviderStatusResponse> {
  if (!inflight) {
    inflight = fetch(`/api/search/status`)
      .then((r) => r.json())
      .then((data: ProviderStatusResponse) => {
        cachedStatus = data;
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useSerpApiStatus() {
  const profile = useSettingsStore((s) => s.searchProfile);
  const remaining = useUsageStore((s) => s.getRemainingSerpApi());
  const creditExhausted = useUsageStore((s) => s.creditExhausted);
  const ensureCurrentMonth = useUsageStore((s) => s.ensureCurrentMonth);
  const [status, setStatus] = useState<ProviderStatusResponse | null>(
    cachedStatus
  );

  const refresh = useCallback(async () => {
    ensureCurrentMonth();
    const data = await fetchSerpApiStatus();
    setStatus(data);
    return data;
  }, [ensureCurrentMonth]);

  useEffect(() => {
    let active = true;
    ensureCurrentMonth();
    void fetchSerpApiStatus()
      .then((data) => {
        if (active) setStatus(data);
      })
      .catch(() => {
        if (active) setStatus(null);
      });
    return () => {
      active = false;
    };
  }, [ensureCurrentMonth]);

  const configured = Boolean(status?.serpapiConfigured);
  const isSerpActive =
    configured && profile === "serpapi" && !creditExhausted;

  return {
    status,
    remaining,
    creditExhausted,
    configured,
    isSerpActive,
    envKeyConfigured: Boolean(status?.envKeyConfigured),
    refresh,
  };
}