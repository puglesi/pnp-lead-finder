"use client";

import { Clock, Infinity, Moon, Zap } from "lucide-react";
import toast from "react-hot-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useSettingsStore,
  SERPAPI_PROFILE_DEFAULTS,
  AUTONOMOUS_24H_DEFAULTS,
} from "@/store/settings-store";
import {
  AUTONOMOUS_STANDARD_MAX,
  AUTONOMOUS_VOLUME_MAX,
  AUTONOMOUS_VOLUME_MIN,
  SERPAPI_EQUILIBRIUM_DEFAULT,
  SERPAPI_EQUILIBRIUM_MODE_LABEL,
  SERPAPI_MAX_LEADS,
  SERPAPI_PAGES_EQUILIBRIUM_MAX,
  SERPAPI_PAGES_EQUILIBRIUM_MIN,
  SERPAPI_FREE_MONTHLY_LIMIT,
} from "@/lib/search/volume";
import {
  AUTONOMOUS_MODE_LABEL,
  SERPAPI_PREMIUM_LABEL,
} from "@/lib/mode-labels";
import type { SearchProfile } from "@/types/search";
import { cn } from "@/lib/utils";

function buildProfiles() {
  return [
    {
      id: "autonomous-24h" as SearchProfile,
      title: AUTONOMOUS_MODE_LABEL,
      subtitle: "Modo principal · ilimitado",
      icon: Moon,
      features: [
        AUTONOMOUS_24H_DEFAULTS.workers +
          " workers · " +
          AUTONOMOUS_24H_DEFAULTS.delayMs +
          "ms · sequencial",
        "Rotação Google → Bing → DuckDuckGo",
        "Ilimitado · PC ligado o dia todo",
        "Até " +
          AUTONOMOUS_STANDARD_MAX +
          " leads/setor · Volume Alto 24h: " +
          AUTONOMOUS_VOLUME_MIN +
          "–" +
          AUTONOMOUS_VOLUME_MAX,
      ],
      accent: "border-indigo-500/40 bg-indigo-500/5 hover:border-indigo-500/60",
      badge: "Padrão",
    },
    {
      id: "serpapi" as SearchProfile,
      title: SERPAPI_PREMIUM_LABEL,
      subtitle: "Alta qualidade · uso ocasional",
      icon: Zap,
      features: [
        SERPAPI_PROFILE_DEFAULTS.workers +
          " workers · " +
          SERPAPI_PROFILE_DEFAULTS.delayMs +
          "ms",
        "Google Maps via SerpAPI",
        SERPAPI_FREE_MONTHLY_LIMIT + " buscas/mês",
        `Equilíbrio ${SERPAPI_EQUILIBRIUM_DEFAULT}/setor · ${SERPAPI_PAGES_EQUILIBRIUM_MIN}–${SERPAPI_PAGES_EQUILIBRIUM_MAX} páginas`,
        `Volume Máximo opcional: ${SERPAPI_MAX_LEADS}/setor · 8–10 páginas`,
      ],
      accent: "border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60",
      badge: "Premium",
    },
  ];
}

export function SearchProfileSelector() {
  const profile = useSettingsStore((s) => s.searchProfile);
  const setSearchProfile = useSettingsStore((s) => s.setSearchProfile);
  const PROFILES = buildProfiles();

  const select = (id: SearchProfile) => {
    setSearchProfile(id);
    toast.success(
      id === "serpapi"
        ? `${SERPAPI_PREMIUM_LABEL} ativado`
        : `${AUTONOMOUS_MODE_LABEL} ativado`,
      { icon: id === "serpapi" ? "⚡" : "🌙", duration: 4000 }
    );
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {PROFILES.map((p) => {
        const Icon = p.icon;
        const active = profile === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => select(p.id)}
            className={cn(
              "rounded-xl border-2 p-0 text-left transition-all",
              active ? "border-primary ring-2 ring-primary/20" : "border-border/60",
              p.accent
            )}
          >
            <Card className="border-0 bg-transparent shadow-none">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex size-10 items-center justify-center rounded-lg",
                        active ? "bg-primary/20" : "bg-muted/50"
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-5",
                          p.id === "serpapi" ? "text-emerald-400" : "text-indigo-400"
                        )}
                      />
                    </div>
                    <div>
                      <p className="font-semibold">{p.title}</p>
                      <p className="text-xs text-muted-foreground">{p.subtitle}</p>
                    </div>
                  </div>
                  <Badge variant={active ? "success" : "secondary"}>
                    {active ? "Ativo" : p.badge}
                  </Badge>
                </div>
                <ul className="space-y-1">
                  {p.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <span className="size-1 shrink-0 rounded-full bg-current opacity-50" />
                      {f}
                    </li>
                  ))}
                </ul>
                {p.id === "autonomous-24h" && (
                  <p className="flex items-center gap-1.5 text-[10px] text-indigo-300/80">
                    <Infinity className="size-3" />
                    Pesquisa aprofundada · auto-save ao concluir
                  </p>
                )}
                {p.id === "serpapi" && (
                  <p className="flex items-center gap-1.5 text-[10px] text-emerald-300/80">
                    <Clock className="size-3" />
                    {SERPAPI_EQUILIBRIUM_MODE_LABEL}
                  </p>
                )}
              </CardContent>
            </Card>
          </button>
        );
      })}
    </div>
  );
}