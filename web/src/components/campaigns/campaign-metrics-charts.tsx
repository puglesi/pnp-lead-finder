"use client";

import { Eye, Mail, MessageSquare, MousePointerClick } from "lucide-react";
import type { CampaignTrackingSummary } from "@/types/campaign-tracking";
import { cn } from "@/lib/utils";

interface FunnelStep {
  label: string;
  value: number;
  rate: number;
  color: string;
  bar: string;
  icon: typeof Mail;
}

export function CampaignFunnelChart({
  summary,
  sentTotal,
}: {
  summary: CampaignTrackingSummary;
  sentTotal: number;
}) {
  const sent = sentTotal || summary.sent;
  const steps: FunnelStep[] = [
    {
      label: "Enviados",
      value: sent,
      rate: 100,
      color: "text-emerald-400",
      bar: "from-emerald-500 to-emerald-600",
      icon: Mail,
    },
    {
      label: "Abertos",
      value: summary.opened,
      rate: summary.openRate,
      color: "text-cyan-400",
      bar: "from-cyan-500 to-blue-500",
      icon: Eye,
    },
    {
      label: "Cliques",
      value: summary.clicked,
      rate: summary.clickRate,
      color: "text-violet-400",
      bar: "from-violet-500 to-purple-600",
      icon: MousePointerClick,
    },
    {
      label: "Respostas",
      value: summary.replied,
      rate: summary.replyRate,
      color: "text-amber-400",
      bar: "from-amber-500 to-orange-500",
      icon: MessageSquare,
    },
  ];

  const max = Math.max(sent, 1);

  return (
    <div className="space-y-4">
      {steps.map((step, idx) => {
        const Icon = step.icon;
        const width = Math.max(8, Math.round((step.value / max) * 100));
        return (
          <div key={step.label} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium">
                <Icon className={cn("size-4", step.color)} />
                {step.label}
              </span>
              <span className="tabular-nums text-muted-foreground">
                <strong className={step.color}>{step.value}</strong>
                {idx > 0 && sent > 0 && (
                  <span className="ml-2 text-xs">({step.rate}%)</span>
                )}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-muted/60">
              <div
                className={cn(
                  "h-full rounded-full bg-gradient-to-r transition-all duration-700",
                  step.bar
                )}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CampaignTimelineChart({
  timeline,
}: {
  timeline: CampaignTrackingSummary["timeline"];
}) {
  if (timeline.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Sem eventos de tracking ainda — métricas aparecem após aberturas e cliques.
      </p>
    );
  }

  const max = Math.max(
    1,
    ...timeline.map((p) => p.opens + p.clicks + p.replies)
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-cyan-500" /> Aberturas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-violet-500" /> Cliques
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-amber-500" /> Respostas
        </span>
      </div>
      <div className="flex items-end gap-2 overflow-x-auto pb-2">
        {timeline.map((point) => {
          const total = point.opens + point.clicks + point.replies;
          const h = Math.max(12, Math.round((total / max) * 120));
          const openH = total > 0 ? Math.round((point.opens / total) * h) : 0;
          const clickH = total > 0 ? Math.round((point.clicks / total) * h) : 0;
          const replyH = Math.max(0, h - openH - clickH);
          const label = new Date(point.date + "T12:00:00").toLocaleDateString(
            "pt-BR",
            { day: "2-digit", month: "short" }
          );
          return (
            <div
              key={point.date}
              className="flex min-w-[44px] flex-col items-center gap-1"
              title={`${label}: ${point.opens} aberturas, ${point.clicks} cliques, ${point.replies} respostas`}
            >
              <div
                className="flex w-8 flex-col-reverse overflow-hidden rounded-t-md border border-border/40"
                style={{ height: h }}
              >
                {replyH > 0 && (
                  <div className="bg-amber-500/90" style={{ height: replyH }} />
                )}
                {clickH > 0 && (
                  <div className="bg-violet-500/90" style={{ height: clickH }} />
                )}
                {openH > 0 && (
                  <div className="bg-cyan-500/90" style={{ height: openH }} />
                )}
              </div>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CampaignRateBars({
  summary,
}: {
  summary: CampaignTrackingSummary;
}) {
  const rates = [
    { label: "Taxa de abertura", value: summary.openRate, color: "bg-cyan-500" },
    { label: "Taxa de clique", value: summary.clickRate, color: "bg-violet-500" },
    {
      label: "Clique / abertura",
      value: summary.clickToOpenRate,
      color: "bg-blue-500",
    },
    { label: "Taxa de resposta", value: summary.replyRate, color: "bg-amber-500" },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {rates.map((r) => (
        <div key={r.label} className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-semibold tabular-nums">{r.value}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted/60">
            <div
              className={cn("h-full rounded-full transition-all duration-700", r.color)}
              style={{ width: `${Math.min(100, r.value)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}