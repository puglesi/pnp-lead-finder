"use client";

import { useState } from "react";
import {
  Clock,
  Cpu,
  HardDrive,
  Moon,
  Power,
  Sun,
  Timer,
} from "lucide-react";
import toast from "react-hot-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useSettingsStore } from "@/store/settings-store";
import {
  formatNightSchedule,
  getLocalProductionPhase,
  LOCAL_PRODUCTION_DAY_PROFILE,
  LOCAL_PRODUCTION_NIGHT_PROFILE,
} from "@/lib/local-production";
import { cn } from "@/lib/utils";

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

export function LocalProductionPanel({ compact }: { compact?: boolean }) {
  const localProductionEnabled = useSettingsStore(
    (s) => s.localProductionEnabled
  );
  const nightModeAuto = useSettingsStore((s) => s.nightModeAuto);
  const nightModeActive = useSettingsStore((s) => s.nightModeActive);
  const nightScheduleStart = useSettingsStore((s) => s.nightScheduleStart);
  const nightScheduleEnd = useSettingsStore((s) => s.nightScheduleEnd);
  const autoSaveLeads = useSettingsStore((s) => s.autoSaveLeads);
  const delayMs = useSettingsStore((s) => s.delayMs);
  const workers = useSettingsStore((s) => s.workers);
  const autonomousEnrichWebsites = useSettingsStore(
    (s) => s.autonomousEnrichWebsites
  );

  const applyLocalProductionProfile = useSettingsStore(
    (s) => s.applyLocalProductionProfile
  );
  const disableLocalProduction = useSettingsStore((s) => s.disableLocalProduction);
  const setNightModeAuto = useSettingsStore((s) => s.setNightModeAuto);
  const setNightModeActive = useSettingsStore((s) => s.setNightModeActive);
  const setNightSchedule = useSettingsStore((s) => s.setNightSchedule);
  const applyLocalProductionPhase = useSettingsStore(
    (s) => s.applyLocalProductionPhase
  );

  const [scheduleStart, setScheduleStart] = useState(nightScheduleStart);
  const [scheduleEnd, setScheduleEnd] = useState(nightScheduleEnd);

  const activate = () => {
    applyLocalProductionProfile();
    toast.success("Modo Local 24h ativado — auto-save e perfil otimizado", {
      icon: "🖥️",
      duration: 4000,
    });
  };

  const deactivate = () => {
    disableLocalProduction();
    toast("Modo Local 24h desativado", { icon: "⏸️" });
  };

  const saveSchedule = () => {
    setNightSchedule(scheduleStart, scheduleEnd);
    if (localProductionEnabled && nightModeAuto) {
      applyLocalProductionPhase(
        getLocalProductionPhase(new Date(), {
          startHour: scheduleStart,
          endHour: scheduleEnd,
        })
      );
    }
    toast.success("Horário noturno atualizado");
  };

  const phaseLabel = nightModeActive ? "Noturno" : "Diurno";
  const PhaseIcon = nightModeActive ? Moon : Sun;

  return (
    <Card
      className={cn(
        "border-border/60",
        localProductionEnabled &&
          "border-violet-500/30 bg-gradient-to-br from-violet-500/8 via-card to-indigo-500/5"
      )}
    >
      <CardHeader className={compact ? "pb-3" : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <HardDrive className="size-5 text-violet-400" />
            Modo Local 24h
            {localProductionEnabled && (
              <Badge
                variant="outline"
                className="border-violet-400/40 bg-violet-500/10 text-violet-800 dark:text-violet-200"
              >
                Ativo
              </Badge>
            )}
          </CardTitle>
          {localProductionEnabled && (
            <Badge
              className={cn(
                "gap-1",
                nightModeActive
                  ? "bg-indigo-500/20 text-indigo-800 dark:text-indigo-200"
                  : "bg-amber-500/15 text-amber-900 dark:text-amber-200"
              )}
            >
              <PhaseIcon className="size-3" />
              {phaseLabel}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Otimizado para PC ligado 24h — melhor performance de dia, menos CPU à
          noite, leads salvos automaticamente.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {!localProductionEnabled ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={activate} className="gap-2">
              <Power className="size-4" />
              Ativar Modo 24h Local
            </Button>
            <p className="text-xs text-muted-foreground">
              Atalho no PC: execute{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                Iniciar-Modo-24h.bat
              </code>{" "}
              na pasta <code className="text-[11px]">web</code>
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                icon={HardDrive}
                label="Auto-save"
                value={autoSaveLeads ? "Ligado" : "Desligado"}
              />
              <Stat icon={Timer} label="Delay" value={`${delayMs} ms`} />
              <Stat icon={Cpu} label="Workers" value={String(workers)} />
              <Stat
                icon={Moon}
                label="Enriquecimento"
                value={autonomousEnrichWebsites ? "Ativo" : "Pausado"}
              />
            </div>

            <div className="rounded-xl border border-border/50 bg-background/40 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Modo noturno automático</p>
                  <p className="text-xs text-muted-foreground">
                    Reduz CPU entre{" "}
                    {formatNightSchedule({
                      startHour: nightScheduleStart,
                      endHour: nightScheduleEnd,
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={nightModeAuto}
                  onClick={() => setNightModeAuto(!nightModeAuto)}
                  className={cn(
                    "relative h-6 w-11 rounded-full transition-colors",
                    nightModeAuto ? "bg-violet-500" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
                      nightModeAuto ? "translate-x-5" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>

              {nightModeAuto ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Início (noturno)</Label>
                    <select
                      value={scheduleStart}
                      onChange={(e) =>
                        setScheduleStart(Number(e.target.value))
                      }
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      {HOUR_OPTIONS.map((h) => (
                        <option key={h} value={h}>
                          {h.toString().padStart(2, "0")}:00
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Fim (diurno)</Label>
                    <select
                      value={scheduleEnd}
                      onChange={(e) => setScheduleEnd(Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      {HOUR_OPTIONS.map((h) => (
                        <option key={h} value={h}>
                          {h.toString().padStart(2, "0")}:00
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={saveSchedule}
                    className="sm:col-span-2 gap-2"
                  >
                    <Clock className="size-3.5" />
                    Salvar horário
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={!nightModeActive ? "default" : "outline"}
                    onClick={() => setNightModeActive(false)}
                    className="gap-1.5"
                  >
                    <Sun className="size-3.5" />
                    Diurno
                  </Button>
                  <Button
                    size="sm"
                    variant={nightModeActive ? "default" : "outline"}
                    onClick={() => setNightModeActive(true)}
                    className="gap-1.5"
                  >
                    <Moon className="size-3.5" />
                    Noturno
                  </Button>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground">
                Diurno: {LOCAL_PRODUCTION_DAY_PROFILE.workers} workers · delay{" "}
                {LOCAL_PRODUCTION_DAY_PROFILE.delayMs}ms · poll 20s. Noturno: 1
                worker · delay {LOCAL_PRODUCTION_NIGHT_PROFILE.delayMs}ms · sem
                enriquecimento · poll 90s.
              </p>
            </div>

            <Button variant="outline" size="sm" onClick={deactivate}>
              Desativar Modo Local
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/30 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}
