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
  search: "/busca",
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

  return (
    <div className="border-b border-border/60 bg-card/40 px-4 py-2.5 md:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Lote ativo
          </p>
          <p className="truncate text-sm font-medium" title={batch.label}>
            {batch.label}
          </p>
        </div>
        <nav
          aria-label="Fluxo do lote"
          className="flex flex-wrap items-center gap-1"
        >
          {PIPELINE_STAGES.map((step, index) => {
            const done = index < current;
            const active = index === current;
            return (
              <div key={step.id} className="flex items-center gap-1">
                {index > 0 && (
                  <span className="px-0.5 text-muted-foreground/50">→</span>
                )}
                <Link
                  href={
                    step.id === "campaign" && batch.campaignId
                      ? `/campanhas/${batch.campaignId}`
                      : STAGE_HREF[step.id]
                  }
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    done &&
                      "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
                    active &&
                      "border-primary/50 bg-primary/15 text-primary",
                    !done &&
                      !active &&
                      "border-border/60 bg-background/40 text-muted-foreground"
                  )}
                >
                  {done ? (
                    <Check className="size-3" />
                  ) : (
                    <Circle
                      className={cn(
                        "size-3",
                        active ? "fill-primary/40" : "opacity-50"
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
