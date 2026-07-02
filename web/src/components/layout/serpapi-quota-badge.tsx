"use client";

import { Gauge, Moon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSerpApiStatus } from "@/hooks/use-serpapi-status";
import { useSettingsStore } from "@/store/settings-store";
import { SERPAPI_FREE_MONTHLY_LIMIT } from "@/lib/search/volume";
import { cn } from "@/lib/utils";

export function SerpApiQuotaBadge({ className }: { className?: string }) {
  const profile = useSettingsStore((s) => s.searchProfile);
  const { remaining, creditExhausted, configured, isSerpActive } =
    useSerpApiStatus();
  const used = SERPAPI_FREE_MONTHLY_LIMIT - remaining;
  const pct = Math.round((used / SERPAPI_FREE_MONTHLY_LIMIT) * 100);

  if (profile === "autonomous-24h") {
    return (
      <div
        className={cn(
          "hidden items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 sm:flex",
          className
        )}
      >
        <Moon className="size-4 text-indigo-400" />
        <div className="text-left">
          <p className="text-xs font-medium leading-none text-indigo-300">
            24h Autônomo
          </p>
          <p className="text-[10px] text-muted-foreground">Scraping ilimitado</p>
        </div>
      </div>
    );
  }

  const low = remaining <= 30;

  return (
    <div
      className={cn(
        "hidden items-center gap-2 rounded-lg border px-3 py-1.5 sm:flex",
        creditExhausted || low
          ? "border-amber-500/40 bg-amber-500/10"
          : "border-emerald-500/30 bg-emerald-500/10",
        className
      )}
    >
      <Gauge
        className={cn(
          "size-4",
          creditExhausted || low ? "text-amber-400" : "text-emerald-400"
        )}
      />
      <div className="text-left">
        <p className="text-xs font-medium leading-none">
          {isSerpActive ? "SerpAPI Ativo" : "SerpAPI"}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {creditExhausted
            ? "Fallback autônomo"
            : configured
              ? `~${remaining} restantes · ${pct}% usado`
              : "Configure chave"}
        </p>
      </div>
    </div>
  );
}