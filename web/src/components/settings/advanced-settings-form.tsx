"use client";

import {
  AlertTriangle,
  Cpu,
  Gauge,
  Infinity,
  Moon,
  Scale,
  Server,
  Timer,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useSettingsStore,
  SERPAPI_PROFILE_DEFAULTS,
  AUTONOMOUS_24H_DEFAULTS,
} from "@/store/settings-store";
import {
  AUTONOMOUS_MIN_LEADS,
  AUTONOMOUS_STANDARD_MAX,
  AUTONOMOUS_VOLUME_24H_LABEL,
  AUTONOMOUS_VOLUME_MAX,
  AUTONOMOUS_VOLUME_MIN,
  AUTONOMOUS_WORKERS_MAX,
  AUTONOMOUS_WORKERS_MIN,
  DEFAULT_LEADS_PER_SECTOR,
  MAX_POSSIBLE_AUTONOMOUS_LABEL,
  MAX_POSSIBLE_SERPAPI_LABEL,
  RECOMMENDED_LEADS_DEFAULT,
  RECOMMENDED_LEADS_MAX,
  RECOMMENDED_LEADS_MIN,
  SERPAPI_EQUILIBRIUM_MODE_LABEL,
  SERPAPI_MAX_LEADS,
  SERPAPI_PAGES_EQUILIBRIUM_MAX,
  SERPAPI_PAGES_EQUILIBRIUM_MIN,
  SERPAPI_PAGES_VOLUME_MAX,
  SERPAPI_PAGES_VOLUME_MIN,
  SERPAPI_VOLUME_DEFAULT,
  SERPAPI_VOLUME_MODE_LABEL,
  formatVolumeExecutionEstimate,
} from "@/lib/search/volume";
import { AutonomousSourcesPicker } from "@/components/dashboard/autonomous-sources-picker";
import { AUTONOMOUS_MODE_LABEL, SERPAPI_PREMIUM_LABEL } from "@/lib/mode-labels";
import { cn } from "@/lib/utils";

function SettingSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  hint,
  icon: Icon,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit: string;
  hint: string;
  icon: typeof Cpu;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Icon className="size-4 text-primary" />
          {label}
        </Label>
        <Badge variant="secondary" className="tabular-nums">
          {value}
          {unit}
        </Badge>
      </div>
      <Slider
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function AdvancedSettingsForm() {
  const s = useSettingsStore();
  const effectiveWorkers = s.getEffectiveWorkers();
  const isAutonomous = s.searchProfile === "autonomous-24h";
  const delayBounds = s.getDelayBounds();
  const workerMin = isAutonomous ? AUTONOMOUS_WORKERS_MIN : 1;
  const workerMax = isAutonomous ? AUTONOMOUS_WORKERS_MAX : 10;
  const leadsMin = isAutonomous ? AUTONOMOUS_MIN_LEADS : RECOMMENDED_LEADS_MIN;
  const leadsMax = isAutonomous
    ? AUTONOMOUS_STANDARD_MAX
    : s.useMaxLeads
      ? SERPAPI_MAX_LEADS
      : RECOMMENDED_LEADS_MAX;

  const handleSave = () => {
    toast.success("Configurações avançadas salvas!", { icon: "⚡" });
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-gradient-to-br from-card to-blue-500/5">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Cpu className="size-5 text-blue-400" />
              Hardware & Performance
            </CardTitle>
            <Badge variant={isAutonomous ? "outline" : "success"} className="gap-1">
              {isAutonomous ? (
                <>
                  <Moon className="size-3" />
                  {AUTONOMOUS_MODE_LABEL}
                </>
              ) : (
                <>
                  <Zap className="size-3" />
                  {SERPAPI_PREMIUM_LABEL}
                </>
              )}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {isAutonomous
              ? `Perfil 24h: ${AUTONOMOUS_24H_DEFAULTS.workers} workers · delay ${AUTONOMOUS_24H_DEFAULTS.delayMs}ms`
              : `Perfil SerpAPI: ${SERPAPI_PROFILE_DEFAULTS.workers} workers · delay ${SERPAPI_PROFILE_DEFAULTS.delayMs}ms`}
          </p>
        </CardHeader>
        <CardContent className="space-y-8">
          <SettingSlider
            label="Workers Paralelos"
            icon={Gauge}
            value={s.workers}
            onChange={s.setWorkers}
            min={workerMin}
            max={workerMax}
            unit=""
            hint={
              isAutonomous
                ? `${AUTONOMOUS_WORKERS_MIN}–${AUTONOMOUS_WORKERS_MAX} workers · efetivo: ${effectiveWorkers} (fila sequencial = 1)`
                : `1 – 10 setores simultâneos · efetivo: ${effectiveWorkers}`
            }
          />

          <SettingSlider
            label="Delay entre Requisições"
            icon={Timer}
            value={s.delayMs}
            onChange={s.setDelayMs}
            min={delayBounds.min}
            max={delayBounds.max}
            step={100}
            unit="ms"
            hint={
              isAutonomous
                ? "3500–5000ms — estável para operação noturna prolongada"
                : "500ms (agressivo) – 3000ms (conservador)"
            }
          />

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => s.setUseMaxLeads(!s.useMaxLeads)}
              className={cn(
                "flex w-full items-center justify-between rounded-xl border p-4 transition-all",
                s.useMaxLeads
                  ? isAutonomous
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-orange-500/40 bg-orange-500/10"
                  : "border-border/60 hover:border-primary/30"
              )}
            >
              <div className="text-left">
                <p className="font-medium">
                  {s.useMaxLeads
                    ? isAutonomous
                      ? MAX_POSSIBLE_AUTONOMOUS_LABEL
                      : MAX_POSSIBLE_SERPAPI_LABEL
                    : "Máximo possível"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {s.useMaxLeads
                    ? isAutonomous
                      ? `${s.getEffectiveMaxResults()} leads/setor · primeiros resultados priorizados`
                      : `${SERPAPI_VOLUME_DEFAULT} leads/setor · ${SERPAPI_PAGES_VOLUME_MIN}–${SERPAPI_PAGES_VOLUME_MAX} páginas SerpAPI · ${formatVolumeExecutionEstimate().toLowerCase()}`
                    : isAutonomous
                      ? `Ative para ${AUTONOMOUS_VOLUME_MIN}–${AUTONOMOUS_VOLUME_MAX} leads/setor · auto-save · fila sequencial`
                      : `${RECOMMENDED_LEADS_MIN}–${RECOMMENDED_LEADS_MAX} leads/setor · ${SERPAPI_PAGES_EQUILIBRIUM_MIN}–${SERPAPI_PAGES_EQUILIBRIUM_MAX} páginas · melhor ROI`}
                </p>
                {s.useMaxLeads && isAutonomous && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-amber-300/90">
                    <AlertTriangle className="size-3" />
                    {AUTONOMOUS_VOLUME_24H_LABEL}
                  </p>
                )}
                {!s.useMaxLeads && !isAutonomous && (
                  <p className="mt-1 text-xs text-emerald-300/90">
                    {SERPAPI_EQUILIBRIUM_MODE_LABEL}
                  </p>
                )}
                {s.useMaxLeads && !isAutonomous && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-orange-300/90">
                    <AlertTriangle className="size-3" />
                    {SERPAPI_VOLUME_MODE_LABEL}
                  </p>
                )}
              </div>
              <div
                className={cn(
                  "relative h-7 w-12 rounded-full transition-colors",
                  s.useMaxLeads ? "bg-emerald-500" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform",
                    s.useMaxLeads ? "translate-x-5" : "translate-x-0.5"
                  )}
                />
              </div>
            </button>

            <SettingSlider
              label="Leads por Setor"
              icon={Server}
              value={s.maxResults}
              onChange={s.setMaxResults}
              min={leadsMin}
              max={leadsMax}
              step={isAutonomous ? 25 : 10}
              unit=""
              disabled={s.useMaxLeads}
              hint={
                s.useMaxLeads
                  ? "Desative 'Máximo possível' para voltar ao Modo Equilíbrio"
                  : isAutonomous
                    ? `${AUTONOMOUS_MIN_LEADS}–${AUTONOMOUS_STANDARD_MAX} leads · auto-save sempre ativo`
                    : `Padrão ${RECOMMENDED_LEADS_DEFAULT} · faixa ${RECOMMENDED_LEADS_MIN}–${RECOMMENDED_LEADS_MAX} · ${SERPAPI_PAGES_EQUILIBRIUM_MIN}–${SERPAPI_PAGES_EQUILIBRIUM_MAX} páginas/setor`
              }
            />
          </div>

          {isAutonomous && (
            <>
              <AutonomousSourcesPicker />
              <button
                type="button"
                onClick={() =>
                  s.setAutonomousEnrichWebsites(!s.autonomousEnrichWebsites)
                }
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border p-4 transition-all",
                  s.autonomousEnrichWebsites
                    ? "border-indigo-400/40 bg-indigo-500/10"
                    : "border-border/60 hover:border-primary/30"
                )}
              >
                <div className="text-left">
                  <p className="font-medium">Enriquecer sites</p>
                  <p className="text-sm text-muted-foreground">
                    Abre o website de cada empresa e tenta extrair email e
                    telefone
                  </p>
                </div>
                <div
                  className={cn(
                    "relative h-7 w-12 rounded-full transition-colors",
                    s.autonomousEnrichWebsites ? "bg-indigo-500" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform",
                      s.autonomousEnrichWebsites
                        ? "translate-x-5"
                        : "translate-x-0.5"
                    )}
                  />
                </div>
              </button>
              <div className="flex items-start gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
                <Moon className="mt-0.5 size-4 shrink-0 text-indigo-400" />
                <div className="text-left text-sm">
                  <p className="font-medium text-indigo-200">
                    Estabilidade noturna
                  </p>
                  <p className="text-muted-foreground">
                    Google Maps principal · fila sequencial · delay alto ·
                    auto-save · meta 500–1000 leads por execução realista
                  </p>
                </div>
              </div>
            </>
          )}

          {!isAutonomous && !s.useMaxLeads && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <Scale className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              <div className="text-left">
                <p className="font-medium text-emerald-200">
                  Paginação inteligente (Equilíbrio)
                </p>
                <p className="text-sm text-muted-foreground">
                  {SERPAPI_PAGES_EQUILIBRIUM_MIN}–{SERPAPI_PAGES_EQUILIBRIUM_MAX}{" "}
                  páginas SerpAPI/setor — otimizado para melhor leads por busca
                </p>
                <p className="mt-1 text-xs text-emerald-300/80">
                  Ative &quot;Máximo possível&quot; acima para Modo Volume
                  Máximo — até 10 páginas/setor
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Infinity className="size-4 text-emerald-400" />
              Modo de Fila
            </Label>
            <Select
              value={s.queueMode}
              onValueChange={(v) =>
                s.setQueueMode(v as "parallel" | "sequential")
              }
            >
              <SelectTrigger className="bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="parallel">
                  Paralelo — workers processam fila simultaneamente
                </SelectItem>
                <SelectItem value="sequential">
                  Sequencial — um setor por vez (Estate Agents → Solicitors → …)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          onClick={() => {
            s.applySerpApiProfile();
            toast.success("Perfil SerpAPI aplicado!", { icon: "⚡" });
          }}
        >
          <Zap className="size-4" />
          Perfil SerpAPI
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            s.applyAutonomous24hProfile();
            toast.success(`${AUTONOMOUS_MODE_LABEL} aplicado!`, { icon: "🌙" });
          }}
        >
          <Moon className="size-4" />
          Perfil 24h
        </Button>
        <Button onClick={handleSave}>Salvar Configurações</Button>
      </div>
    </div>
  );
}