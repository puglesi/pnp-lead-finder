"use client";


import { Moon, Radio, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSerpApiStatus } from "@/hooks/use-serpapi-status";
import { useSettingsStore } from "@/store/settings-store";
import { cn } from "@/lib/utils";

export function ProviderStatusBadge({ className }: { className?: string }) {
  const provider = useSettingsStore((s) => s.provider);
  const searchProfile = useSettingsStore((s) => s.searchProfile);
  const { status, isSerpActive, configured } = useSerpApiStatus();

  if (!status) {
    return (
      <Badge variant="outline" className={cn("gap-1.5", className)}>
        <Radio className="size-3 animate-pulse" />
        Conectando...
      </Badge>
    );
  }

  if (searchProfile === "autonomous-24h" || provider === "autonomous") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1.5 border-indigo-500/40 bg-indigo-500/10 text-indigo-300",
          className
        )}
      >
        <Moon className="size-3" />
        Scraping ativo
      </Badge>
    );
  }

  if (isSerpActive) {
    return (
      <Badge
        variant="success"
        className={cn("gap-1.5 shadow-sm shadow-emerald-500/20", className)}
      >
        <Wifi className="size-3" />
        Modo SerpAPI Ativo
      </Badge>
    );
  }

  if (provider === "serpapi") {
    return (
      <Badge variant="outline" className={cn("gap-1.5 text-xs", className)}>
        <WifiOff className="size-3" />
        {configured ? "SerpAPI pronta" : "SerpAPI — configure chave"}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={cn("gap-1.5 text-xs opacity-70", className)}>
      Google CSE
    </Badge>
  );
}