"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { Building2, Mail, Megaphone, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLeadStore } from "@/store/lead-store";
import { useCampaignStore } from "@/store/campaign-store";
import { useLifetimeStatsStore } from "@/store/lifetime-stats-store";
import { computeLifetimeStats } from "@/lib/lifetime-stats";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};
const client = () => true;
const server = () => false;

export function StatsCards() {
  const hydrated = useSyncExternalStore(subscribe, client, server);
  const fullSearchHistory = useLeadStore((s) => s.fullSearchHistory ?? []);
  const recentSearches = useLeadStore((s) => s.recentSearches ?? []);
  const savedLeads = useLeadStore((s) => s.savedLeads ?? []);
  const importedLeads = useLeadStore((s) => s.importedLeads ?? []);
  const campaigns = useCampaignStore((s) => s.campaigns ?? []);
  // CRITICAL: never select a fresh object from Zustand without useShallow —
  // that causes Maximum update depth exceeded and kills only the Dashboard.
  const floorCompanies = useLifetimeStatsStore((s) => s.companiesFound ?? 0);
  const floorLeads = useLifetimeStatsStore((s) => s.leadsFound ?? 0);
  const floorEmails = useLifetimeStatsStore((s) => s.validEmailsFound ?? 0);
  const floorCampaignsSent = useLifetimeStatsStore((s) => s.campaignsSent ?? 0);
  const syncFromPersistedData = useLifetimeStatsStore(
    (s) => s.syncFromPersistedData
  );

  const floors = useMemo(
    () => ({
      companiesFound: floorCompanies,
      leadsFound: floorLeads,
      validEmailsFound: floorEmails,
      campaignsSent: floorCampaignsSent,
    }),
    [floorCompanies, floorLeads, floorEmails, floorCampaignsSent]
  );

  // Keep high-water floors aligned with durable persisted data (never resets UI).
  useEffect(() => {
    if (!hydrated) return;
    try {
      syncFromPersistedData({
        fullSearchHistory,
        recentSearches,
        savedLeads,
        importedLeads,
        campaigns,
      });
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[StatsCards] syncFromPersistedData failed", err);
      }
    }
  }, [
    hydrated,
    fullSearchHistory,
    recentSearches,
    savedLeads,
    importedLeads,
    campaigns,
    syncFromPersistedData,
  ]);

  const stats = useMemo(() => {
    if (!hydrated) {
      return {
        companiesFound: 0,
        leadsFound: 0,
        validEmailsFound: 0,
        campaignsSent: 0,
        campaignsActive: 0,
      };
    }
    try {
      return computeLifetimeStats({
        fullSearchHistory,
        recentSearches,
        savedLeads,
        importedLeads,
        campaigns,
        floors,
      });
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[StatsCards] computeLifetimeStats failed", err);
      }
      // Malformed historical campaign/lead → show floors/zeros, never crash page.
      return {
        companiesFound: floors.companiesFound,
        leadsFound: floors.leadsFound,
        validEmailsFound: floors.validEmailsFound,
        campaignsSent: floors.campaignsSent,
        campaignsActive: 0,
      };
    }
  }, [
    hydrated,
    fullSearchHistory,
    recentSearches,
    savedLeads,
    importedLeads,
    campaigns,
    floors,
  ]);

  const cards = [
    {
      label: "Empresas encontradas",
      value: stats.companiesFound.toLocaleString("pt-BR"),
      hint: "Lifetime · todas as buscas",
      icon: Building2,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Leads encontrados/salvos",
      value: stats.leadsFound.toLocaleString("pt-BR"),
      hint: "Lifetime · união de registros",
      icon: Users,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "E-mails válidos encontrados",
      value: stats.validEmailsFound.toLocaleString("pt-BR"),
      hint: "Lifetime · com endereço",
      icon: Mail,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
    },
    {
      label: "Campanhas enviadas",
      value: stats.campaignsSent.toLocaleString("pt-BR"),
      hint: "Lifetime · com envio confirmado",
      icon: Megaphone,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      extra:
        stats.campaignsActive > 0
          ? `${stats.campaignsActive} ativa${stats.campaignsActive !== 1 ? "s" : ""}`
          : null,
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className="border-emerald-500/40 bg-emerald-500/10 text-[10px] uppercase tracking-wide text-emerald-800 dark:text-emerald-300"
        >
          Lifetime
        </Badge>
        <p className="text-xs text-muted-foreground">
          Totais acumulados desde o primeiro registro persistido. Não resetam
          ao limpar a interface ou trocar de lote.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card
              key={stat.label}
              className="border-border/60 bg-card/80 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
            >
              <CardContent className="flex items-center gap-4 p-6">
                <div
                  className={cn(
                    "flex size-12 items-center justify-center rounded-xl",
                    stat.bg
                  )}
                >
                  <Icon className={cn("size-6", stat.color)} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold tracking-tight tabular-nums">
                    {stat.value}
                  </p>
                  <p className="text-[10px] text-muted-foreground/80">
                    {stat.hint}
                  </p>
                  {stat.extra && (
                    <Badge
                      variant="secondary"
                      className="mt-1 text-[10px] tabular-nums"
                    >
                      {stat.extra} (separado)
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
