"use client";

import { Infinity, Moon, Search, Sparkles, Wifi, Zap } from "lucide-react";
import { useSettingsStore } from "@/store/settings-store";
import { useUsageStore } from "@/store/usage-store";
import { AUTONOMOUS_VOLUME_24H_LABEL } from "@/lib/search/volume";
import {
  AUTONOMOUS_MODE_LABEL,
  AUTONOMOUS_MODE_TAGLINE,
  GOOGLE_CSE_LABEL,
  GOOGLE_CSE_TAGLINE,
  SERPAPI_PREMIUM_LABEL,
  SERPAPI_PREMIUM_TAGLINE,
} from "@/lib/mode-labels";
import { ModeQuickSwitcher } from "./mode-quick-switcher";
import { cn } from "@/lib/utils";

export function ActiveModeBanner() {
  const mode = useSettingsStore((s) => s.getActiveQuickSearchMode());
  const localProductionEnabled = useSettingsStore(
    (s) => s.localProductionEnabled
  );
  const nightModeActive = useSettingsStore((s) => s.nightModeActive);
  const useMaxLeads = useSettingsStore((s) => s.useMaxLeads);
  const remaining = useUsageStore((s) => s.getRemainingSerpApi());

  const isAutonomous = mode === "autonomous-24h";
  const isPremium = mode === "serpapi";
  const isGoogle = mode === "google-cse";

  return (
    <div
      className={cn(
        "rounded-2xl border p-5 shadow-lg",
        isAutonomous
          ? "border-indigo-500/35 bg-gradient-to-br from-indigo-500/10 via-card to-violet-500/5 shadow-indigo-500/10"
          : isPremium
            ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/8 via-card to-card shadow-emerald-500/5"
            : "border-blue-500/30 bg-gradient-to-br from-blue-500/8 via-card to-card shadow-blue-500/5"
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "flex size-12 shrink-0 items-center justify-center rounded-xl",
              isAutonomous
                ? "bg-indigo-500/20"
                : isPremium
                  ? "bg-emerald-500/20"
                  : "bg-blue-500/20"
            )}
          >
            {isAutonomous ? (
              <Moon className="size-6 text-indigo-300" />
            ) : isPremium ? (
              <Wifi className="size-6 text-emerald-300" />
            ) : (
              <Search className="size-6 text-blue-300" />
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "text-lg font-semibold",
                  isAutonomous
                    ? "text-indigo-100"
                    : isPremium
                      ? "text-emerald-100"
                      : "text-blue-100"
                )}
              >
                {isAutonomous
                  ? AUTONOMOUS_MODE_LABEL
                  : isPremium
                    ? SERPAPI_PREMIUM_LABEL
                    : GOOGLE_CSE_LABEL}
              </span>
              {isAutonomous && (
                <span className="rounded-full border border-indigo-400/40 bg-indigo-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-200">
                  Padrão
                </span>
              )}
              {localProductionEnabled && (
                <span className="rounded-full border border-violet-400/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-200">
                  Local 24h{nightModeActive ? " · noturno" : ""}
                </span>
              )}
              {isPremium && (
                <span className="rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-200">
                  Uso ocasional
                </span>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {isAutonomous
                ? AUTONOMOUS_MODE_TAGLINE
                : isPremium
                  ? `${SERPAPI_PREMIUM_TAGLINE} · ~${remaining} buscas restantes`
                  : GOOGLE_CSE_TAGLINE}
            </p>
            {isAutonomous && (
              <>
                <p className="flex items-center gap-1.5 text-xs text-indigo-300/80">
                  <Infinity className="size-3.5" />
                  Modo principal — volume ilimitado · auto-save · delay 3500–5000ms
                  <Sparkles className="size-3 opacity-60" />
                  SerpAPI Premium para buscas pontuais
                </p>
                {useMaxLeads && (
                  <p className="text-xs font-medium text-amber-300/90">
                    {AUTONOMOUS_VOLUME_24H_LABEL}
                  </p>
                )}
              </>
            )}
            {isPremium && (
              <p className="flex items-center gap-1.5 text-xs text-emerald-300/70">
                <Zap className="size-3.5" />
                Volte ao Scraping Autônomo para o dia a dia sem consumir quota
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0 space-y-2 lg:text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Alternar modo
          </p>
          <ModeQuickSwitcher />
        </div>
      </div>
    </div>
  );
}