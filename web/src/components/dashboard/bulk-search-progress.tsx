"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  ListOrdered,
  Loader2,
  Mail,
  Plus,
  Star,
  Target,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLeadStore } from "@/store/lead-store";
import { useSettingsStore } from "@/store/settings-store";
import { useBatchPipelineStore } from "@/store/batch-pipeline-store";
import { exportLeadsToCSV } from "@/lib/csv-export";
import { getMockLeadStats } from "@/lib/mock-data";
import { formatDuration } from "@/lib/time-estimate";
import { formatSectorQueue } from "@/lib/worker-pool";
import { ProviderStatusBadge } from "@/components/dashboard/provider-status-badge";
import { getSourceShortLabel } from "@/types/autonomous-sources";
import { cn } from "@/lib/utils";
import { resolveGeoRegion } from "@/lib/geo/regions";

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/40 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={cn("size-3.5", accent)} />
        {label}
      </div>
      <p className={cn("mt-1 text-xl font-bold tabular-nums", accent)}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function BulkSearchProgress() {
  const router = useRouter();
  const {
    isSearching,
    bulkProgress,
    currentLeads,
    currentLocation,
    currentKeyword,
    lastSearchIsLive,
    lastSearchSource,
    generateMoreLeads,
  } = useLeadStore();
  const settings = useSettingsStore();
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const geoRegion = resolveGeoRegion(
    currentLocation || bulkProgress.location
  );
  const selectedTotal = bulkProgress.sectors.reduce(
    (sum, sector) => sum + (sector.selectedCount ?? 0),
    0
  );
  const analyzedTotal = bulkProgress.sectors.reduce(
    (sum, sector) => sum + (sector.providerResultsInspected ?? 0),
    0
  );

  useEffect(() => {
    if (!isSearching) return;
    const id = setInterval(() => setCurrentTime(Date.now()), 500);
    return () => clearInterval(id);
  }, [isSearching]);

  const stats = useMemo(() => getMockLeadStats(currentLeads), [currentLeads]);

  if (!isSearching && bulkProgress.totalCount === 0) {
    return null;
  }

  const pct =
    bulkProgress.totalCount > 0
      ? Math.round(
          (bulkProgress.completedCount / bulkProgress.totalCount) * 100
        )
      : 0;

  const elapsed =
    bulkProgress.startedAt && isSearching && currentTime !== null
      ? Math.max(0, currentTime - bulkProgress.startedAt)
      : bulkProgress.elapsedMs;

  const leadsPerSec =
    elapsed > 0 ? (bulkProgress.leadsFound / (elapsed / 1000)).toFixed(1) : "—";

  const queueLabel = formatSectorQueue(
    bulkProgress.sectors.map((s) => s.sector)
  );

  const maxPerSector = settings.getEffectiveMaxResults();
  const summary = bulkProgress.searchSummary;
  const isAutonomous = settings.searchProfile === "autonomous-24h";
  const activeSources = isAutonomous
    ? settings.getActiveAutonomousSources()
    : [];

  const handleExportAll = () => {
    if (currentLeads.length === 0) {
      toast.error("Nenhum lead para exportar.");
      return;
    }
    const filename = `pnp-bulk-${currentLocation || "uk"}-${new Date().toISOString().slice(0, 10)}.csv`;
    exportLeadsToCSV(currentLeads, filename);
    toast.success(`${currentLeads.length} leads exportados!`, { icon: "📥" });
  };

  const handleGenerateMore = async (batch: number) => {
    setIsGenerating(true);
    try {
      const added = generateMoreLeads(batch);
      if (added === 0) {
        toast.error(
          "Quantidade é um teto. A busca real não é completada com placeholders."
        );
        return;
      }
      toast.success(`+${added} leads adicionados · total ${useLeadStore.getState().currentLeads.length}`, {
        icon: "✨",
        duration: 4000,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="overflow-hidden border-border/60 bg-gradient-to-br from-card via-card to-blue-500/5">
      <CardHeader className="space-y-3 border-b border-border/40 pb-4">
        <div className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {isSearching ? (
              <Loader2 className="size-5 animate-spin text-primary" />
            ) : (
              <CheckCircle2 className="size-5 text-emerald-400" />
            )}
            {isSearching
              ? settings.searchProfile === "autonomous-24h"
                ? "Pesquisa Aprofundada em Andamento"
                : "Fila de Busca em Andamento"
              : "Busca Concluída — Resumo"}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {settings.getEffectiveWorkers()} workers
            </Badge>
            <Badge variant="outline">
            {settings.useMaxLeads ? "Máx." : settings.maxResults}/setor
          </Badge>
            {settings.mode24h && (
              <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-900 dark:text-amber-300">
                Modo 24h
              </Badge>
            )}
            <ProviderStatusBadge />
            {isAutonomous && activeSources.length > 0 && (
              <>
                {activeSources.map((id) => (
                  <Badge
                    key={id}
                    className="border-indigo-400/30 bg-indigo-500/15 text-[10px] text-indigo-800 dark:text-indigo-200"
                  >
                    {getSourceShortLabel(id)}
                  </Badge>
                ))}
                {settings.autonomousEnrichWebsites && (
                  <Badge variant="outline" className="text-[10px]">
                    + enrich
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>

        {!isSearching && currentLocation && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{currentKeyword}</span>
            {" · "}
            {currentLocation}
            {!lastSearchIsLive && (
              <span className="ml-2 text-xs text-amber-300/80">
                ({lastSearchSource})
              </span>
            )}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        {!isSearching && summary && (
          <div
            className={cn(
              "rounded-xl border px-4 py-3 text-sm",
              summary.creditExhausted
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-emerald-500/30 bg-emerald-500/5"
            )}
          >
            <p className="font-medium">
              {summary.apiCallsConsumed > 0 ? (
                <>
                  Consumidas:{" "}
                  <span className="text-foreground">
                    {summary.apiCallsConsumed}
                  </span>{" "}
                  {summary.apiCallsConsumed === 1 ? "busca" : "buscas"}
                  {" · "}
                </>
              ) : null}
              Leads encontrados:{" "}
              <span className="text-emerald-400">{summary.leadsFound}</span>
              {" · "}
              Tempo:{" "}
              <span className="text-foreground">
                {formatDuration(summary.elapsedMs)}
              </span>
              {bulkProgress.totalCount > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {bulkProgress.totalCount}{" "}
                  {bulkProgress.totalCount === 1 ? "setor" : "setores"}
                </span>
              )}
            </p>
            {summary.autoSavedCount != null && summary.autoSavedCount > 0 && (
              <p className="mt-1 text-xs text-indigo-300/90">
                {summary.autoSavedCount} leads salvos automaticamente em Meus
                Leads
              </p>
            )}
            {summary.creditExhausted && (
              <p className="mt-1 text-xs text-amber-300/90">
                Crédito SerpAPI esgotado — fallback autônomo (Google/Bing/DDG) ativo.
              </p>
            )}
            {summary.apiCallsConsumed > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                SerpAPI live: {summary.liveCalls}
                {summary.mockFallbackCalls > 0 &&
                  ` · fallback: ${summary.mockFallbackCalls}`}
              </p>
            )}
          </div>
        )}

        {bulkProgress.sectors.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-border/40 bg-background/30 px-3 py-2.5 text-xs text-muted-foreground">
            <ListOrdered className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span className="break-words leading-relaxed">{queueLabel}</span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <div className="relative mx-auto flex size-24 shrink-0 items-center justify-center sm:mx-0">
            <svg className="size-24 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-muted/30"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="url(#progressGrad)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${(isSearching ? pct : 100) * 2.64} 264`}
                className="transition-all duration-700"
              />
              <defs>
                <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold tabular-nums">
                {isSearching ? pct : 100}%
              </span>
              <span className="text-[10px] text-muted-foreground">progresso</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <span className="font-semibold text-foreground">
                  {bulkProgress.completedCount}/{bulkProgress.totalCount}
                </span>{" "}
                <span className="text-muted-foreground">setores processados</span>
              </span>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {formatDuration(elapsed)}
                </span>
                {isSearching && bulkProgress.estimatedRemainingMs > 0 && (
                  <span className="text-primary">
                    ~{formatDuration(bulkProgress.estimatedRemainingMs)} restante
                  </span>
                )}
                {!isSearching && (
                  <span>{leadsPerSec} leads/s</span>
                )}
              </div>
            </div>

            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500"
                style={{ width: `${isSearching ? pct : 100}%` }}
              />
            </div>

            {(currentLeads.length > 0 || isSearching) && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatTile
                  icon={Target}
                  label="Leads"
                  value={bulkProgress.leadsFound}
                  sub={isSearching ? "acumulando..." : "total único"}
                  accent="text-emerald-400"
                />
                <StatTile
                  icon={Mail}
                  label="Com email"
                  value={`${stats.emailPct}%`}
                  sub={`${stats.withEmail} de ${stats.total}`}
                  accent="text-blue-400"
                />
                <StatTile
                  icon={BarChart3}
                  label="Score médio"
                  value={stats.avgScore || "—"}
                  sub="IA prospecting"
                  accent="text-violet-400"
                />
                <StatTile
                  icon={Star}
                  label="Score alto"
                  value={stats.highScore}
                  sub="≥ 85 pontos"
                  accent="text-amber-400"
                />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Fila de setores
          </p>
          <div className="space-y-1.5">
            {bulkProgress.sectors.map((s, i) => {
              const barPct =
                maxPerSector > 0
                  ? Math.min(100, Math.round((s.leadsFound / maxPerSector) * 100))
                  : 0;
              return (
                <div key={s.sector} className="flex items-center gap-2">
                  {i > 0 && (
                    <ArrowRight className="hidden size-3 shrink-0 text-muted-foreground/40 sm:block" />
                  )}
                  <div
                    className={cn(
                      "flex flex-1 flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                      s.status === "running" && "border-primary/40 bg-primary/5",
                      s.status === "queued" && "border-amber-500/30 bg-amber-500/5",
                      s.status === "done" && "border-emerald-500/30 bg-emerald-500/5",
                      s.status === "error" && "border-red-500/30 bg-red-500/5",
                      s.status === "pending" && "border-border/40 opacity-60"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 truncate">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                          {s.queueIndex}
                        </span>
                        <span className="truncate font-medium">{s.sector}</span>
                      </span>
                      <span className="ml-2 flex shrink-0 items-center gap-1.5">
                        {s.status === "running" && (
                          <Loader2 className="size-3.5 animate-spin text-primary" />
                        )}
                        {s.status === "queued" && (
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                            na fila
                          </Badge>
                        )}
                        {s.status === "done" && (
                          <>
                            <CheckCircle2 className="size-3.5 text-emerald-400" />
                            <span className="text-xs text-muted-foreground">
                              {s.selectedCount ??
                                s.insideTargetFound ??
                                s.foundRealCount ??
                                s.leadsFound}
                              {s.requestedCount ? ` / ${s.requestedCount}` : ""}
                              {s.sourceExhausted ? " · fonte esgotada" : ""}
                              {s.durationMs
                                ? ` · ${formatDuration(s.durationMs)}`
                                : ""}
                            </span>
                          </>
                        )}
                        {s.status === "error" && (
                          <XCircle className="size-3.5 text-red-400" />
                        )}
                      </span>
                    </div>
                    {(s.status === "done" || s.status === "running") &&
                      s.providerResultsInspected != null && (
                      <p className="text-[11px] text-muted-foreground">
                        Solicitados: {s.requestedCount ?? "—"} · Analisados:{" "}
                        {s.providerResultsInspected} · Dentro da área:{" "}
                        {s.insideTargetFound ?? 0} · Selecionados:{" "}
                        {s.selectedCount ?? 0} · Fora da área:{" "}
                        {s.outsideTargetCount ?? 0} · Desconhecidos:{" "}
                        {s.unknownLocationCount ?? 0} · Fonte esgotada:{" "}
                        {s.sourceExhausted ? "sim" : "não"}
                      </p>
                    )}
                    {(s.status === "done" || s.status === "running") && (
                      <div className="h-1 overflow-hidden rounded-full bg-muted/60">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            s.status === "running"
                              ? "animate-pulse bg-primary/60"
                              : "bg-emerald-500/70"
                          )}
                          style={{
                            width: `${s.status === "running" ? Math.max(barPct, 15) : barPct}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {!isSearching && currentLeads.length > 0 && (
          <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-100">
              <CheckCircle2 className="size-4 text-emerald-400" />
              Busca concluída: {selectedTotal || currentLeads.length}{" "}
              selecionado
              {(selectedTotal || currentLeads.length) === 1 ? "" : "s"} para o
              lote
            </p>
            <p className="text-xs text-muted-foreground">
              {geoRegion
                ? `${geoRegion.name}${geoRegion.displaySubtitle ? ` · ${geoRegion.displaySubtitle}` : ""}. `
                : ""}
              {analyzedTotal > 0
                ? `${analyzedTotal} resultados analisados pelo provider não entram automaticamente no lote. `
                : ""}
              Continue no Agente 1 para garimpar e-mails deste lote sem
              misturar outras buscas.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-500"
                onClick={() => {
                  // Migrate legacy searches (no batchId) from existing results —
                  // never re-run search or consume SerpAPI.
                  const batchId =
                    useLeadStore.getState().ensureCurrentSearchBatch();
                  if (!batchId) {
                    toast.error(
                      "Nenhum resultado disponível para abrir no Agente 1."
                    );
                    return;
                  }
                  useBatchPipelineStore.getState().setActiveBatch(batchId);
                  useBatchPipelineStore
                    .getState()
                    .updateBatchStage(batchId, "garimpo");
                  router.push(
                    `/agente-1?batchId=${encodeURIComponent(batchId)}`
                  );
                }}
              >
                <ArrowRight className="size-3.5" />
                Abrir no Agente 1
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={isGenerating}
                onClick={() => handleGenerateMore(50)}
              >
                {isGenerating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Plus className="size-3.5" />
                )}
                Gerar +50 Leads
              </Button>
              <Button
                size="sm"
                onClick={handleExportAll}
                variant="outline"
              >
                <Download className="size-3.5" />
                Exportar ({currentLeads.length})
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/leads">
                  <Target className="size-3.5" />
                  Meus Leads
                </Link>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
