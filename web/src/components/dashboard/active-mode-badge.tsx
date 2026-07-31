"use client";

import { useSyncExternalStore } from "react";
import { Moon, Scale, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSerpApiStatus } from "@/hooks/use-serpapi-status";
import { useSettingsStore } from "@/store/settings-store";
import {
  AUTONOMOUS_MODE_LABEL,
  AUTONOMOUS_MODE_SHORT,
  SERPAPI_PREMIUM_LABEL,
} from "@/lib/mode-labels";
import { isSerpApiEquilibriumMode, isSerpApiVolumeMode } from "@/lib/search/volume";
import { cn } from "@/lib/utils";

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

export function ActiveModeBadge({
  className,
  hydrated: hydratedOverride,
}: {
  className?: string;
  /** Optional external hydration flag; defaults to client-safe internal gate. */
  hydrated?: boolean;
}) {
  const autoHydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot
  );
  const hydrated = hydratedOverride ?? autoHydrated;
  const mode = useSettingsStore((s) => s.getActiveQuickSearchMode());
  const profile = useSettingsStore((s) => s.searchProfile);
  const useMaxLeads = useSettingsStore((s) => s.useMaxLeads);
  const { isSerpActive, remaining, configured } = useSerpApiStatus();
  // Always render the default autonomous badge until the store is hydrated.
  const renderMode = hydrated ? mode : "autonomous-24h";
  const renderProfile = hydrated ? profile : "autonomous-24h";
  const renderUseMaxLeads = hydrated ? useMaxLeads : false;
  const equilibrium = isSerpApiEquilibriumMode(
    renderUseMaxLeads,
    renderProfile
  );
  const volumeHigh = isSerpApiVolumeMode(renderUseMaxLeads, renderProfile);

  if (renderMode === "autonomous-24h") {
    return (
      <Badge
        className={cn(
          "gap-1.5 border-indigo-500/40 bg-indigo-500/15 px-3 py-1.5 text-indigo-200",
          className
        )}
      >
        <Moon className="size-3.5" />
        {AUTONOMOUS_MODE_SHORT}
        <span className="opacity-60">·</span>
        <span className="text-[10px] font-normal">{AUTONOMOUS_MODE_LABEL}</span>
      </Badge>
    );
  }

  if (renderMode === "google-cse") {
    return (
      <Badge
        className={cn(
          "gap-1.5 border-blue-500/40 bg-blue-500/15 px-3 py-1.5 text-blue-200",
          className
        )}
      >
        Google CSE
      </Badge>
    );
  }

  return (
    <Badge
      variant="success"
      className={cn(
        "gap-1.5 px-3 py-1.5 shadow-sm",
        volumeHigh
          ? "border-orange-500/40 bg-orange-500/15 text-orange-200 shadow-orange-500/15"
          : "shadow-emerald-500/15",
        className
      )}
    >
      {volumeHigh ? (
        <Wifi className="size-3.5" />
      ) : (
        <Scale className="size-3.5" />
      )}
      {hydrated && isSerpActive
        ? volumeHigh
          ? "Volume Máximo"
          : equilibrium
            ? `${SERPAPI_PREMIUM_LABEL} · Equilíbrio`
            : SERPAPI_PREMIUM_LABEL
        : SERPAPI_PREMIUM_LABEL}
      {hydrated && configured && (
        <span className="text-[10px] font-normal opacity-80">
          · ~{remaining} buscas
        </span>
      )}
    </Badge>
  );
}
