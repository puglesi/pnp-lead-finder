"use client";

import { useState } from "react";
import { History, LayoutDashboard } from "lucide-react";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { QuickSearch } from "@/components/dashboard/quick-search";
import { OneClickOutreach } from "@/components/outreach/one-click-outreach";
import { BulkSearchProgress } from "@/components/dashboard/bulk-search-progress";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecentSearches } from "@/components/dashboard/recent-searches";
import { SearchedSectorsHistory } from "@/components/dashboard/searched-sectors-history";
import { cn } from "@/lib/utils";

type DashboardTab = "overview" | "history";

const TABS: { id: DashboardTab; label: string; icon: typeof LayoutDashboard }[] =
  [
    { id: "overview", label: "Visão Geral", icon: LayoutDashboard },
    { id: "history", label: "Histórico", icon: History },
  ];

export function DashboardTabs() {
  const [tab, setTab] = useState<DashboardTab>("overview");

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-xl border border-border/60 bg-background/50 p-1">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
                active
                  ? "bg-primary/15 text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" ? (
        <div className="space-y-8">
          <StatsCards />
          <OneClickOutreach cardStorageKey="dashboard-one-click-outreach" />
          <BulkSearchProgress />
          <QuickSearch cardStorageKey="dashboard-search-volume" />
          <RecentSearches />
        </div>
      ) : (
        <div className="space-y-8">
          <SearchedSectorsHistory />
          <RecentSearches />
          <Button variant="outline" asChild>
            <Link href="/historico">
              Abrir histórico completo de buscas
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
