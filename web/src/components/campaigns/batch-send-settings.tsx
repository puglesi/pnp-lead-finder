"use client";

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Cloud,
  Crown,
  Layers,
  Mail,
  ShieldAlert,
  Timer,
  Save,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AUTONOMOUS_BATCH_SIZE_MAX,
  AUTONOMOUS_BATCH_SIZE_MIN,
  AUTONOMOUS_DAILY_LIMIT_MAX,
  AUTONOMOUS_DAILY_LIMIT_MIN,
  BATCH_SIZE_MAX,
  BATCH_SIZE_MIN,
  DEFAULT_AUTONOMOUS_BATCH_CONFIG,
  DEFAULT_BATCH_SEND_CONFIG,
  type CampaignBatchSendConfig,
} from "@/types/campaign";
import { listEmailProviders } from "@/lib/email-providers";
import {
  defaultProviderForMode,
  getProviderSendMode,
} from "@/lib/email-provider-utils";
import {
  selectEmailProviderCredentials,
  useSettingsStore,
} from "@/store/settings-store";
import type { EmailProviderId, EmailSendMode } from "@/types/email-provider";
import { cn } from "@/lib/utils";

interface BatchSendSettingsProps {
  config: CampaignBatchSendConfig;
  provider: EmailProviderId;
  leadCount: number;
  onChange: (patch: Partial<CampaignBatchSendConfig>) => void;
  onProviderChange?: (id: EmailProviderId) => void;
  disabled?: boolean;
  className?: string;
}

function formatDelay(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  return `${(ms / 60_000).toFixed(1)}min`;
}

function resolveSendMode(provider: EmailProviderId): EmailSendMode {
  const mode = getProviderSendMode(provider);
  return mode === "autonomous-free" ? "autonomous-free" : "paid";
}

