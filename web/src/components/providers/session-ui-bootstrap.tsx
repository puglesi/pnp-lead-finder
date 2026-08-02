"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  shouldSkipSessionUiReset,
  syncCompletedCampaignsAndBatches,
  clearUiSessionState,
} from "@/lib/clear-ui-session";

const SESSION_FLAG = "pnp-ui-session-bootstrapped-v1";

/**
 * Once per browser tab session:
 * - open Dashboard/UI neutral (no form restore)
 * - sync completed campaigns → Concluída + batch Envio concluído
 * Skips wipe when URL carries batchId / campaign deep link.
 */
export function SessionUiBootstrap() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        await syncCompletedCampaignsAndBatches();
      } catch {
        // ignore bootstrap sync errors
      }

      if (cancelled) return;
      if (typeof window === "undefined") return;
      if (sessionStorage.getItem(SESSION_FLAG)) return;

      const search = searchParams?.toString() ?? window.location.search;
      const path = pathname || window.location.pathname;
      if (shouldSkipSessionUiReset(path, search)) {
        sessionStorage.setItem(SESSION_FLAG, "1");
        return;
      }

      try {
        await clearUiSessionState();
      } catch {
        // ignore
      }
      sessionStorage.setItem(SESSION_FLAG, "1");
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [pathname, searchParams]);

  return null;
}
