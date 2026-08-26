"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, Loader2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BulkSearchProgress } from "@/components/dashboard/bulk-search-progress";
import { useLeadStore } from "@/store/lead-store";
import { getLeadProcessingProgress } from "@/lib/search/processing-progress";

export function SearchLoading() {
  const { currentKeyword, currentLocation, currentLeads, bulkProgress } = useLeadStore();
  const [now, setNow] = useState(() => Date.now());
  const processing = useMemo(
    () => getLeadProcessingProgress(currentLeads),
    [currentLeads]
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const lastActivityMs = bulkProgress.lastActivityAt
    ? new Date(bulkProgress.lastActivityAt).getTime()
    : bulkProgress.startedAt ?? now;
  const inactiveMs = Math.max(0, now - lastActivityMs);
  const possiblyInterrupted = inactiveMs > 3 * 60_000;
  const lastSaved = bulkProgress.lastSavedAt
    ? new Date(bulkProgress.lastSavedAt).toLocaleTimeString("pt-BR")
    : "aguardando primeiro checkpoint";

  return (
    <div className="space-y-6">
      <BulkSearchProgress />

      <Card className="border-border/60 bg-gradient-to-br from-card to-blue-500/5">
        <CardContent className="flex items-center gap-4 p-6">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <Search className="size-6 animate-pulse text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">
              Processando{" "}
              <span className="text-primary">{currentKeyword || "setores"}</span>
              {currentLocation && (
                <span className="text-muted-foreground">
                  {" "}
                  em {currentLocation}
                </span>
              )}
            </h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Etapa atual: {bulkProgress.currentStage ?? "search"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
            <p>Busca: <strong>{bulkProgress.completedCount}/{bulkProgress.totalCount}</strong></p>
            <p>Enrichment: <strong>{processing.enrichmentCompleted}/{processing.total}</strong></p>
            <p>Validação: <strong>{processing.validationCompleted}/{processing.total}</strong></p>
            <p>Score: <strong>{processing.scoringCompleted}/{processing.total}</strong></p>
            <p>Pendentes: <strong>{processing.pending}</strong> · Falhas: <strong>{processing.failed + (bulkProgress.failedCount ?? 0)}</strong></p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {bulkProgress.persistenceStatus === "error" ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-red-400">
                <AlertTriangle className="size-3.5" />
                Falha de persistência: {bulkProgress.persistenceError}
              </span>
            ) : bulkProgress.persistenceStatus === "saved" ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-300">
                <CheckCircle2 className="size-3.5" />
                Salvo automaticamente ✓
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Database className="size-3.5" />
                Salvando checkpoint…
              </span>
            )}
            <span>Último salvamento: {lastSaved}</span>
            <span>Última atividade: {Math.floor(inactiveMs / 1_000)}s atrás</span>
          </div>
          {possiblyInterrupted && (
            <p className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              <AlertTriangle className="size-4" />
              Processamento interrompido. Os resultados já obtidos estão salvos.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 overflow-hidden">
        <CardContent className="p-0">
          <div className="border-b border-border bg-muted/20 px-5 py-3">
            <Skeleton className="h-4 w-48" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-border/40 px-5 py-4"
            >
              <Skeleton className="size-4 rounded-sm" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="hidden h-4 w-24 md:block" />
              <Skeleton className="hidden h-4 w-40 lg:block" />
              <Skeleton className="ml-auto h-6 w-12 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