export function BatchSendSettings({
  config,
  provider,
  leadCount,
  onChange,
  onProviderChange,
  disabled = false,
  className,
}: BatchSendSettingsProps) {
  const credentials = useSettingsStore(
    useShallow(selectEmailProviderCredentials)
  );
  const dailySent = useSettingsStore((s) => s.autonomousDailySentCount);
  const dailyRemaining = useSettingsStore((s) =>
    s.getAutonomousDailyRemaining(config.dailyLimit)
  );

  const sendMode = resolveSendMode(provider);

  const isAutonomous = sendMode === "autonomous-free";
  const providers = useMemo(
    () => listEmailProviders(credentials, sendMode),
    [credentials, sendMode]
  );

  const batchMin = isAutonomous ? AUTONOMOUS_BATCH_SIZE_MIN : BATCH_SIZE_MIN;
  const batchMax = isAutonomous ? AUTONOMOUS_BATCH_SIZE_MAX : BATCH_SIZE_MAX;

  const batches = Math.ceil(leadCount / config.batchSize);
  const estMinutes = Math.round(
    (batches * config.delayBetweenBatchesMs +
      leadCount * config.delayBetweenEmailsMs) /
      60_000
  );

  const handleModeChange = (mode: EmailSendMode) => {
    onChange(
      mode === "autonomous-free"
        ? { ...DEFAULT_AUTONOMOUS_BATCH_CONFIG }
        : { ...DEFAULT_BATCH_SEND_CONFIG }
    );
    onProviderChange?.(defaultProviderForMode(mode));
  };

  return (
    <Card className={cn("border-border/60", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="size-4 text-violet-400" />
          Canal de Envio
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Escolha entre serviços pagos (alta entrega) ou modo autônomo free com seu
          email
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {onProviderChange && (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => handleModeChange("paid")}
              className={cn(
                "rounded-xl border p-4 text-left transition-all",
                sendMode === "paid"
                  ? "border-amber-500/50 bg-amber-500/10 shadow-sm"
                  : "border-border/60 hover:border-amber-500/30"
              )}
            >
              <div className="flex items-center gap-2 font-medium">
                <Crown className="size-4 text-amber-400" />
                Serviços Pagos
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Mailgun, Resend, Amazon SES, Brevo, SendGrid — alta entrega e
                escala
              </p>
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => handleModeChange("autonomous-free")}
              className={cn(
                "rounded-xl border p-4 text-left transition-all",
                sendMode === "autonomous-free"
                  ? "border-emerald-500/50 bg-emerald-500/10 shadow-sm"
                  : "border-border/60 hover:border-emerald-500/30"
              )}
            >
              <div className="flex items-center gap-2 font-medium">
                <Mail className="size-4 text-emerald-400" />
                Modo Autônomo Free
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Gmail / Outlook SMTP — sem custo, volume pequeno-médio
              </p>
            </button>
          </div>
        )}

        {onProviderChange && (
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              {isAutonomous ? (
                <Zap className="size-3.5 text-emerald-400" />
              ) : (
                <Cloud className="size-3.5 text-amber-400" />
              )}
              {isAutonomous ? "Conta SMTP" : "Provedor de API"}
            </Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onProviderChange(p.id)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left text-sm transition-all",
                    provider === p.id
                      ? isAutonomous
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : "border-primary/50 bg-primary/10"
                      : "border-border/60 hover:border-primary/30",
                    !p.configured &&
                      p.id !== "simulate" &&
                      "opacity-60"
                  )}
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {p.configured
                      ? "Pronto"
                      : isAutonomous
                        ? "Configurar SMTP abaixo"
                        : "Configurar credenciais abaixo"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {isAutonomous && config.dailyLimit > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <p>
              Limite diário: <strong>{config.dailyLimit}</strong> emails · Enviados
              hoje: <strong>{dailySent}</strong> · Restantes:{" "}
              <strong>{Number.isFinite(dailyRemaining) ? dailyRemaining : "∞"}</strong>
            </p>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <Label className="flex items-center gap-1.5">
              <Layers className="size-3.5" />
              Tamanho do lote
            </Label>
            <span className="font-mono font-medium tabular-nums">
              {config.batchSize} emails/lote
            </span>
          </div>
          <Slider
            value={config.batchSize}
            onChange={(v) => onChange({ batchSize: v })}
            min={batchMin}
            max={batchMax}
            step={isAutonomous ? 1 : 5}
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            {leadCount} leads → {batches} lote(s) · estimativa ~{estMinutes}min
            {isAutonomous && " · use lotes pequenos para evitar bloqueio"}
          </p>
        </div>

        {isAutonomous && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <Label className="flex items-center gap-1.5">
                <ShieldAlert className="size-3.5" />
                Limite diário
              </Label>
              <span className="font-mono font-medium tabular-nums">
                {config.dailyLimit} emails/dia
              </span>
            </div>
            <Slider
              value={config.dailyLimit}
              onChange={(v) => onChange({ dailyLimit: v })}
              min={AUTONOMOUS_DAILY_LIMIT_MIN}
              max={AUTONOMOUS_DAILY_LIMIT_MAX}
              step={10}
              disabled={disabled}
            />
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <Label className="flex items-center gap-1.5">
              <Timer className="size-3.5" />
              Delay entre lotes
            </Label>
            <span className="font-mono text-sm tabular-nums">
              {formatDelay(config.delayBetweenBatchesMs)}
            </span>
          </div>
          <Slider
            value={config.delayBetweenBatchesMs}
            onChange={(v) => onChange({ delayBetweenBatchesMs: v })}
            min={isAutonomous ? 60_000 : 5_000}
            max={isAutonomous ? 600_000 : 120_000}
            step={isAutonomous ? 30_000 : 5_000}
            disabled={disabled}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <Label>Delay entre emails</Label>
            <span className="font-mono text-sm tabular-nums">
              {formatDelay(config.delayBetweenEmailsMs)}
            </span>
          </div>
          <Slider
            value={config.delayBetweenEmailsMs}
            onChange={(v) => onChange({ delayBetweenEmailsMs: v })}
            min={isAutonomous ? 2_000 : 100}
            max={isAutonomous ? 15_000 : 3_000}
            step={isAutonomous ? 500 : 100}
            disabled={disabled}
          />
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/40 px-4 py-3">
          <Checkbox
            id="auto-save-sent"
            checked={config.autoSaveSentLeads}
            disabled={disabled}
            onCheckedChange={(v) =>
              onChange({ autoSaveSentLeads: v === true })
            }
          />
          <div>
            <Label
              htmlFor="auto-save-sent"
              className="flex cursor-pointer items-center gap-1.5 font-medium"
            >
              <Save className="size-3.5" />
              Auto-save leads enviados
            </Label>
            <p className="text-xs text-muted-foreground">
              Salva automaticamente em Meus Leads após envio bem-sucedido
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}