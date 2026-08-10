"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  Pause,
  Play,
  Rocket,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Square,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import { CardTitle } from "@/components/ui/card";
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardHeader,
} from "@/components/ui/collapsible-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDuration } from "@/lib/time-estimate";
import { useOneClickOutreach } from "@/hooks/use-one-click-outreach";
import {
  clampOneClickInterval,
  clampOneClickQuantity,
  type OneClickConfig,
} from "@/lib/one-click-outreach";
import {
  CAMPAIGN_PROFILES,
  type CampaignProfileId,
} from "@/types/campaign-profile";
import {
  getDefaultEmailTemplate,
  getEmailTemplatesForOperation,
} from "@/lib/email-template-library";
import { useEmailTemplateStore } from "@/store/email-template-store";
import { cn } from "@/lib/utils";
import { GlobalDeduplicationPreviewPanel } from "@/components/campaigns/global-deduplication-preview";

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          accent
        )}
      >
        {value}
      </p>
    </div>
  );
}

function OneClickFlowPanel() {
  const templates = useEmailTemplateStore((state) => state.templates);
  const {
    progress,
    report,
    checkpoint,
    deduplicationPreview,
    start,
    pause,
    stop,
    resume,
    clearCheckpoint,
    confirmDeduplicationPreview,
  } = useOneClickOutreach();

  const [operation, setOperation] =
    useState<CampaignProfileId>("panek-puglesi");
  const [sector, setSector] = useState("Property Finance Broker");
  const [location, setLocation] = useState("London");
  const [quantity, setQuantity] = useState(50);
  const [templateId, setTemplateId] = useState(
    () =>
      getDefaultEmailTemplate(
        useEmailTemplateStore.getState().templates,
        "panek-puglesi"
      )?.id ?? ""
  );
  const [minInterval, setMinInterval] = useState(3);
  const [maxInterval, setMaxInterval] = useState(8);
  const [showReport, setShowReport] = useState(false);

  const isActive =
    progress.control === "running" || progress.control === "paused";
  const isTerminal =
    progress.stage === "completed" || progress.stage === "interrupted";

  const templateOptions = useMemo(() => {
    return getEmailTemplatesForOperation(templates, operation);
  }, [templates, operation]);

  const changeOperation = (value: CampaignProfileId) => {
    setOperation(value);
    setTemplateId(getDefaultEmailTemplate(templates, value)?.id ?? "");
  };

  const buildConfig = (): OneClickConfig | null => {
    if (!sector.trim() || !location.trim()) {
      toast.error("Preencha setor e localização.");
      return null;
    }
    if (!templateId) {
      toast.error("Selecione um template.");
      return null;
    }
    const intervals = clampOneClickInterval(minInterval, maxInterval);
    return {
      operation,
      sector: sector.trim(),
      location: location.trim(),
      quantity: clampOneClickQuantity(quantity),
      templateId,
      templateKind: "library",
      ...intervals,
    };
  };

  const handleStart = () => {
    const config = buildConfig();
    if (!config) return;
    void start(config);
  };

  const handleNew = () => {
    clearCheckpoint();
    setShowReport(false);
  };

  return (
    <>
      <div className="space-y-5">
        {!isActive && !isTerminal && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Operação</Label>
              <Select
                value={operation}
                onValueChange={(v) => changeOperation(v as CampaignProfileId)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Operação" />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_PROFILES.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Setor</Label>
              <Input
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                placeholder="ex: Property Finance Broker"
              />
            </div>

            <div className="space-y-2">
              <Label>Localização</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="pl-10"
                  placeholder="London"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={quantity}
                onChange={(e) =>
                  setQuantity(clampOneClickQuantity(Number(e.target.value)))
                }
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Template de e-mail" />
                </SelectTrigger>
                <SelectContent>
                  {templateOptions.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                      {template.isDefault ? " · Padrão" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Intervalo mín. (s)</Label>
              <Input
                type="number"
                min={0}
                value={minInterval}
                onChange={(e) => setMinInterval(Number(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-2">
              <Label>Intervalo máx. (s)</Label>
              <Input
                type="number"
                min={0}
                value={maxInterval}
                onChange={(e) => setMaxInterval(Number(e.target.value) || 0)}
              />
            </div>

            <div className="sm:col-span-2">
              <Button
                size="lg"
                className="h-12 w-full bg-gradient-to-r from-violet-600 to-emerald-600 font-semibold hover:from-violet-500 hover:to-emerald-500"
                onClick={handleStart}
              >
                <Rocket className="size-5" />
                Iniciar Campanha Completa
              </Button>
              {checkpoint?.campaignId && (
                <Button
                  variant="outline"
                  className="mt-2 w-full"
                  onClick={() => resume()}
                >
                  <RotateCcw className="size-4" />
                  Retomar do checkpoint
                </Button>
              )}
            </div>
          </div>
        )}

        {(isActive || isTerminal) && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {progress.control === "running" ? (
                  <Loader2 className="size-5 animate-spin text-primary" />
                ) : progress.stage === "completed" ? (
                  <CheckCircle2 className="size-5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="size-5 text-amber-400" />
                )}
                <div>
                  <p className="font-medium">{progress.stageLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    {progress.currentCompany
                      ? `Empresa: ${progress.currentCompany}`
                      : progress.batchId
                        ? `Lote: ${progress.batchId.slice(0, 28)}…`
                        : "—"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {progress.control === "running" && (
                  <>
                    {progress.stage !== "review" && (
                      <Button size="sm" variant="outline" onClick={pause}>
                        <Pause className="size-3.5" />
                        Pause
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" onClick={stop}>
                      <Square className="size-3.5" />
                      Stop
                    </Button>
                  </>
                )}
                {progress.control === "paused" && (
                  <>
                    <Button size="sm" onClick={() => resume()}>
                      <Play className="size-3.5" />
                      Resume
                    </Button>
                    <Button size="sm" variant="destructive" onClick={stop}>
                      <Square className="size-3.5" />
                      Stop
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all"
                style={{
                  width: `${
                    progress.totalRecipients > 0
                      ? Math.min(
                          100,
                          Math.round(
                            ((progress.sentCount + progress.failedCount) /
                              progress.totalRecipients) *
                              100
                          )
                        )
                      : progress.stage === "completed"
                        ? 100
                        : progress.stage === "searching"
                          ? 15
                          : progress.stage === "enriching"
                            ? 35
                            : progress.stage === "validating"
                              ? 55
                              : progress.stage === "review"
                                ? 65
                              : progress.stage === "creating_campaign" ||
                                  progress.stage === "smtp_preflight"
                                ? 70
                                : progress.stage === "sending"
                                  ? 80
                                  : 5
                  }%`,
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              <Stat label="Encontrados" value={progress.foundCount} />
              <Stat
                label="Com e-mail"
                value={progress.withEmailCount}
                accent="text-cyan-400"
              />
              <Stat
                label="Elegíveis"
                value={progress.eligibleCount}
                accent="text-emerald-400"
              />
              <Stat
                label="Enviados"
                value={progress.sentCount}
                accent="text-emerald-300"
              />
              <Stat
                label="Falhas"
                value={progress.failedCount}
                accent="text-red-400"
              />
              <Stat label="Restantes" value={progress.remainingCount} />
              <Stat
                label="Tempo"
                value={formatDuration(progress.elapsedMs)}
              />
              <Stat
                label="Estimado"
                value={
                  progress.estimatedRemainingMs > 0
                    ? formatDuration(progress.estimatedRemainingMs)
                    : "—"
                }
              />
            </div>

            {progress.stage === "review" && deduplicationPreview && (
              <div className="space-y-3">
                <GlobalDeduplicationPreviewPanel
                  preview={deduplicationPreview}
                />
                <Button
                  className="w-full"
                  disabled={deduplicationPreview.finalSendCount === 0}
                  onClick={confirmDeduplicationPreview}
                >
                  <ShieldCheck className="size-4" />
                  Confirmar prévia e continuar
                </Button>
              </div>
            )}

            {progress.stopReason && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                <p className="font-medium text-amber-200">
                  {progress.interruptedStage
                    ? `Etapa interrompida: ${progress.interruptedStage}`
                    : "Interrompido"}
                </p>
                <p className="mt-1 text-amber-100/90">{progress.stopReason}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Nenhum destinatário com envio confirmado será repetido.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/configuracoes">
                      <Settings className="size-3.5" />
                      Corrigir configuração
                    </Link>
                  </Button>
                  {checkpoint && (
                    <Button size="sm" onClick={() => resume()}>
                      <RotateCcw className="size-3.5" />
                      Retomar
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={handleNew}>
                    Iniciar nova campanha
                  </Button>
                </div>
              </div>
            )}

            {progress.stage === "completed" && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
                <p className="flex items-center gap-2 font-semibold text-emerald-300">
                  <CheckCircle2 className="size-5" />
                  Campanha concluída
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setShowReport(true)}>
                    Abrir relatório
                  </Button>
                  {progress.campaignId && (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/campanhas/${progress.campaignId}`}>
                        Ver campanha
                      </Link>
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={handleNew}>
                    Iniciar nova campanha
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Relatório final</DialogTitle>
            <DialogDescription>
              Resumo do lote e da campanha One-Click.
            </DialogDescription>
          </DialogHeader>
          {report && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Empresas" value={report.foundCount} />
                <Stat label="Websites" value={report.withWebsiteCount} />
                <Stat label="E-mails" value={report.withEmailCount} />
                <Stat label="Elegíveis" value={report.eligibleCount} />
                <Stat label="Duplicados" value={report.duplicatesRemoved} />
                <Stat label="Sem e-mail" value={report.withoutEmailCount} />
                <Stat
                  label="Enviados"
                  value={report.sentCount}
                  accent="text-emerald-400"
                />
                <Stat
                  label="Falhas"
                  value={report.failedCount}
                  accent="text-red-400"
                />
              </div>
              <p className="text-muted-foreground">
                Duração total: {formatDuration(report.durationMs)}
              </p>
              <div className="space-y-3 rounded-lg border border-border/50 p-3">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Modelo
                  </p>
                  <p className="mt-1 font-medium">{report.templateName || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Assunto completo
                  </p>
                  <p className="mt-1 break-words">{report.subject || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Corpo completo
                  </p>
                  <div
                    className="mt-2 max-h-72 overflow-y-auto rounded-md bg-background/60 p-3 text-sm [&_a]:text-primary [&_a]:underline [&_p]:mb-2"
                    dangerouslySetInnerHTML={{
                      __html: report.body || "<p>—</p>",
                    }}
                  />
                </div>
              </div>
              {report.failures.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border/50 p-2">
                  <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                    Falhas
                  </p>
                  {report.failures.map((f, i) => (
                    <p key={i} className="text-xs text-red-300/90">
                      {f.company || f.email}: {f.reason}
                    </p>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                {report.campaignId && (
                  <Button asChild>
                    <Link href={`/campanhas/${report.campaignId}`}>
                      Abrir campanha
                    </Link>
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowReport(false);
                    handleNew();
                  }}
                >
                  Iniciar nova campanha
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function OneClickOutreach({
  cardStorageKey = "one-click-outreach",
}: {
  cardStorageKey?: string;
}) {
  return (
    <CollapsibleCard
      storageKey={cardStorageKey}
      className="overflow-hidden border-violet-500/25 bg-gradient-to-br from-card via-card to-violet-500/8 shadow-lg shadow-violet-500/5"
    >
      <CollapsibleCardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="size-5 text-violet-400" />
          One-Click Outreach
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Busca → enriquecimento → validação → SMTP preflight → envio (Agente 3)
        </p>
      </CollapsibleCardHeader>
      <CollapsibleCardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="gap-1">
            <Search className="size-3" />
            Busca isolada por lote
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Mail className="size-3" />
            Validação MX
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Rocket className="size-3" />
            Só Agente 3 envia
          </Badge>
        </div>
        <OneClickFlowPanel />
      </CollapsibleCardContent>
    </CollapsibleCard>
  );
}
