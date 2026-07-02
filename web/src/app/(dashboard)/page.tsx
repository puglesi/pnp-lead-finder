"use client";

import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { ActiveModeBanner } from "@/components/dashboard/active-mode-banner";
import { LocalProductionPanel } from "@/components/dashboard/local-production-panel";
import { ActiveModeBadge } from "@/components/dashboard/active-mode-badge";
import { ProviderStatusBadge } from "@/components/dashboard/provider-status-badge";
import { SerpApiPlanBanner } from "@/components/dashboard/serpapi-plan-banner";
import { SerpApiActiveStatus } from "@/components/dashboard/serpapi-active-status";
import { useSettingsStore } from "@/store/settings-store";

export default function DashboardPage() {
  const mode = useSettingsStore((s) => s.getActiveQuickSearchMode());
  const isPremium = mode === "serpapi";

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <ActiveModeBanner />
      <LocalProductionPanel compact />
      {isPremium && <SerpApiActiveStatus />}
      {isPremium ? <SerpApiPlanBanner /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <ActiveModeBadge />
        <ProviderStatusBadge />
      </div>
      <DashboardTabs />
    </div>
  );
}