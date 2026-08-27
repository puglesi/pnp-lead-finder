"use client";

import { Infinity, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSettingsStore } from "@/store/settings-store";
import {
  AUTONOMOUS_DELAY_MAX,
  AUTONOMOUS_DELAY_MIN,
  AUTONOMOUS_VOLUME_24H_LABEL,
  AUTONOMOUS_VOLUME_MAX,
  AUTONOMOUS_VOLUME_MIN,
} from "@/lib/search/volume";
import { AutonomousSourcesPicker } from "@/components/dashboard/autonomous-sources-picker";
import {
  AUTONOMOUS_REALISTIC_EXECUTION_MAX,
  AUTONOMOUS_REALISTIC_EXECUTION_MIN,
} from "@/lib/search/volume";
import { AUTONOMOUS_MODE_LABEL } from "@/lib/mode-labels";
import { cn } from "@/lib/utils";

export function AutonomousOptions() {
  const s = useSettingsStore();
  if (s.searchProfile !== "autonomous-24h") return null;

  return (
    <Card className="border-indigo-500/30 bg-indigo-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-indigo-200">
          <Infinity className="size-5" />
          {AUTONOMOUS_MODE_LABEL}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Google Maps + scraping de sites · meta{" "}
          {AUTONOMOUS_REALISTIC_EXECUTION_MIN}–{AUTONOMOUS_REALISTIC_EXECUTION_MAX}{" "}
          leads/execução · delay {AUTONOMOUS_DELAY_MIN}–{AUTONOMOUS_DELAY_MAX}ms
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <AutonomousSourcesPicker />
        <div
          className={cn(
            "flex items-center justify-between rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-4"
          )}
        >
          <div className="flex items-start gap-3 text-left">
            <Save className="mt-0.5 size-4 shrink-0 text-indigo-400" />
            <div>
              <p className="font-medium">Auto-save de leads</p>
              <p className="text-sm text-muted-foreground">
                Todos os leads encontrados são salvos automaticamente em Meus
                Leads ao concluir a fila
              </p>
            </div>
          </div>
          <Badge variant="success">Sempre ativo</Badge>
        </div>
        {s.useMaxLeads && (
          <div className="rounded-xl border border-amber-500/35 bg-amber-500/8 px-4 py-3 text-sm text-amber-950 dark:text-amber-100/90">
            <p className="font-medium">{AUTONOMOUS_VOLUME_24H_LABEL}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Máximo possível: {AUTONOMOUS_VOLUME_MIN}–{AUTONOMOUS_VOLUME_MAX}{" "}
              leads/setor · deixe o PC ligado e estável durante a noite
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
