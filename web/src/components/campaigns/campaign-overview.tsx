"use client";

import {
  Eye,
  Mail,
  MessageSquare,
  MousePointerClick,
  Send,
  TrendingUp,
} from "lucide-react";
import {
  getCampaignDeliverySnapshot,
  getClickRate,
  getOpenRate,
  getResponseRate,
  getSendProgress,
} from "@/lib/campaign-metrics";
import { CampaignFunnelChart } from "./campaign-metrics-charts";
import { buildTrackingSummary } from "@/lib/campaign-tracking";
import type { Campaign } from "@/types/campaign";
import type { CampaignTrackingEvent } from "@/types/campaign-tracking";
import { cn } from "@/lib/utils";

export function CampaignOverview({
  campaign,
  events = [],
}: {
  campaign: Campaign;
  events?: CampaignTrackingEvent[];
}) {
  const summary = buildTrackingSummary(campaign, events);
  const delivery = getCampaignDeliverySnapshot(campaign);

  const stats = [
    {
      label: "Enviados",
      value: delivery.sentCount,
      total: campaign.leadIds.length,
      rate: getSendProgress(campaign),
      icon: Send,
      color: "text-emerald-700 dark:text-emerald-400",
      bg: "from-emerald-500/12 to-emerald-500/0",
      border: "border-emerald-500/25",
    },
    {
      label: "Abertos",
      value: delivery.openedCount,
      rate: getOpenRate(campaign),
      icon: Eye,
      color: "text-cyan-700 dark:text-cyan-400",
      bg: "from-cyan-500/12 to-cyan-500/0",
      border: "border-cyan-500/25",
    },
    {
      label: "Cliques",
      value: delivery.clickedCount,
      rate: getClickRate(campaign),
      icon: MousePointerClick,
      color: "text-violet-700 dark:text-violet-400",
      bg: "from-violet-500/12 to-violet-500/0",
      border: "border-violet-500/25",
    },
    {
      label: "Respostas",
      value: delivery.repliedCount,
      rate: getResponseRate(campaign),
      icon: MessageSquare,
      color: "text-amber-700 dark:text-amber-400",
      bg: "from-amber-500/12 to-amber-500/0",
      border: "border-amber-500/25",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className={cn(
                "rounded-2xl border bg-gradient-to-br p-5 transition-all hover:shadow-lg hover:shadow-black/10",
                stat.border,
                stat.bg
              )}
            >
              <div className="flex items-center justify-between">
                <div className={cn("rounded-xl bg-background/50 p-2.5", stat.color)}>
                  <Icon className="size-5" />
                </div>
                {delivery.sentCount > 0 && stat.label !== "Enviados" && (
                  <span className={cn("text-sm font-semibold tabular-nums", stat.color)}>
                    {stat.rate}%
                  </span>
                )}
              </div>
              <p className="mt-4 text-3xl font-bold tabular-nums">
                {stat.value}
                {"total" in stat && stat.total != null && (
                  <span className="text-base font-normal text-muted-foreground">
                    /{stat.total}
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {delivery.sentCount > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="size-4 text-blue-400" />
            <h3 className="font-medium">Funil rápido</h3>
            <span className="text-xs text-muted-foreground">
              · tracking ativo
            </span>
          </div>
          <CampaignFunnelChart summary={summary} sentTotal={delivery.sentCount} />
        </div>
      )}

      {delivery.sentCount === 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/60 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
          <Mail className="size-4 shrink-0" />
          Após o envio real (Agente 3), aberturas, cliques e respostas
          aparecerão aqui automaticamente.
        </div>
      )}
    </div>
  );
}
