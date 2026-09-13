"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Gauge,
  Key,
  Wifi,
} from "lucide-react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardHeader,
} from "@/components/ui/collapsible-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SerpApiActiveStatus } from "@/components/dashboard/serpapi-active-status";
import { AutonomousOptions } from "@/components/settings/autonomous-options";
import { SearchProfileSelector } from "@/components/settings/search-profile-selector";
import { useSerpApiStatus } from "@/hooks/use-serpapi-status";
import { useSettingsStore } from "@/store/settings-store";
import {
  AUTONOMOUS_VOLUME_MAX,
  DEFAULT_LEADS_PER_SECTOR,
  RECOMMENDED_LEADS_MAX,
  RECOMMENDED_LEADS_MIN,
  SERPAPI_EQUILIBRIUM_MODE_LABEL,
  SERPAPI_MAX_LEADS,
  SERPAPI_PAGES_EQUILIBRIUM_MAX,
  SERPAPI_PAGES_EQUILIBRIUM_MIN,
  SERPAPI_FREE_MONTHLY_LIMIT,
} from "@/lib/search/volume";
import {
  getSettingsVolumeDisplay,
  SETTINGS_SSR_DISPLAY_DEFAULTS,
} from "@/lib/settings-hydration";
import { cn } from "@/lib/utils";

const subscribeHydration = () => () => {};
const getClientHydrated = () => true;
const getServerHydrated = () => false;

