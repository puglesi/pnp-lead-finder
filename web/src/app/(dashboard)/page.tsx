"use client";

import { Suspense, useSyncExternalStore } from "react";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { ActiveModeBanner } from "@/components/dashboard/active-mode-banner";
import { LocalProductionPanel } from "@/components/dashboard/local-production-panel";
import { ActiveModeBadge } from "@/components/dashboard/active-mode-badge";
import { ProviderStatusBadge } from "@/components/dashboard/provider-status-badge";
import { SerpApiPlanBanner } from "@/components/dashboard/serpapi-plan-banner";
import { SerpApiActiveStatus } from "@/components/dashboard/serpapi-active-status";
import { useSettingsStore } from "@/store/settings-store";

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

export default function DashboardPage() {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot
  );
  const mode = useSettingsStore((s) => s.getActiveQuickSearchMode());
  const renderMode = hydrated ? mode : "autonomous-24h";
  const isPremium = renderMode === "serpapi";

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <ActiveModeBanner />
      <LocalProductionPanel compact />
      {isPremium && <SerpApiActiveStatus />}
      {isPremium ? <SerpApiPlanBanner /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <ActiveModeBadge hydrated={hydrated} />
        <ProviderStatusBadge hydrated={hydrated} />
      </div>
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Carregando dashboard…</p>
        }
      >
        <DashboardTabs />
      </Suspense>
    </div>
  );
}
