"use client";

import {
  AlertTriangle,
  Eye,
  Layers,
  Loader2,
  Mail,
  MessageSquare,
  MousePointerClick,
  Pause,
  Play,
  Send,
  Timer,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getClickRate,
  getOpenRate,
  getResponseRate,
  getSendProgress,
} from "@/lib/campaign-metrics";
import { formatDuration } from "@/lib/time-estimate";
import type { Campaign, CampaignSendingProgress } from "@/types/campaign";
import { cn } from "@/lib/utils";

const PHASE_LABELS: Record<CampaignSendingProgress["phase"], string> = {
  sending: "Enviando lote",
  batch_delay: "Aguardando próximo lote",
  paused: "Pausado",
  opens: "Aberturas",
  clicks: "Cliques",
  replies: "Respostas",
  followup: "Follow-up",
};

interface CampaignSendProgressProps {
  campaign: Campaign;
  isSending?: boolean;
  sendingProgress?: CampaignSendingProgress | null;
  isPaused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
}

export function CampaignSendProgress({
  campaign,
  isSending = false,
  sendingProgress,
  isPaused = false,
  onPause,
  onResume,
}: CampaignSendProgressProps) {
  const progress = getSendProgress(campaign);
  const active = isSending || campaign.status === "active" || isPaused;

  const stats = [
    {
      label: "Enviados",
      value: campaign.sentCount,
      total: campaign.leadIds.length,
      icon: Send,
      color: "text-emerald-400",
    },
    {
      label: "Falhas",
      value: campaign.failedCount ?? 0,
      icon: AlertTriangle,
      color: "text-red-400",
    },
    {
      label: "Abertos",
      value: campaign.openedCount,
      sub: `${getOpenRate(campaign)}%`,
      icon: Eye,
      color: "text-cyan-400",
    },
    {
      label: "Respostas",
      value: campaign.repliedCount,
      sub: `${getResponseRate(campaign)}%`,
      icon: MessageSquare,
      color: "text-amber-400",
    },
  ];

  const showBatchControls =
    active &&
    sendingProgress &&
    ["sending", "batch_delay", "paused"].includes(sendingProgress.phase);

  return (
    <Card className="overflow-hidden border-border/60 bg-gradient-to-br from-card to-blue-500/5">
      <CardContent className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {active ? (
              isPaused ? (
                <Pause className="size-5 text-amber-400" />
              ) : (
                <Loader2 className="size-5 animate-spin text-primary" />
              )
            ) : (
              <Mail className="size-5 text-emerald-400" />
            )}
            <div>
              <p className="font-medium">
                {isPaused
                  ? "Envio pausado"
                  : active
                    ? "Envio em lotes em andamento"
                    : "Envio concluído"}
              </p>
              <p className="text-xs text-muted-foreground">
                {campaign.batchSend.batchSize} emails/lote ·{" "}
                {campaign.emailProvider ?? "simulate"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showBatchControls && onPause && onResume && (
              isPaused ? (
                <Button size="sm" onClick={onResume} className="gap-1.5">
                  <Play className="size-3.5" />
                  Retomar
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={onPause} className="gap-1.5">
                  <Pause className="size-3.5" />
                  Pausar
                </Button>
              )
            )}
            <span className="text-2xl font-bold tabular-nums text-primary">
              {progress}%
            </span>
          </div>
        </div>

        {sendingProgress && active && (
          <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Zap className="size-4 text-primary" />
              <Badge variant="outline" className="text-[10px]">
                {PHASE_LABELS[sendingProgress.phase]}
              </Badge>
              {sendingProgress.totalBatches > 0 && (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <Layers className="size-3" />
                  Lote {sendingProgress.currentBatch}/{sendingProgress.totalBatches}
                </Badge>
              )}
              <span className="font-medium">{sendingProgress.currentLeadLabel}</span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {sendingProgress.currentIndex}/{sendingProgress.total}
              </span>
            </div>

            {sendingProgress.phase === "batch_delay" &&
              sendingProgress.nextBatchInMs != null && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Timer className="size-3.5" />
                  Próximo lote em{" "}
                  {formatDuration(sendingProgress.nextBatchInMs)}
                </div>
              )}

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>
                ✓ {sendingProgress.successCount} enviados
              </span>
              {sendingProgress.failedCount > 0 && (
                <span className="text-red-300">
                  ✗ {sendingProgress.failedCount} falhas
                </span>
              )}
              {sendingProgress.elapsedMs > 0 && (
                <span>{formatDuration(sendingProgress.elapsedMs)} decorrido</span>
              )}
              {sendingProgress.estimatedRemainingMs > 0 && !isPaused && (
                <span className="text-primary">
                  ~{formatDuration(sendingProgress.estimatedRemainingMs)} restante
                </span>
              )}
            </div>
          </div>
        )}

        <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full bg-gradient-to-r from-blue-500 via-violet-500 to-emerald-500 transition-all duration-500",
              active && !isPaused && "animate-pulse"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="rounded-xl border border-border/50 bg-background/30 p-3"
              >
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon className={cn("size-3.5", stat.color)} />
                  {stat.label}
                </div>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {stat.value}
                  {"total" in stat && stat.total != null && (
                    <span className="text-sm font-normal text-muted-foreground">
                      /{stat.total}
                    </span>
                  )}
                </p>
                {"sub" in stat && stat.sub && (
                  <p className={cn("text-[11px] font-medium", stat.color)}>
                    {stat.sub}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {campaign.clickedCount > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            <MousePointerClick className="mr-1 inline size-3" />
            {getClickRate(campaign)}% cliques
          </p>
        )}
      </CardContent>
    </Card>
  );
}