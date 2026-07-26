"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Search,
  MapPin,
  Sparkles,
  Layers,
  Settings2,
  Moon,
  Infinity,
} from "lucide-react";
import toast from "react-hot-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLeadStore } from "@/store/lead-store";
import { useSettingsStore } from "@/store/settings-store";
import { useUsageStore } from "@/store/usage-store";
import { parseSectors } from "@/lib/worker-pool";
import {
  estimateSerpApiCalls,
  estimateTotalLeadsRange,
  formatLeadsLabel,
  formatSerpApiForecast,
  formatVolumeExecutionEstimate,
  getSerpApiPagesPerSector,
  isRecommendedLeadCount,
  AUTONOMOUS_REALISTIC_EXECUTION_MAX,
  AUTONOMOUS_REALISTIC_EXECUTION_MIN,
  AUTONOMOUS_STANDARD_MAX,
  AUTONOMOUS_VOLUME_24H_LABEL,
  AUTONOMOUS_VOLUME_MAX,
  AUTONOMOUS_VOLUME_MIN,
  isAutonomousVolumeMode,
  isSerpApiEquilibriumMode,
  isSerpApiVolumeMode,
  SERPAPI_EQUILIBRIUM_DEFAULT,
  SERPAPI_EQUILIBRIUM_MODE_LABEL,
  SERPAPI_PAGES_EQUILIBRIUM_MIN,
  SERPAPI_PAGES_EQUILIBRIUM_MAX,
  SERPAPI_PAGES_VOLUME_MIN,
  SERPAPI_PAGES_VOLUME_MAX,
  SERPAPI_VOLUME_MODE_LABEL,
} from "@/lib/search/volume";
import { AUTONOMOUS_MODE_LABEL, SERPAPI_PREMIUM_LABEL } from "@/lib/mode-labels";
import {
  getSourceShortLabel,
} from "@/types/autonomous-sources";
import { ActiveModeBadge } from "./active-mode-badge";
import { QuickConfigBar } from "./quick-config-bar";

interface QuickSearchProps {
  defaultLocation?: string;
}

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

export function QuickSearch(props: QuickSearchProps) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot
  );

  return (
    <QuickSearchContent
      key={hydrated ? "hydrated" : "server"}
      {...props}
      hydrated={hydrated}
    />
  );
}

