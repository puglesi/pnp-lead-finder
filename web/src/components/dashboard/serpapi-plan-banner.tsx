"use client";

import {
  AlertTriangle,
  Scale,
  Sparkles,
  Zap,
} from "lucide-react";
import { useSettingsStore } from "@/store/settings-store";
import { useUsageStore } from "@/store/usage-store";
import {
  SERPAPI_EQUILIBRIUM_DEFAULT,
  SERPAPI_EQUILIBRIUM_MODE_LABEL,
  SERPAPI_FREE_MONTHLY_LIMIT,
  SERPAPI_PAGES_EQUILIBRIUM_MAX,
  SERPAPI_PAGES_VOLUME_MAX,
  SERPAPI_PAGES_VOLUME_MIN,
  SERPAPI_VOLUME_DEFAULT,
  SERPAPI_VOLUME_EXECUTION_LEADS_MAX,
  SERPAPI_VOLUME_MODE_LABEL,
  formatVolumeExecutionEstimate,
  isSerpApiEquilibriumMode,
  isSerpApiVolumeMode,
} from "@/lib/search/volume";
import { SERPAPI_PREMIUM_LABEL } from "@/lib/mode-labels";
import { cn } from "@/lib/utils";

export function SerpApiPlanBanner() {
  const profile = useSettingsStore((s) => s.searchProfile);
  const useMaxLeads = useSettingsStore((s) => s.useMaxLeads);
  const remaining = useUsageStore((s) => s.getRemainingSerpApi());
  const creditExhausted = useUsageStore((s) => s.creditExhausted);

  if (profile !== "serpapi") return null;

  const equilibrium = isSerpApiEquilibriumMode(useMaxLeads, profile);
  const volumeHigh = isSerpApiVolumeMode(useMaxLeads, profile);

  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3 text-sm",
        volumeHigh
          ? "border-orange-500/35 bg-orange-500/8"
          : creditExhausted || remaining <= 30
            ? "border-amber-500/40 bg-amber-500/10"
            : "border-emerald-500/25 bg-emerald-500/5"
      )}
    >
      {volumeHigh ? (
        <Zap className="mt-0.5 size-4 shrink-0 text-orange-400" />
      ) : creditExhausted || remaining <= 30 ? (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
      ) : (
        <Scale className="mt-0.5 size-4 shrink-0 text-emerald-400" />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium text-emerald-200">
          {SERPAPI_PREMIUM_LABEL}
          {volumeHigh && " · Volume Máximo"}
          {equilibrium && !volumeHigh && " · Equilíbrio"}
        </p>
        {volumeHigh ? (
          <p className="text-muted-foreground">
            {SERPAPI_VOLUME_MODE_LABEL} · {SERPAPI_VOLUME_DEFAULT} leads/setor ·{" "}
            {SERPAPI_PAGES_VOLUME_MIN}–{SERPAPI_PAGES_VOLUME_MAX} páginas ·{" "}
            {formatVolumeExecutionEstimate().toLowerCase()} · ~{remaining} buscas
            ({SERPAPI_FREE_MONTHLY_LIMIT}/mês).
          </p>
        ) : (
          <p className="text-muted-foreground">
            {SERPAPI_EQUILIBRIUM_MODE_LABEL} · {SERPAPI_EQUILIBRIUM_DEFAULT}{" "}
            leads/setor · {SERPAPI_PAGES_EQUILIBRIUM_MAX} páginas · ~{remaining}{" "}
            buscas restantes.
            {creditExhausted && " Crédito esgotado → fallback automático."}
          </p>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="size-3" />
          Modo premium para qualidade máxima — no dia a dia use Scraping
          Autônomo (ilimitado)
        </p>
        {equilibrium && (
          <p className="text-xs text-emerald-300/80">
            Volume Máximo em Avançadas — até{" "}
            {SERPAPI_VOLUME_EXECUTION_LEADS_MAX.toLocaleString("pt-BR")} leads
          </p>
        )}
      </div>
    </div>
  );
}