"use client";

import Link from "next/link";
import {
  Megaphone,
  MessageSquare,
  Plus,
  Send,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CampaignListTable } from "@/components/campaigns/campaign-list-table";
import { enrichCampaignStats } from "@/lib/campaign-metrics";
import { useCampaignStore } from "@/store/campaign-store";

export default function CampanhasPage() {
  const { campaigns, getStats } = useCampaignStore();
  const stats = enrichCampaignStats(getStats(), campaigns);

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

      {campaigns.length === 0 ? (
        <Card className="border-border/60 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <Megaphone className="mb-4 size-16 text-muted-foreground/40" />
            <h3 className="text-lg font-semibold">Nenhuma campanha ainda</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Crie sua primeira campanha com templates personalizados, seleção de
              leads e preview em tempo real.
            </p>
            <Button asChild className="mt-6">
              <Link href="/campanhas/nova">
                <Plus className="size-4" />
                Criar Primeira Campanha
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <CampaignListTable campaigns={campaigns} />
      )}
    </div>
  );
}