export function SearchSettingsForm() {
  // First client paint must match SSR (defaults). After hydrate, show persisted.
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    getClientHydrated,
    getServerHydrated
  );

  const settings = useSettingsStore();
  const { configured, envKeyConfigured, isSerpActive, remaining } =
    useSerpApiStatus();

  const volume = getSettingsVolumeDisplay({
    hydrated,
    effectiveMaxResults: settings.getEffectiveMaxResults(),
    effectiveWorkers: settings.getEffectiveWorkers(),
    delayMs: settings.delayMs,
    searchProfile: settings.searchProfile,
    useMaxLeads: settings.useMaxLeads,
  });

  const isAutonomous = volume.isAutonomous;
  // Before hydrate, don't flash SerpAPI remaining from client-only fetches.
  const hasSerpKey = hydrated ? configured : false;
  const serpLive = hydrated ? isSerpActive : false;
  const displayRemaining = hydrated ? remaining : SERPAPI_FREE_MONTHLY_LIMIT;

  return (
    <div className="space-y-6">
      <SerpApiActiveStatus />
      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold">Perfil de Busca</h3>
          <p className="text-sm text-muted-foreground">
            Modo principal: Scraping Autônomo ilimitado · SerpAPI Premium para
            buscas pontuais de alta qualidade
          </p>
        </div>
        <SearchProfileSelector />
      </div>

      <AutonomousOptions />

      <CollapsibleCard
        storageKey="settings-serpapi-key"
        className={cn(
          "border-border/60",
          isAutonomous && "opacity-80"
        )}
      >
        <CollapsibleCardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Key className="size-5 text-emerald-400" />
            SerpAPI — servidor
            {isAutonomous && (
              <Badge variant="outline" className="text-xs font-normal">
                Premium · opcional
              </Badge>
            )}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            A chave não é pedida nem guardada no browser. Use{" "}
            <code className="text-primary">SERPAPI_KEY</code> em{" "}
            <code className="text-primary">web/.env.local</code>.
          </p>
        </CollapsibleCardHeader>
        <CollapsibleCardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={hasSerpKey ? "success" : "outline"}>
              {hasSerpKey ? "Chave no servidor" : "Aguardando SERPAPI_KEY"}
            </Badge>
            {serpLive && (
              <Badge variant="success">
                Modo SerpAPI Ativo · ~{displayRemaining} restantes
              </Badge>
            )}
            {hydrated && envKeyConfigured && (
              <Badge variant="outline" className="font-mono text-[10px]">
                SERPAPI_KEY · .env.local
              </Badge>
            )}
          </div>
        </CollapsibleCardContent>
      </CollapsibleCard>

      <CollapsibleCard storageKey="settings-google-search" className="border-border/60">
        <CollapsibleCardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Google Custom Search (opcional)
          </CardTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent className="text-sm text-muted-foreground">
          Configure <code>GOOGLE_CSE_API_KEY</code> e <code>GOOGLE_CSE_ID</code>{" "}
          no ambiente do servidor. O browser não envia essas chaves.
        </CollapsibleCardContent>
      </CollapsibleCard>

      <Card
        className={cn(
          "border-border/60",
          hasSerpKey
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-amber-500/30 bg-amber-500/5"
        )}
      >
        <CardContent className="flex items-start gap-3 p-5">
          {hasSerpKey ? (
            <Wifi className="mt-0.5 size-5 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-400" />
          )}
          <div>
            <p className="font-medium">
              {hasSerpKey
                ? hydrated && envKeyConfigured
                  ? "SERPAPI_KEY detectada automaticamente no .env.local"
                  : "SerpAPI configurada — busca real disponível"
                : "Busca real não configurada"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Plano Free: {SERPAPI_FREE_MONTHLY_LIMIT} buscas/mês. Modo
              Equilíbrio: {SERPAPI_PAGES_EQUILIBRIUM_MIN}–
              {SERPAPI_PAGES_EQUILIBRIUM_MAX} buscas/setor. Use com
              inteligência.
            </p>
            <code className="mt-2 block rounded-md border border-border/60 bg-background/50 px-3 py-2 text-xs">
              web/.env.local → SERPAPI_KEY=sua_chave_aqui
            </code>
          </div>
        </CardContent>
      </Card>

      <CollapsibleCard storageKey="settings-volume-quality" className="border-border/60">
        <CollapsibleCardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Gauge className="size-5 text-blue-400" />
            Volume & Qualidade
          </CardTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Padrão Equilíbrio:{" "}
            <strong className="text-foreground">
              {DEFAULT_LEADS_PER_SECTOR}
            </strong>{" "}
            leads/setor ({RECOMMENDED_LEADS_MIN}–{RECOMMENDED_LEADS_MAX}) ·
            Volume Máximo: {SERPAPI_MAX_LEADS}/setor · 8–10 páginas · Autônomo: até{" "}
            {AUTONOMOUS_VOLUME_MAX} (Volume Alto 24h)
          </p>
          {!volume.isAutonomous && !volume.useMaxLeads && (
            <p className="text-xs text-emerald-300/90">
              {SERPAPI_EQUILIBRIUM_MODE_LABEL}
            </p>
          )}
          <p>
            Atual:{" "}
            <strong>{volume.effectiveMaxResults}</strong>/setor · Workers:{" "}
            {volume.effectiveWorkers} · Delay: {volume.delayMs}ms
            {!volume.isAutonomous &&
              !volume.useMaxLeads &&
              ` · ${SERPAPI_PAGES_EQUILIBRIUM_MIN}–${SERPAPI_PAGES_EQUILIBRIUM_MAX} páginas/setor`}
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/configuracoes/avancadas">
              Ajustar volume e workers
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </CollapsibleCardContent>
      </CollapsibleCard>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Status:</span>
        {volume.isAutonomous ? (
          <Badge variant="outline" className="gap-1 border-indigo-500/40 text-indigo-300">
            Scraping Autônomo · Google+Bing+DDG
          </Badge>
        ) : (hydrated
            ? settings.searchProfile
            : SETTINGS_SSR_DISPLAY_DEFAULTS.searchProfile) === "serpapi" ? (
          <Badge variant={serpLive ? "success" : "outline"}>
            {serpLive
              ? `Modo SerpAPI Ativo · ~${displayRemaining} buscas`
              : hasSerpKey
                ? "SerpAPI configurada — ative o perfil Premium"
                : "SerpAPI — defina SERPAPI_KEY no servidor"}
          </Badge>
        ) : (
          <Badge variant="secondary">Google CSE</Badge>
        )}
      </div>
    </div>
  );
}
