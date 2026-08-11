"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Check, Circle } from "lucide-react";
import { PIPELINE_STAGES, type PipelineStage } from "@/types/batch";
import { useBatchPipelineStore } from "@/store/batch-pipeline-store";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};
const client = () => true;
const server = () => false;

const STAGE_HREF: Record<PipelineStage, string> = {
  search: "/agente-1?mode=bulk",
  garimpo: "/agente-1",
  validation: "/agente-2",
  campaign: "/campanhas",
  send: "/agente-3",
  complete: "/campanhas",
};

const STAGE_ORDER: PipelineStage[] = [
  "search",
  "garimpo",
  "validation",
  "campaign",
  "send",
  "complete",
];

function stageIndex(stage: PipelineStage): number {
  return STAGE_ORDER.indexOf(stage);
}

export function BatchPipelineIndicator() {
  const hydrated = useSyncExternalStore(subscribe, client, server);
  const activeBatchId = useBatchPipelineStore((s) => s.activeBatchId);
  const batches = useBatchPipelineStore((s) => s.batches);
  const batch =
    hydrated && activeBatchId ? batches[activeBatchId] ?? null : null;

  if (!hydrated || !batch) return null;

  const current = stageIndex(batch.stage);
  const leadHint =
    typeof batch.foundCount === "number" && batch.foundCount > 0
      ? ` · ${batch.foundCount} leads`
      : batch.leadIds?.length
        ? ` · ${batch.leadIds.length} leads`
        : "";

  return (
    <div
      className={cn(
        "relative overflow-hidden border-b",
        "border-cyan-500/30 dark:border-cyan-500/25",
        "bg-gradient-to-r from-card/95 via-cyan-500/8 to-emerald-500/8",
        "dark:via-cyan-500/5 dark:to-emerald-500/5",
        "px-4 py-3 md:px-6",
        "shadow-[0_0_20px_-6px_hsl(var(--neon-cyan)/0.35)]"
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(var(--neon-cyan)/0.12),_transparent_55%)]"
      />
      <div className="relative mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300/90">
            Lote ativo
          </p>
          <p
            className="truncate text-sm font-semibold text-foreground"
            title={batch.label}
          >
            {batch.label}
            <span className="font-normal text-muted-foreground">
              {leadHint}
            </span>
          </p>
        </div>
        <nav
          aria-label="Fluxo do lote"
          className="flex flex-wrap items-center gap-1"
        >
          {PIPELINE_STAGES.map((step, index) => {
            const done = index < current;
            const active = index === current;
            const future = index > current;
            return (
              <div key={step.id} className="flex items-center gap-1">
                {index > 0 && (
                  <span
                    className={cn(
                      "px-0.5 text-sm",
                      done
                        ? "text-emerald-600 dark:text-emerald-400/70"
                        : active
                          ? "text-cyan-600 dark:text-cyan-400/80"
                          : "text-muted-foreground/40"
                    )}
                  >
                    →
                  </span>
                )}
                <Link
                  href={
                    step.id === "campaign" && batch.campaignId
                      ? `/campanhas/${batch.campaignId}`
                      : STAGE_HREF[step.id]
                  }
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                    done &&
                      "border-emerald-500/50 bg-emerald-500/15 text-emerald-800 shadow-[0_0_12px_-2px_hsl(var(--neon-emerald)/0.55)] dark:text-emerald-200",
                    active &&
                      "animate-pulse border-cyan-500/70 bg-cyan-500/20 text-cyan-900 shadow-[0_0_16px_-2px_hsl(var(--neon-cyan)/0.7)] dark:text-cyan-100",
                    future &&
                      "border-border/50 bg-background/40 text-muted-foreground/60 opacity-70"
                  )}
                >
                  {done ? (
                    <Check className="size-3" />
                  ) : (
                    <Circle
                      className={cn(
                        "size-3",
                        active
                          ? "fill-cyan-500/40 text-cyan-600 dark:text-cyan-300"
                          : "opacity-40"
                      )}
                    />
                  )}
                  {step.label}
                </Link>
              </div>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