function QuickSearchContent({
  defaultLocation = "London",
  hydrated,
}: QuickSearchProps & { hydrated: boolean }) {
  const router = useRouter();
  const {
    performBulkSearch,
    isSearching,
    lastBulkSearchSectors,
    lastBulkSearchLocation,
  } = useLeadStore();
  const settings = useSettingsStore();
  const remaining = useUsageStore((s) => s.getRemainingSerpApi());
  const creditExhausted = useUsageStore((s) => s.creditExhausted);
  const [sectors, setSectors] = useState(
    hydrated ? lastBulkSearchSectors : ""
  );
  const [location, setLocation] = useState(
    hydrated ? lastBulkSearchLocation || defaultLocation : defaultLocation
  );

  const sectorList = parseSectors(sectors);
  const effectiveWorkers = settings.getEffectiveWorkers();
  const effectiveMax = settings.getEffectiveMaxResults();
  const isAutonomous = settings.searchProfile === "autonomous-24h";
  const leadsLabel = formatLeadsLabel(
    settings.maxResults,
    settings.useMaxLeads,
    settings.provider,
    settings.searchProfile
  );
  const serpPagination = {
    useMaxLeads: settings.useMaxLeads,
    deepPagination: settings.serpapiDeepPagination,
  };
  const volumeMode = isSerpApiVolumeMode(
    settings.useMaxLeads,
    settings.searchProfile,
    settings.provider
  );
  const autonomousVolume = isAutonomousVolumeMode(
    settings.useMaxLeads,
    settings.searchProfile,
    settings.provider
  );
  const equilibriumMode = isSerpApiEquilibriumMode(
    settings.useMaxLeads,
    settings.searchProfile,
    settings.provider
  );
  const pagesPerSector = getSerpApiPagesPerSector({
    ...serpPagination,
    leadsPerSector: effectiveMax,
  });
  const estimatedCalls = estimateSerpApiCalls(
    sectorList.length,
    settings.provider,
    settings.searchProfile,
    effectiveMax,
    serpPagination
  );
  const leadsRange = estimateTotalLeadsRange(
    sectorList.length,
    effectiveMax,
    {
      useMaxLeads: settings.useMaxLeads,
      searchProfile: settings.searchProfile,
      provider: settings.provider,
    }
  );
  const serpForecast = formatSerpApiForecast(sectorList.length, pagesPerSector);
  const afterCalls = Math.max(0, remaining - estimatedCalls);
  const recommended = isRecommendedLeadCount(effectiveMax);
  const activeAutonomousSources = isAutonomous
    ? settings.getActiveAutonomousSources()
    : [];

  const handleSearch = async () => {
    if (sectorList.length === 0 || !location.trim()) {
      toast.error("Preencha os setores e a localização.");
      return;
    }

    if (
      settings.searchProfile === "serpapi" &&
      settings.provider === "serpapi" &&
      estimatedCalls > 0 &&
      estimatedCalls > remaining &&
      !creditExhausted
    ) {
      toast.error(
        `Saldo insuficiente: ${remaining} buscas restantes, operação precisa de ${estimatedCalls}.`,
        { duration: 5000 }
      );
      return;
    }

    router.push("/resultados");

    try {
      await performBulkSearch(sectors, location.trim());
      const state = useLeadStore.getState();
      const summary = state.bulkProgress.searchSummary;
      if (summary) {
        const timeSec = (summary.elapsedMs / 1000).toFixed(1);
        const parts = [
          summary.apiCallsConsumed > 0
            ? `Consumidas: ${summary.apiCallsConsumed} buscas`
            : null,
          `Leads: ${summary.leadsFound}`,
          `${timeSec}s`,
          summary.autoSavedCount
            ? `${summary.autoSavedCount} salvos`
            : null,
        ].filter(Boolean);
        toast.success(parts.join(" | "), {
          icon: summary.creditExhausted ? "⚠️" : "🚀",
          duration: 6000,
        });
        if (summary.creditExhausted) {
          toast(
            "Crédito SerpAPI esgotado — continuando com fallback automático.",
            { icon: "🔄", duration: 6000 }
          );
        }
      }
    } catch {
      toast.error("Erro ao realizar a busca. Tente novamente.");
    }
  };

  return (
    <Card className="border-border/60 bg-gradient-to-br from-card via-card to-blue-500/5 shadow-xl shadow-blue-500/5">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="size-5 text-emerald-400" />
              Busca em Volume V2
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {isAutonomous
                ? autonomousVolume
                  ? `${AUTONOMOUS_MODE_LABEL} · Volume Alto 24h · até ${AUTONOMOUS_VOLUME_MAX}/setor`
                  : `${AUTONOMOUS_MODE_LABEL} · até ${AUTONOMOUS_STANDARD_MAX}/setor · ilimitado`
                : `${SERPAPI_PREMIUM_LABEL} · Equilíbrio ${SERPAPI_EQUILIBRIUM_DEFAULT} leads/setor`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ActiveModeBadge />
            <Button variant="outline" size="sm" asChild>
              <Link href="/configuracoes/avancadas">
                <Settings2 className="size-3.5" />
                Avançadas
              </Link>
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Badge variant="secondary">
            <Layers className="mr-1 size-3" />
            {sectorList.length} na fila
          </Badge>
          <Badge variant="outline">{effectiveWorkers} workers</Badge>
          <Badge
            variant={recommended ? "success" : "outline"}
            className="tabular-nums"
          >
            {leadsLabel}/setor
          </Badge>
          <Badge variant="outline">{settings.delayMs}ms</Badge>
          {equilibriumMode && (
            <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-300">
              Equilíbrio
            </Badge>
          )}
          {autonomousVolume && (
            <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-300">
              Volume Alto 24h
            </Badge>
          )}
          {volumeMode && (
            <Badge className="border-orange-500/40 bg-orange-500/15 text-orange-300">
              Volume Máximo
            </Badge>
          )}
          {settings.mode24h && (
            <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-300">
              24h
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAutonomous && (
          <div
            className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
              autonomousVolume
                ? "border-amber-500/35 bg-amber-500/8 text-amber-100/90"
                : "border-indigo-500/30 bg-indigo-500/5 text-muted-foreground"
            }`}
          >
            <Moon className="mt-0.5 size-4 shrink-0 text-indigo-400" />
            <div className="space-y-1">
              <p>
                Uma fila bem trabalhada —{" "}
                <strong className="text-foreground">
                  {sectorList.length} setores
                </strong>{" "}
                em sequência · auto-save ativo
              </p>
              <p className="flex items-center gap-1 text-xs">
                <Infinity className="size-3" />
                Delay {settings.delayMs}ms · Maps + Yell + CH · ~
                {effectiveMax} leads/setor
                {autonomousVolume
                  ? ` · alvo ${AUTONOMOUS_REALISTIC_EXECUTION_MIN}–${AUTONOMOUS_REALISTIC_EXECUTION_MAX}`
                  : ` · meta ${AUTONOMOUS_REALISTIC_EXECUTION_MIN}–${AUTONOMOUS_REALISTIC_EXECUTION_MAX}`}
              </p>
              {activeAutonomousSources.length > 0 && (
                <p className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Fontes:</span>
                  {activeAutonomousSources.map((id) => (
                    <Badge
                      key={id}
                      className="border-indigo-400/30 bg-indigo-500/10 text-[10px] text-indigo-200"
                    >
                      {getSourceShortLabel(id)}
                    </Badge>
                  ))}
                  <span className="text-muted-foreground">
                    · {settings.autonomousSourceStrategy === "parallel"
                      ? "paralelo"
                      : settings.autonomousSourceStrategy === "rotate"
                        ? "rotação"
                        : "única"}
                  </span>
                </p>
              )}
              {autonomousVolume && (
                <p className="flex items-center gap-1 text-xs font-medium text-amber-300/90">
                  <AlertTriangle className="size-3" />
                  {AUTONOMOUS_VOLUME_24H_LABEL}
                </p>
              )}
              {autonomousVolume && sectorList.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Estimativa: {leadsRange.min.toLocaleString("pt-BR")}–
                  {leadsRange.max.toLocaleString("pt-BR")} leads · pode levar
                  várias horas
                </p>
              )}
            </div>
          </div>
        )}

        {!isAutonomous && estimatedCalls > 0 && (
          <div
            className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
              volumeMode || estimatedCalls > remaining || creditExhausted
                ? "border-orange-500/40 bg-orange-500/10 text-orange-100/90"
                : equilibriumMode
                  ? "border-emerald-500/35 bg-emerald-500/8 text-muted-foreground"
                  : "border-blue-500/30 bg-blue-500/5 text-muted-foreground"
            }`}
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div className="space-y-1">
              <p>
                Esta operação consumirá aproximadamente{" "}
                <strong className="text-foreground">{estimatedCalls}</strong>{" "}
                {estimatedCalls === 1 ? "busca" : "buscas"}
                <span className="text-muted-foreground">
                  {" "}
                  ({serpForecast})
                </span>
              </p>
              <p>
                {volumeMode ? (
                  <>
                    <strong className="text-orange-300">
                      {formatVolumeExecutionEstimate()}
                    </strong>
                    <span className="text-muted-foreground">
                      {" "}
                      · {effectiveMax} leads/setor · máximo por execução
                    </span>
                  </>
                ) : (
                  <>
                    Estimativa de leads:{" "}
                    <strong className="text-emerald-400">
                      {leadsRange.min.toLocaleString("pt-BR")}–
                      {leadsRange.max.toLocaleString("pt-BR")}
                    </strong>
                  </>
                )}
              </p>
              {equilibriumMode && (
                <p className="text-xs font-medium text-emerald-300/90">
                  {SERPAPI_EQUILIBRIUM_MODE_LABEL}
                </p>
              )}
              {volumeMode && (
                <p className="text-xs font-medium text-orange-300/90">
                  {SERPAPI_VOLUME_MODE_LABEL}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Paginação: {pagesPerSector} páginas/setor ·{" "}
                {effectiveMax} leads/setor
                {equilibriumMode &&
                  ` · ${SERPAPI_PAGES_EQUILIBRIUM_MIN}–${SERPAPI_PAGES_EQUILIBRIUM_MAX} páginas (ROI)`}
                {volumeMode &&
                  ` · ${SERPAPI_PAGES_VOLUME_MIN}–${SERPAPI_PAGES_VOLUME_MAX} páginas agressivas · prioridade: quantidade total`}
              </p>
              <p className="text-xs">
                Após a busca: ~{afterCalls} restantes este mês
                {creditExhausted && " · crédito esgotado → fallback automático"}
              </p>
            </div>
          </div>
        )}

        <QuickConfigBar />
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Fila de setores (vírgula ou →)
            {lastBulkSearchSectors && (
              <span className="ml-2 text-xs font-normal text-emerald-400/80">
                · última pesquisa restaurada
              </span>
            )}
          </label>
          <Textarea
            placeholder="Sua última fila de setores aparecerá aqui"
            value={sectors}
            onChange={(e) => setSectors(e.target.value)}
            className="min-h-[80px] bg-background/50 font-mono text-sm"
            disabled={isSearching}
          />
        </div>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Ex: London, Manchester, Birmingham..."
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="h-11 bg-background/50 pl-10"
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSearch()}
            disabled={isSearching}
          />
        </div>
        <Button
          size="lg"
          onClick={handleSearch}
          disabled={isSearching}
          className="h-12 w-full bg-gradient-to-r from-blue-600 to-emerald-600 text-base font-semibold shadow-lg shadow-blue-500/25 transition-all hover:from-blue-500 hover:to-emerald-500"
        >
          {isSearching ? (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Processando fila ({sectorList.length} setores)...
            </>
          ) : (
            <>
              <Search className="size-5" />
              Iniciar Fila de Busca
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}