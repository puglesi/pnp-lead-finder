"use client";

import { Check, Globe, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  AUTONOMOUS_24H_DEFAULTS,
  useSettingsStore,
} from "@/store/settings-store";
import {
  AUTONOMOUS_SOURCE_CATALOG,
  getSourceShortLabel,
  type AutonomousSourceId,
  type AutonomousSourceStrategy,
} from "@/types/autonomous-sources";
import { cn } from "@/lib/utils";

const STRATEGIES: {
  id: AutonomousSourceStrategy;
  label: string;
  hint: string;
}[] = [
  {
    id: "parallel",
    label: "Buscar em todas selecionadas",
    hint: "Combina resultados de todas as fontes marcadas",
  },
  {
    id: "rotate",
    label: "Alternar (rotação automática)",
    hint: "Roda entre as fontes a cada setor — estável para 24h",
  },
  {
    id: "single",
    label: "Apenas uma fonte",
    hint: "Usa somente a fonte escolhida abaixo",
  },
];

export function AutonomousSourcesPicker({
  compact,
  hydrated = true,
}: {
  compact?: boolean;
  hydrated?: boolean;
}) {
  const settings = useSettingsStore();
  const selectedSources = hydrated
    ? settings.autonomousSources
    : [...AUTONOMOUS_24H_DEFAULTS.autonomousSources];
  const sourceStrategy = hydrated
    ? settings.autonomousSourceStrategy
    : AUTONOMOUS_24H_DEFAULTS.autonomousSourceStrategy;
  const singleSource = hydrated
    ? settings.autonomousSingleSource
    : AUTONOMOUS_24H_DEFAULTS.autonomousSingleSource;
  const enrichWebsites = hydrated
    ? settings.autonomousEnrichWebsites
    : AUTONOMOUS_24H_DEFAULTS.autonomousEnrichWebsites;
  const activeSources = hydrated
    ? settings.getActiveAutonomousSources()
    : [...AUTONOMOUS_24H_DEFAULTS.autonomousSources];
  const searchProfile = hydrated
    ? settings.searchProfile
    : AUTONOMOUS_24H_DEFAULTS.searchProfile;

  if (searchProfile !== "autonomous-24h") return null;

  return (
    <div
      className={cn(
        "space-y-4 rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-4",
        compact && "p-3"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-indigo-200">
            <Globe className="size-4" />
            Fontes de busca
          </p>
          {!compact && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Prioridade UK: Maps + Yell + Companies House · enrich de sites
            </p>
          )}
        </div>
        <Badge variant="outline" className="text-[10px]">
          {activeSources.length} ativa{activeSources.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {AUTONOMOUS_SOURCE_CATALOG.map((source) => {
          const checked = selectedSources.includes(source.id);
          return (
            <button
              key={source.id}
              type="button"
              onClick={() => settings.toggleAutonomousSource(source.id)}
              title={source.description}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all",
                checked
                  ? "border-indigo-400/50 bg-indigo-500/20 text-indigo-900 dark:text-indigo-100"
                  : "border-border/60 bg-background/40 text-muted-foreground hover:border-indigo-400/30"
              )}
            >
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded border",
                  checked
                    ? "border-indigo-400 bg-indigo-500 text-white"
                    : "border-border/80"
                )}
              >
                {checked && <Check className="size-3" />}
              </span>
              <span className="flex items-center gap-1.5">
                {source.label}
                {source.ukPriority && (
                  <Badge className="h-4 px-1 text-[9px] text-indigo-200">
                    UK
                  </Badge>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Como buscar
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {STRATEGIES.map((strategy) => {
            const active = sourceStrategy === strategy.id;
            return (
              <button
                key={strategy.id}
                type="button"
                onClick={() =>
                  settings.setAutonomousSourceStrategy(strategy.id)
                }
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm transition-all",
                  active
                    ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-900 dark:text-indigo-100"
                    : "border-border/60 hover:border-indigo-400/25"
                )}
              >
                <p className="font-medium">{strategy.label}</p>
                {!compact && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {strategy.hint}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {sourceStrategy === "single" && (
        <div className="flex flex-wrap gap-2">
          {selectedSources.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => settings.setAutonomousSingleSource(id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-all",
                singleSource === id
                  ? "border-indigo-400/60 bg-indigo-500/20 text-indigo-900 dark:text-indigo-100"
                  : "border-border/60 text-muted-foreground"
              )}
            >
              {getSourceShortLabel(id)}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
        <Layers className="size-3.5 text-indigo-300/70" />
        <span className="text-xs text-muted-foreground">Ativas agora:</span>
        {activeSources.map((id) => (
          <Badge
            key={id}
            className="border-indigo-400/30 bg-indigo-500/15 text-[10px] text-indigo-800 dark:text-indigo-200"
          >
            {getSourceShortLabel(id)}
          </Badge>
        ))}
        {enrichWebsites && (
          <Badge variant="outline" className="text-[10px]">
            + enrich sites
          </Badge>
        )}
      </div>
    </div>
  );
}
