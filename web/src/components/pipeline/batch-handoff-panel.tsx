"use client";

import { Button } from "@/components/ui/button";
import type { BatchLeadStats, LeadBatch } from "@/types/batch";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function BatchHandoffPanel({
  batch,
  stats,
  title,
  description,
  actionLabel,
  onAction,
  actionDisabled,
  extraStats,
}: {
  batch: LeadBatch;
  stats: BatchLeadStats;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
  extraStats?: { label: string; value: number }[];
}) {
  return (
    <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
            Lote ativo
          </p>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
          <p className="truncate text-xs text-muted-foreground" title={batch.label}>
            {batch.label}
          </p>
        </div>
        <Button onClick={onAction} disabled={actionDisabled}>
          {actionLabel}
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Encontrados reais" value={stats.realFound} />
        <Stat label="Com e-mail" value={stats.withEmail} />
        <Stat label="Sem e-mail" value={stats.withoutEmail} />
        <Stat label="E-mail único" value={stats.uniqueEmails} />
        <Stat label="Duplicados" value={stats.duplicates} />
        <Stat label="Inválidos" value={stats.invalid} />
        <Stat label="Não confirmados" value={stats.unconfirmed} />
        <Stat label="Elegíveis" value={stats.eligible} />
        {extraStats?.map((item) => (
          <Stat key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
    </div>
  );
}
