"use client";

import Link from "next/link";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  Megaphone,
  MessageSquare,
  Plus,
  Send,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardHeader,
} from "@/components/ui/collapsible-card";
import { CampaignListTable } from "@/components/campaigns/campaign-list-table";
import { getCampaignListViewStats } from "@/lib/campaign-list-metrics";
import { useCampaignStore } from "@/store/campaign-store";
import { useLocalDataAvailability } from "@/lib/local-data-client";

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

export default function CampanhasPage() {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot
  );
  const campaigns = useCampaignStore((state) => state.campaigns);
  const localDataAvailability = useLocalDataAvailability();
  const normalizeLegacyDeliveryMetrics = useCampaignStore(
    (state) => state.normalizeLegacyDeliveryMetrics
  );

  // After localStorage rehydrate, rewrite legacy sentCount/progress in the store.
  useEffect(() => {
    if (!hydrated) return;
    normalizeLegacyDeliveryMetrics();
  }, [hydrated, normalizeLegacyDeliveryMetrics]);

  // Server and first client paint use empty store to avoid hydration mismatch.
  const visibleCampaigns = useMemo(
    () => (hydrated ? campaigns : []),
    [hydrated, campaigns]
  );

  // List header never reads legacy counters — only confirmed SMTP message ids.
  const stats = useMemo(
    () => getCampaignListViewStats(visibleCampaigns),
    [visibleCampaigns]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Megaphone className="size-7 text-blue-400" />
            Campanhas de Email
          </h2>
          <p className="text-muted-foreground">
            Outreach B2B profissional — templates, leads e métricas integradas
          </p>
        </div>
        <Button
          asChild
          className="bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500"
        >
          <Link href="/campanhas/nova">
            <Plus className="size-4" />
            Nova Campanha
          </Link>
        </Button>
      </div>

      <CollapsibleCard storageKey="campanhas-kpi-summary" defaultOpen>
        <CollapsibleCardHeader>
          <CardTitle className="text-base">Resumo das campanhas</CardTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Total campanhas",
            value: stats.total,
            icon: Megaphone,
            color: "text-blue-400",
          },
          {
            label: "Ativas",
            value: stats.active,
            icon: TrendingUp,
            color: "text-cyan-400",
          },
          {
            label: "Emails enviados",
            value: stats.totalSent,
            icon: Send,
            color: "text-emerald-400",
          },
          {
            label: "Taxa resposta média",
            value: `${stats.avgResponseRate}%`,
            icon: MessageSquare,
            color: "text-amber-400",
          },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card
              key={s.label}
              className="border-border/60 bg-gradient-to-br from-card to-primary/5"
            >
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex size-11 items-center justify-center rounded-xl bg-background/60">
                  <Icon className={`size-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold tabular-nums">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
        </CollapsibleCardContent>
      </CollapsibleCard>

      <CollapsibleCard storageKey="campaigns-list" className="border-border/60">
        <CollapsibleCardHeader>
          <CardTitle>Lista de campanhas</CardTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent className="p-0">
          {!hydrated || localDataAvailability === "checking" ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Megaphone className="mb-4 size-16 text-muted-foreground/40" />
              <h3 className="text-lg font-semibold">
                Carregando campanhas do SQLite…
              </h3>
            </div>
          ) : (
            <CampaignListTable campaigns={visibleCampaigns} />
          )}
        </CollapsibleCardContent>
      </CollapsibleCard>
    </div>
  );
}
