"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Ban,
  History,
  LayoutDashboard,
  Megaphone,
  Users,
} from "lucide-react";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { GlobalHistorySearch } from "@/components/dashboard/global-history-search";
import { BlockedEmailsPanel } from "@/components/dashboard/blocked-emails-panel";
import { RecentSearches } from "@/components/dashboard/recent-searches";
import { SearchedSectorsHistory } from "@/components/dashboard/searched-sectors-history";
import { FullSearchHistory } from "@/components/dashboard/full-search-history";
import { SavedLeadsTable } from "@/components/leads/saved-leads-table";
import { CampaignListTable } from "@/components/campaigns/campaign-list-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useLeadStore } from "@/store/lead-store";
import { useCampaignStore } from "@/store/campaign-store";
import { useEmailBlocklistStore } from "@/store/email-blocklist-store";
import { DashboardSectionBoundary } from "@/components/dashboard/dashboard-section-boundary";
import { cn } from "@/lib/utils";
import { OfficialSendHistory } from "@/components/dashboard/official-send-history";
import { useOfficialHistoryStore } from "@/store/official-history-store";

type DashboardTab =
  | "overview"
  | "campaigns"
  | "leads"
  | "history"
  | "blocked";

const TABS: {
  id: DashboardTab;
  label: string;
  icon: typeof LayoutDashboard;
}[] = [
  { id: "overview", label: "Visão Geral", icon: LayoutDashboard },
  { id: "campaigns", label: "Campanhas", icon: Megaphone },
  { id: "leads", label: "Leads", icon: Users },
  { id: "history", label: "Histórico de Buscas e Envios", icon: History },
  { id: "blocked", label: "E-mails Bloqueados", icon: Ban },
];

function parseTab(value: string | null): DashboardTab {
  if (
    value === "campaigns" ||
    value === "leads" ||
    value === "history" ||
    value === "blocked" ||
    value === "overview"
  ) {
    return value;
  }
  return "overview";
}

export function DashboardTabs() {
  const searchParams = useSearchParams();
  const urlTab = parseTab(searchParams.get("tab"));
  const [manualTab, setManualTab] = useState<DashboardTab | null>(null);
  // URL deep-link wins until the user clicks another tab in this session.
  const tab = manualTab ?? urlTab;
  const setTab = (next: DashboardTab) => setManualTab(next);
  const savedLeadsCount = useLeadStore((s) => s.savedLeads?.length ?? 0);
  const campaigns = useCampaignStore((s) => s.campaigns ?? []);
  const recoveredCount = useOfficialHistoryStore(
    (s) => s.recoveredCampaigns.length
  );
  const sendHistoryCount = useOfficialHistoryStore(
    (s) => s.sendHistory.length
  );
  const campaignCount = campaigns.length + recoveredCount;
  const blockedCount = useEmailBlocklistStore((s) => s.entries?.length ?? 0);
  const campaignStats = {
    total: campaigns.length,
    active: campaigns.filter(
      (campaign) => campaign.status === "active" || campaign.status === "paused"
    ).length,
    completed: campaigns.filter((campaign) => campaign.status === "completed").length,
    archived: campaigns.filter((campaign) => campaign.status === "archived").length,
  };

  return (
    <div className="space-y-6">
      <div className="inline-flex max-w-full flex-wrap rounded-xl border border-border/60 bg-background/50 p-1">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          const count =
            item.id === "leads"
              ? savedLeadsCount
              : item.id === "campaigns"
                ? campaignCount
                : item.id === "history"
                  ? sendHistoryCount
                  : item.id === "blocked"
                    ? blockedCount
                    : 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:px-4",
                active
                  ? "bg-primary/15 text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
              {count > 0 && (
                <Badge
                  variant={active ? "default" : "secondary"}
                  className="h-5 min-w-5 justify-center px-1.5 text-[10px]"
                >
                  {count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <div className="space-y-8">
          <DashboardSectionBoundary name="StatsCards">
            <StatsCards />
          </DashboardSectionBoundary>
          <DashboardSectionBoundary name="GlobalHistorySearch">
            <GlobalHistorySearch />
          </DashboardSectionBoundary>
          <DashboardSectionBoundary name="BlockedEmailsPanel">
            <BlockedEmailsPanel />
          </DashboardSectionBoundary>
          <DashboardSectionBoundary name="RecentSearches">
            <RecentSearches />
          </DashboardSectionBoundary>
          <div className="rounded-xl border border-border/50 bg-card/40 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              Busca e prospecção ficam no Agente 1
            </p>
            <p className="mt-1">
              One-Click Outreach e Busca em Massa foram movidos para o{" "}
              <Link
                href="/agente-1"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Agente 1 — Garimpeiro
              </Link>
              . O Dashboard é somente consulta e informação.
            </p>
          </div>
        </div>
      )}

      {tab === "campaigns" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Campanhas</h3>
              <p className="text-sm text-muted-foreground">
                SQLite: {campaignStats.total} todas · {campaignStats.active} ativas · {campaignStats.completed} concluídas · {campaignStats.archived} arquivadas
                {recoveredCount > 0
                  ? ` · ${recoveredCount} históricas recuperadas`
                  : ""}.
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/campanhas">
                Abrir Campanhas
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <DashboardSectionBoundary name="CampaignListTable">
            <CampaignListTable campaigns={campaigns} />
          </DashboardSectionBoundary>
          <DashboardSectionBoundary name="OfficialSendHistory">
            <OfficialSendHistory />
          </DashboardSectionBoundary>
        </div>
      )}

      {tab === "leads" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Leads</h3>
            <p className="text-sm text-muted-foreground">
              Mesmos dados de Meus Leads — agora dentro do Dashboard.
            </p>
          </div>
          <DashboardSectionBoundary name="SavedLeadsTable">
            <SavedLeadsTable />
          </DashboardSectionBoundary>
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-8">
          <div>
            <h3 className="text-lg font-semibold">Histórico persistido</h3>
            <p className="text-sm text-muted-foreground">
              Setores pesquisados e registro completo de buscas anteriores.
            </p>
          </div>
          <DashboardSectionBoundary name="SearchedSectorsHistory">
            <SearchedSectorsHistory />
          </DashboardSectionBoundary>
          <DashboardSectionBoundary name="FullSearchHistory">
            <FullSearchHistory />
          </DashboardSectionBoundary>
          <DashboardSectionBoundary name="OfficialSendHistory">
            <OfficialSendHistory />
          </DashboardSectionBoundary>
        </div>
      )}

      {tab === "blocked" && (
        <div className="space-y-4">
          <DashboardSectionBoundary name="BlockedEmailsPanel">
            <BlockedEmailsPanel />
          </DashboardSectionBoundary>
        </div>
      )}
    </div>
  );
}
