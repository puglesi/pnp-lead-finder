"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Gauge,
  Key,
  Wifi,
} from "lucide-react";
import toast from "react-hot-toast";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardHeader,
} from "@/components/ui/collapsible-card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SerpApiActiveStatus } from "@/components/dashboard/serpapi-active-status";
import { AutonomousOptions } from "@/components/settings/autonomous-options";
import { SearchProfileSelector } from "@/components/settings/search-profile-selector";
import { useSerpApiStatus } from "@/hooks/use-serpapi-status";
import { useSettingsStore } from "@/store/settings-store";
import { useUsageStore } from "@/store/usage-store";
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
  const { configured, envKeyConfigured, isSerpActive, remaining, refresh } =
    useSerpApiStatus();
  const [showSerpKey, setShowSerpKey] = useState(false);
  const [serpKeyDraft, setSerpKeyDraft] = useState(() => ({
    source: "",
    value: "",
  }));

  // Store-backed fields: SSR / pre-hydrate use empty defaults for controlled inputs.
  const storeSerpKey = hydrated ? settings.serpApiKey : "";
  const storeGoogleKey = hydrated ? settings.googleApiKey : "";
  const storeGoogleCse = hydrated ? settings.googleCseId : "";

  const localSerpKey =
    hydrated && serpKeyDraft.source === settings.serpApiKey
      ? serpKeyDraft.value
      : storeSerpKey;

  const volume = getSettingsVolumeDisplay({
    hydrated,
    effectiveMaxResults: settings.getEffectiveMaxResults(),
    effectiveWorkers: settings.getEffectiveWorkers(),
    delayMs: settings.delayMs,
    searchProfile: settings.searchProfile,
    useMaxLeads: settings.useMaxLeads,
  });

  const handleSave = () => {
    settings.setSerpApiKey(localSerpKey.trim());
    if (localSerpKey.trim()) {
      useUsageStore.getState().clearCreditExhausted();
    }
    toast.success("Configurações de busca salvas!", { icon: "⚙️" });
    refresh();
  };

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
            Chave SerpAPI
            {isAutonomous && (
              <Badge variant="outline" className="text-xs font-normal">
                Premium · opcional
              </Badge>
            )}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Troque de conta facilmente — a chave fica salva localmente no
            navegador. Também aceita{" "}
            <code className="text-primary">SERPAPI_KEY</code> no{" "}
            <code className="text-primary">.env.local</code>.
          </p>
        </CollapsibleCardHeader>
        <CollapsibleCardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="serp-key">API Key SerpAPI</Label>
            <div className="relative">
              <Input
                id="serp-key"
                type={showSerpKey ? "text" : "password"}
                value={localSerpKey}
                onChange={(e) =>
                  setSerpKeyDraft({
                    source: storeSerpKey,
                    value: e.target.value,
                  })
                }
                placeholder="Cole sua chave SerpAPI aqui..."
                className="bg-background/50 pr-10 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowSerpKey(!showSerpKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showSerpKey ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant={hasSerpKey ? "success" : "outline"}>
              {hasSerpKey ? "Chave configurada" : "Aguardando chave"}
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

          <p className="text-xs text-muted-foreground">
            Se o crédito acabar, fallback automático discreto — a fila continua
            sem interrupção.
          </p>
        </CollapsibleCardContent>
      </CollapsibleCard>

      <CollapsibleCard storageKey="settings-google-search" className="border-border/60">
        <CollapsibleCardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Google Custom Search (opcional)
          </CardTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>API Key Google</Label>
            <Input
              type="password"
              value={storeGoogleKey}
              onChange={(e) => settings.setGoogleApiKey(e.target.value)}
              placeholder="GOOGLE_CSE_API_KEY"
              className="bg-background/50 font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label>Search Engine ID</Label>
            <Input
              value={storeGoogleCse}
              onChange={(e) => settings.setGoogleCseId(e.target.value)}
              placeholder="GOOGLE_CSE_ID"
              className="bg-background/50 font-mono text-sm"
            />
          </div>
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
                : "SerpAPI — configure chave"}
          </Badge>
        ) : (
          <Badge variant="secondary">Google CSE</Badge>
        )}
      </div>

      <Button
        onClick={handleSave}
        className="bg-emerald-600 text-white hover:bg-emerald-500"
      >
        Salvar Configurações
      </Button>
    </div>
  );
}
