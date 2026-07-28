"use client";

import { useState } from "react";
import { Cpu, Server, Timer } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import {
  AUTONOMOUS_24H_DEFAULTS,
  useSettingsStore,
} from "@/store/settings-store";
import {
  AUTONOMOUS_DELAY_MAX,
  AUTONOMOUS_DELAY_MIN,
  AUTONOMOUS_STANDARD_MAX,
  AUTONOMOUS_MIN_LEADS,
  AUTONOMOUS_WORKERS_MAX,
  AUTONOMOUS_WORKERS_MIN,
  RECOMMENDED_LEADS_MAX,
  RECOMMENDED_LEADS_MIN,
  SERPAPI_MAX_LEADS,
} from "@/lib/search/volume";
import { AutonomousSourcesPicker } from "./autonomous-sources-picker";
import { cn } from "@/lib/utils";

type ConfigKey = "workers" | "delay" | "leads";

const CONFIG_ITEMS: {
  key: ConfigKey;
  label: string;
  icon: typeof Cpu;
  unit: string;
}[] = [
  { key: "workers", label: "Workers", icon: Cpu, unit: "" },
  { key: "delay", label: "Delay", icon: Timer, unit: "ms" },
  { key: "leads", label: "Leads/setor", icon: Server, unit: "" },
];

export function QuickConfigBar({ hydrated = true }: { hydrated?: boolean }) {
  const settings = useSettingsStore();
  const [open, setOpen] = useState<ConfigKey | null>(null);
  const searchProfile = hydrated
    ? settings.searchProfile
    : AUTONOMOUS_24H_DEFAULTS.searchProfile;
  const useMaxLeads = hydrated
    ? settings.useMaxLeads
    : AUTONOMOUS_24H_DEFAULTS.useMaxLeads;
  const isAutonomous = searchProfile === "autonomous-24h";
  const delayBounds = hydrated
    ? settings.getDelayBounds()
    : { min: AUTONOMOUS_DELAY_MIN, max: AUTONOMOUS_DELAY_MAX };
  const workerMin = isAutonomous ? AUTONOMOUS_WORKERS_MIN : 1;
  const workerMax = isAutonomous ? AUTONOMOUS_WORKERS_MAX : 10;
  const leadsMin = isAutonomous ? AUTONOMOUS_MIN_LEADS : RECOMMENDED_LEADS_MIN;
  const leadsMax = isAutonomous
    ? AUTONOMOUS_STANDARD_MAX
    : useMaxLeads
      ? SERPAPI_MAX_LEADS
      : RECOMMENDED_LEADS_MAX;
  const leadsDisabled = useMaxLeads && !isAutonomous;

  const values: Record<ConfigKey, number> = {
    workers: hydrated ? settings.workers : AUTONOMOUS_24H_DEFAULTS.workers,
    delay: hydrated ? settings.delayMs : AUTONOMOUS_24H_DEFAULTS.delayMs,
    leads: hydrated ? settings.maxResults : AUTONOMOUS_24H_DEFAULTS.maxResults,
  };

  const toggle = (key: ConfigKey) =>
    setOpen((current) => (current === key ? null : key));

  const handleChange = (key: ConfigKey, value: number) => {
    if (key === "workers") settings.setWorkers(value);
    if (key === "delay") settings.setDelayMs(value);
    if (key === "leads") settings.setMaxResults(value);
  };

  const openItem = CONFIG_ITEMS.find((item) => item.key === open);
  const OpenIcon = openItem?.icon;

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Configuração rápida
      </p>
      <div className="flex flex-wrap gap-2">
        {CONFIG_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = open === item.key;
          const displayValue =
            item.key === "leads" && useMaxLeads && !isAutonomous
              ? `Máx. (${settings.getEffectiveMaxResults()})`
              : `${values[item.key]}${item.unit}`;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => toggle(item.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all",
                isActive
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/60 bg-background/40 hover:border-primary/30 hover:bg-accent/30"
              )}
            >
              <Icon className="size-4 shrink-0 opacity-70" />
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-semibold tabular-nums text-foreground">
                {displayValue}
              </span>
            </button>
          );
        })}
      </div>

      {openItem && OpenIcon && (
        <div className="rounded-lg border border-border/60 bg-background/40 px-4 py-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              <OpenIcon className="size-4 text-primary" />
              {openItem.label}
            </span>
            <span className="text-sm font-semibold tabular-nums text-primary">
              {openItem.key === "leads" && leadsDisabled
                ? `Máx. (${settings.getEffectiveMaxResults()})`
                : `${values[openItem.key]}${openItem.unit}`}
            </span>
          </div>
          {openItem.key === "workers" && (
            <Slider
              value={values.workers}
              onChange={(v) => handleChange("workers", v)}
              min={workerMin}
              max={workerMax}
            />
          )}
          {openItem.key === "delay" && (
            <Slider
              value={values.delay}
              onChange={(v) => handleChange("delay", v)}
              min={delayBounds.min}
              max={delayBounds.max}
              step={100}
            />
          )}
          {openItem.key === "leads" && (
            <>
              <Slider
                value={values.leads}
                onChange={(v) => handleChange("leads", v)}
                min={leadsMin}
                max={leadsMax}
                step={isAutonomous ? 25 : 10}
                disabled={leadsDisabled}
              />
              {leadsDisabled && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Desative &quot;Máximo possível&quot; nas Avançadas para
                  ajustar manualmente
                </p>
              )}
            </>
          )}
        </div>
      )}

      {isAutonomous && <AutonomousSourcesPicker compact hydrated={hydrated} />}
    </div>
  );
}