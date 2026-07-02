"use client";

import { useMemo } from "react";
import {
  Activity,
  BarChart3,
  Clock,
  ExternalLink,
  Mail,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CampaignFunnelChart,
  CampaignRateBars,
  CampaignTimelineChart,
} from "./campaign-metrics-charts";
import { buildTrackingSummary } from "@/lib/campaign-tracking";
import {
  getClickRate,
  getOpenRate,
  getResponseRate,
} from "@/lib/campaign-metrics";
import type { Campaign } from "@/types/campaign";
import type { CampaignTrackingEvent } from "@/types/campaign-tracking";
import { cn } from "@/lib/utils";

const EVENT_LABELS = {
  open: { label: "Abertura", className: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" },
  click: { label: "Clique", className: "text-violet-400 bg-violet-500/10 border-violet-500/30" },
  reply: { label: "Resposta", className: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
} as const;

function formatEventTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CampaignPerformanceReport({
  campaign,
  events,
  onRefresh,
  refreshing = false,
}: {
  campaign: Campaign;
  events: CampaignTrackingEvent[];
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const summary = useMemo(
    () => buildTrackingSummary(campaign, events),
    [campaign, events]
  );

  const recentEvents = useMemo(
    () =>
      [...summary.events]
        .sort(
          (a, b) =>
            new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
        )
        .slice(0, 12),
    [summary.events]
  );

  const insights = useMemo(() => {
    const lines: string[] = [];
    const openRate = getOpenRate(campaign);
    const clickRate = getClickRate(campaign);
    const replyRate = getResponseRate(campaign);

    if (campaign.sentCount === 0) {
      lines.push("Envie a campanha para começar a coletar métricas de tracking.");
    } else {
      if (openRate >= 40) lines.push("Excelente taxa de abertura — assunto e remetente estão funcionando bem.");
      else if (openRate < 15) lines.push("Taxa de abertura baixa — teste outro assunto ou horário de envio.");

      if (clickRate >= 10) lines.push("Boa taxa de cliques — o conteúdo está gerando interesse.");
      else if (clickRate > 0 && clickRate < 3) lines.push("Poucos cliques — revise os links e o call-to-action do email.");

      if (replyRate >= 5) lines.push("Respostas acima da média B2B — priorize follow-up nos leads que responderam.");
      if (summary.clickToOpenRate > 0 && summary.clickToOpenRate < 20) {
        lines.push("Muitas aberturas sem clique — simplifique a mensagem ou destaque um único CTA.");
      }
    }

    if (lines.length === 0) {
      lines.push("Tracking ativo — pixel de abertura e links rastreados estão monitorando a campanha.");
    }

    return lines;
  }, [campaign, summary.clickToOpenRate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <BarChart3 className="size-5 text-blue-400" />
            Relatório de Performance
          </h2>
          <p className="text-sm text-muted-foreground">
            Tracking em tempo real — envios, aberturas, cliques e respostas
          </p>
        </div>
        {onRefresh && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            Atualizar métricas
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Enviados",
            value: campaign.sentCount,
            sub: `de ${campaign.leadIds.length} leads`,
            icon: Mail,
            color: "text-emerald-400",
            border: "border-emerald-500/25",
            bg: "from-emerald-500/10",
          },
          {
            label: "Aberturas",
            value: campaign.openedCount,
            sub: `${getOpenRate(campaign)}% taxa`,
            icon: Activity,
            color: "text-cyan-400",
            border: "border-cyan-500/25",
            bg: "from-cyan-500/10",
          },
          {
            label: "Cliques",
            value: campaign.clickedCount,
            sub: `${getClickRate(campaign)}% taxa`,
            icon: ExternalLink,
            color: "text-violet-400",
            border: "border-violet-500/25",
            bg: "from-violet-500/10",
          },
          {
            label: "Respostas",
            value: campaign.repliedCount,
            sub: `${getResponseRate(campaign)}% taxa`,
            icon: TrendingUp,
            color: "text-amber-400",
            border: "border-amber-500/25",
            bg: "from-amber-500/10",
          },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card
              key={kpi.label}
              className={cn(
                "border bg-gradient-to-br to-transparent",
                kpi.border,
                kpi.bg
              )}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <Icon className={cn("size-5", kpi.color)} />
                  <span className={cn("text-2xl font-bold tabular-nums", kpi.color)}>
                    {kpi.value}
                  </span>
                </div>
                <p className="mt-2 font-medium">{kpi.label}</p>
                <p className="text-xs text-muted-foreground">{kpi.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Funil de conversão</CardTitle>
          </CardHeader>
          <CardContent>
            <CampaignFunnelChart summary={summary} sentTotal={campaign.sentCount} />
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Taxas de engajamento</CardTitle>
          </CardHeader>
          <CardContent>
            <CampaignRateBars summary={summary} />
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4 text-muted-foreground" />
            Atividade ao longo do tempo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignTimelineChart timeline={summary.timeline} />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-blue-500/20 bg-gradient-to-br from-card to-blue-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {insights.map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-blue-400">•</span>
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground/80">
              Respostas: marque manualmente na aba Leads ou via detecção básica.
              Aberturas e cliques são rastreados automaticamente por pixel e links.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Eventos recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {recentEvents.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum evento registrado ainda.
              </p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {recentEvents.map((event) => {
                  const cfg = EVENT_LABELS[event.type];
                  return (
                    <div
                      key={event.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border/40 bg-background/40 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase",
                            cfg.className
                          )}
                        >
                          {cfg.label}
                        </span>
                        <p className="mt-1 truncate text-muted-foreground">
                          {event.email}
                        </p>
                        {event.url && (
                          <p className="truncate text-xs text-muted-foreground/70">
                            {event.url}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatEventTime(event.occurredAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}