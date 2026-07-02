"use client";

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

export function ActiveModeBadge({ className }: { className?: string }) {
  const mode = useSettingsStore((s) => s.getActiveQuickSearchMode());
  const profile = useSettingsStore((s) => s.searchProfile);
  const useMaxLeads = useSettingsStore((s) => s.useMaxLeads);
  const { isSerpActive, remaining, configured } = useSerpApiStatus();
  const equilibrium = isSerpApiEquilibriumMode(useMaxLeads, profile);
  const volumeHigh = isSerpApiVolumeMode(useMaxLeads, profile);

  if (mode === "autonomous-24h") {
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

  if (mode === "google-cse") {
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
      {isSerpActive
        ? volumeHigh
          ? "Volume Máximo"
          : equilibrium
            ? `${SERPAPI_PREMIUM_LABEL} · Equilíbrio`
            : SERPAPI_PREMIUM_LABEL
        : SERPAPI_PREMIUM_LABEL}
      {configured && (
        <span className="text-[10px] font-normal opacity-80">
          · ~{remaining} buscas
        </span>
      )}
    </Badge>
  );
}