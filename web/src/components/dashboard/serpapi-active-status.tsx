"use client";

import { AlertTriangle, Wifi, Zap } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { useSerpApiStatus } from "@/hooks/use-serpapi-status";
import { SERPAPI_FREE_MONTHLY_LIMIT } from "@/lib/search/volume";
import { cn } from "@/lib/utils";

const subscribeToMount = () => () => {};
const getClientMountSnapshot = () => true;
const getServerMountSnapshot = () => false;

export function SerpApiActiveStatus({
  className,
  compact,
}: {
  className?: string;
  compact?: boolean;
}) {
  const mounted = useSyncExternalStore(
    subscribeToMount,
    getClientMountSnapshot,
    getServerMountSnapshot
  );
  const { isSerpActive, configured, remaining, creditExhausted, envKeyConfigured, status } =
    useSerpApiStatus();

  if (!mounted) return null;
  if (!configured) return null;

  if (creditExhausted) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm",
          className
        )}
      >
        <AlertTriangle className="size-4 shrink-0 text-amber-400" />
        <div>
          <p className="font-medium text-amber-200">Quota SerpAPI esgotada</p>
          <p className="text-xs text-muted-foreground">
            Fallback autônomo ativo (Google + Bing + DuckDuckGo)
          </p>
        </div>
      </div>
    );
  }

  if (!isSerpActive) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/35 bg-emerald-500/8 px-4 py-3",
        className
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
        <Zap className="size-4 text-emerald-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 font-semibold text-emerald-200">
          <Wifi className="size-3.5" />
          Modo SerpAPI Ativo
          {envKeyConfigured && (
            <Badge variant="outline" className="text-[10px] font-normal">
              .env.local
            </Badge>
          )}
        </div>
        {!compact && (
          <p className="text-sm text-muted-foreground">
            Google Maps via SerpAPI · busca real em tempo real
          </p>
        )}
      </div>
      <div className="text-right">
        <p className="text-lg font-bold tabular-nums text-emerald-300">
          ~{remaining}
        </p>
        <p className="text-[10px] text-muted-foreground">
          buscas restantes (estimado · {SERPAPI_FREE_MONTHLY_LIMIT}/mês)
        </p>
        {status?.providers.serpapi.isLive && (
          <p className="text-[10px] text-emerald-400/80">{status.providers.serpapi.label}</p>
        )}
      </div>
    </div>
  );
}
