"use client";

import { useCallback, useEffect, useState } from "react";
import { useSettingsStore } from "@/store/settings-store";
import { useUsageStore } from "@/store/usage-store";
import type { ProviderStatusResponse } from "@/types/search";

let cachedStatus: ProviderStatusResponse | null = null;
let inflight: Promise<ProviderStatusResponse> | null = null;

export function fetchSerpApiStatus(
  serpApiKey?: string
): Promise<ProviderStatusResponse> {
  const qs = serpApiKey?.trim()
    ? `?serpApiKey=${encodeURIComponent(serpApiKey.trim())}`
    : "";
  if (!inflight) {
    inflight = fetch(`/api/search/status${qs}`)
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
  const serpApiKey = useSettingsStore((s) => s.serpApiKey);
  const remaining = useUsageStore((s) => s.getRemainingSerpApi());
  const creditExhausted = useUsageStore((s) => s.creditExhausted);
  const ensureCurrentMonth = useUsageStore((s) => s.ensureCurrentMonth);
  const [status, setStatus] = useState<ProviderStatusResponse | null>(
    cachedStatus
  );

  const refresh = useCallback(async () => {
    ensureCurrentMonth();
    const data = await fetchSerpApiStatus(serpApiKey);
    setStatus(data);
    return data;
  }, [serpApiKey, ensureCurrentMonth]);

  useEffect(() => {
    refresh().catch(() => setStatus(null));
  }, [refresh]);

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