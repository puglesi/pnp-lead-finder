"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Square,
  Stethoscope,
} from "lucide-react";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardDescription, CardTitle } from "@/components/ui/card";
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardHeader,
} from "@/components/ui/collapsible-card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createInitialAgentThreeSnapshot,
  getAgentThreeMetrics,
} from "@/lib/agent-three-queue";
import {
  countAgentThreeExcludedRecipients,
  describeAgentThreeExclusionReason,
} from "@/lib/agent-three-campaign-load";
import { isCampaignFullyDelivered } from "@/lib/campaign-completion";
import { getCampaignDeliverySnapshot } from "@/lib/campaign-metrics";
import {
  connectionStatusMessage,
  useAgentThreeRunner,
} from "@/hooks/use-agent-three-runner";
import { useAgentThreeStore } from "@/store/agent-three-store";
import { useCampaignStore } from "@/store/campaign-store";
import { GlobalDeduplicationPreviewPanel } from "@/components/campaigns/global-deduplication-preview";
import {
  CAMPAIGN_PROFILES,
  getCampaignProfileName,
  type CampaignProfileId,
} from "@/types/campaign-profile";
import { describeAgentThreeStartBlock } from "@/lib/agent-three-smtp-contract";
import { cn } from "@/lib/utils";

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;
const ERROR_CONNECTION_STATUSES = new Set<string>([
  "dns_incomplete",
  "request_error",
  "real_send_disabled",
  "configuration_error",
  "authentication_error",
  "provider_rate_limit",
  "provider_account_blocked",
  "transient_error",
  "permanent_error",
  "invalid_request",
]);

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-2xl font-semibold" title={String(value)}>
        {value}
      </p>
    </div>
  );
}

function formatActivity(value: string | null): string {
  return value ? value.replace("T", " ").slice(0, 16) : "Nenhuma";
}

export function AgentThreeSender() {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot
  );
  return <AgentThreeSenderContent hydrated={hydrated} />;
}

function AgentThreeSenderContent({ hydrated }: { hydrated: boolean }) {
  const persistedProfileId = useAgentThreeStore(
    (state) => state.selectedProfileId
  );
  const persistedOperations = useAgentThreeStore((state) => state.operations);
  const selectProfile = useAgentThreeStore((state) => state.selectProfile);
  const selectCampaign = useAgentThreeStore((state) => state.selectCampaign);
  const configureLimit = useAgentThreeStore((state) => state.configureLimit);
  const configureIntervals = useAgentThreeStore(
    (state) => state.configureIntervals
  );
  const campaigns = useCampaignStore((state) => state.campaigns);
  const runner = useAgentThreeRunner();

  const profileId: CampaignProfileId = hydrated
    ? persistedProfileId
    : "panek-puglesi";
  const initialOperation =
    createInitialAgentThreeSnapshot().operations[profileId];
  const operation = hydrated
    ? persistedOperations[profileId]
    : initialOperation;
  const metrics = getAgentThreeMetrics(operation);
  const profileCampaigns = campaigns.filter(
    (campaign) => campaign.campaignProfileId === profileId
  );
  const currentCampaign = profileCampaigns.find(
    (campaign) => campaign.id === operation.currentCampaignId
  );
  const connectionStatus = runner.statuses[profileId];
  const smtpResult = runner.smtpResults[profileId];
  const nextSendAt = runner.nextSendAt[profileId];
  const preparation = runner.preparations[profileId];
  const isLoadingCampaign = runner.loadingCampaign[profileId] === true;
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [confirmedPreviewCampaignId, setConfirmedPreviewCampaignId] =
    useState<string | null>(null);
  const [intervalsDirty, setIntervalsDirty] = useState(false);
  const deduplicationPreview = preparation?.deduplicationPreview ?? null;
  const previewConfirmed =
    Boolean(currentCampaign) &&
    confirmedPreviewCampaignId === currentCampaign?.id;
  useEffect(() => {
    if (nextSendAt === null) return;
    const interval = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [nextSendAt]);

  useEffect(() => {
    if (!hydrated) return;
    void runner.loadCampaign(profileId, operation.currentCampaignId);
    // Auto-load when profile/campaign selection changes after hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runner methods are stable for this UI flow
  }, [hydrated, profileId, operation.currentCampaignId]);

  const isPreparing =
    isLoadingCampaign || connectionStatus === "validating";
  const isActive =
    operation.status === "running" || operation.status === "paused";
  const controlsLocked = isActive || isPreparing;
  const campaignItems = operation.queue.filter(
    (item) => item.campaignId === operation.currentCampaignId
  );
  const currentItem = campaignItems.find(
    (item) => item.id === operation.currentItemId
  );
  const nextItem = campaignItems.find((item) => item.queueStatus === "ready");
  const lastProcessedItem = [...campaignItems]
    .reverse()
    .find(
      (item) =>
        item.queueStatus === "sent" || item.queueStatus === "failed"
    );
  const displayItem = currentItem ?? nextItem ?? lastProcessedItem;
  const readyCount = campaignItems.filter(
    (item) => item.queueStatus === "ready"
  ).length;
  const excludedItems = campaignItems.filter(
    (item) =>
      item.queueStatus === "blocked" || item.queueStatus === "skipped"
  );
  const campaignDelivery = currentCampaign
    ? getCampaignDeliverySnapshot(currentCampaign)
    : null;
  const campaignFullyDelivered = currentCampaign
    ? isCampaignFullyDelivered(currentCampaign)
    : false;
  // Queue status is authoritative for Agent 3; falls back to reconciled campaign counters.
  const confirmedSentCount =
    campaignItems.length > 0
      ? metrics.sent
      : (campaignDelivery?.sentCount ?? 0);
  const campaignRecipientCount =
    currentCampaign?.leadIds.length ??
    preparation?.campaignRecipientCount ??
    metrics.total;
  // Never treat ready/pending queue items as excluded (reload ignoredCount was 96+2).
  const excludedTotal = countAgentThreeExcludedRecipients({
    campaignRecipientCount,
    queueItems: campaignItems,
    confirmedSentCount,
  });
  const missingExcluded = Math.max(
    0,
    excludedTotal - excludedItems.length
  );
  const exclusionBreakdown = excludedItems.reduce<Record<string, number>>(
    (acc, item) => {
      const label = describeAgentThreeExclusionReason(item.exclusionReason);
      acc[label] = (acc[label] ?? 0) + 1;
      return acc;
    },
    {}
  );
  if (missingExcluded > 0) {
    exclusionBreakdown["duplicado"] =
      (exclusionBreakdown["duplicado"] ?? 0) + missingExcluded;
  }
  const exclusionSummary = Object.entries(exclusionBreakdown)
    .map(([reason, count]) => `${count} ${reason}`)
    .join(" Â· ");
  const isLiveExecution =
    operation.status === "running" || operation.status === "paused";
  const displayProcessedCount = isLiveExecution ? metrics.processedCount : 0;
  const possibleTotal = displayProcessedCount + readyCount;
  const executionTotal = operation.untilQueueEnds
    ? possibleTotal
    : Math.min(operation.numericLimit, possibleTotal);
  const progressPercent =
    executionTotal > 0 && isLiveExecution
      ? Math.min(
          100,
          Math.round((displayProcessedCount / executionTotal) * 100)
        )
      : 0;
  const currentPosition = Math.min(
    executionTotal,
    Math.max(1, displayProcessedCount)
  );
  const nextSendSeconds =
    nextSendAt === null
      ? null
      : Math.max(0, Math.ceil((nextSendAt - clockNow) / 1_000));
  const hasConnectionError =
    connectionStatus !== null &&
    ERROR_CONNECTION_STATUSES.has(connectionStatus);
  const emptyQueueReason =
    !isPreparing &&
    operation.currentCampaignId &&
    readyCount === 0 &&
    operation.status !== "running"
      ? campaignFullyDelivered
        ? "Campanha concluÃ­da: todos os destinatÃ¡rios jÃ¡ foram enviados."
        : preparation?.message ??
          (campaignRecipientCount === 0
            ? "A campanha nÃ£o possui destinatÃ¡rios."
            : null)
      : null;

  const visualState = isPreparing
    ? "Carregando"
    : hasConnectionError && operation.status !== "running"
      ? "Erro"
      : operation.status === "running"
        ? "Enviando"
        : operation.status === "paused" || operation.status === "stopped"
          ? "Pausado"
          : operation.status === "completed"
            ? "ConcluÃ­do"
            : operation.status === "error"
              ? "Erro"
              : "Pronto";
  const visualVariant =
    visualState === "ConcluÃ­do"
      ? "success"
      : visualState === "Erro"
        ? "danger"
        : visualState === "Pausado" || visualState === "Carregando"
          ? "warning"
          : visualState === "Enviando"
            ? "default"
            : "secondary";
  const activityMessage = isPreparing
    ? "Carregando destinatÃ¡rios da campanhaâ€¦"
    : visualState === "Erro"
      ? operation.errorMessage ??
        connectionStatusMessage(connectionStatus) ??
        "Erro durante a execuÃ§Ã£o."
      : operation.status === "running" && nextSendSeconds !== null
        ? `PrÃ³ximo envio em ${nextSendSeconds}s`
        : operation.status === "running"
          ? `Enviando ${currentPosition} de ${executionTotal}`
          : visualState === "Pausado"
            ? "Envio pausado."
            : visualState === "ConcluÃ­do"
              ? "Campanha concluÃ­da."
              : emptyQueueReason
                ? emptyQueueReason
                : readyCount > 0
                  ? `${readyCount} destinatÃ¡rio(s) pronto(s) para envio.`
                  : "Aguardando inÃ­cio.";

  function handleNumericLimitChange(value: string) {
    const numericLimit = Number(value);
    if (!Number.isInteger(numericLimit) || numericLimit < 1) return;
    configureLimit(profileId, numericLimit, operation.untilQueueEnds);
  }

  function handleMinIntervalChange(value: string) {
    const minIntervalSeconds = Number(value);
    if (!Number.isFinite(minIntervalSeconds) || minIntervalSeconds < 0) return;
    configureIntervals(
      profileId,
      minIntervalSeconds,
      Math.max(operation.maxIntervalSeconds, minIntervalSeconds)
    );
  }

  function handleMaxIntervalChange(value: string) {
    const maxIntervalSeconds = Number(value);
    if (!Number.isFinite(maxIntervalSeconds) || maxIntervalSeconds < 0) return;
    if (maxIntervalSeconds < operation.minIntervalSeconds) {
      toast.error("O intervalo mÃ¡ximo deve ser maior ou igual ao mÃ­nimo.");
      return;
    }
    configureIntervals(
      profileId,
      operation.minIntervalSeconds,
      maxIntervalSeconds
    );
  }

  async function handleCampaignChange(value: string) {
    const campaignId = value === "none" ? null : value;
    setConfirmedPreviewCampaignId(null);
    selectCampaign(profileId, campaignId);
    await runner.loadCampaign(profileId, campaignId);
  }


  async function handleStart() {
    const block = startBlockReason();
    if (block) {
      toast.error(block);
      return;
    }
    const result = await runner.start(profileId);
    if (result.message) toast.error(result.message);
  }

  async function handleResume() {
    if (!previewConfirmed) {
      toast.error("Prévia de deduplicação necessária — confirme a prévia global.");
      return;
    }
    const result = await runner.resume(profileId);
    if (result.message) toast.error(result.message);
  }

  async function handleVerifySend() {
    setPreflightBusy(true);
    try {
      const result = await runner.verifySend(profileId, { verify: true });
      if (result.status === "connected") {
        toast.success(result.message || "Pronto para envio real");
      } else {
        toast.error(result.message || "Verificação falhou");
      }
    } finally {
      setPreflightBusy(false);
    }
  }

  function startBlockReason(): string | null {
    if (campaignFullyDelivered) {
      return describeAgentThreeStartBlock({ campaignCompleted: true });
    }
    if (!currentCampaign) {
      return describeAgentThreeStartBlock({ campaignMissing: true });
    }
    if (currentCampaign.status === "draft") {
      return describeAgentThreeStartBlock({ campaignUnsavedDraft: true });
    }
    if (!previewConfirmed) {
      return describeAgentThreeStartBlock({ previewRequired: true });
    }
    if (readyCount === 0 && !isPreparing) {
      return describeAgentThreeStartBlock({ noEligible: true });
    }
    if (connectionStatus === "real_send_disabled") {
      return describeAgentThreeStartBlock({
        realSendDisabled: true,
        smtpMessage: smtpResult?.message,
      });
    }
    if (connectionStatus === "configuration_error") {
      return describeAgentThreeStartBlock({
        configurationError: true,
        smtpMessage: smtpResult?.message,
        missingEnvVars: smtpResult?.diagnostics?.missingEnvVars,
      });
    }
    if (connectionStatus === "authentication_error") {
      return describeAgentThreeStartBlock({
        authError: true,
        smtpMessage: smtpResult?.message,
      });
    }
    return null;
  }

  const connectionMessage = connectionStatusMessage(
    connectionStatus,
    smtpResult?.message
  );
  const startDisabledReason = startBlockReason();
  const smtpReady = connectionStatus === "connected";

  function saveIntervals() {
    setIntervalsDirty(false);
    toast.success("Salvo");
  }

  return (
    <div className="space-y-4">
      <CollapsibleCard storageKey="agent-3-control" defaultOpen>
        <CollapsibleCardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Send className="size-5 text-primary" />
            Envio — {getCampaignProfileName(profileId)}
          </CardTitle>
          <CardDescription>
            Fluxo: operação → campanha → prévia → verificar → Start.
          </CardDescription>
        </CollapsibleCardHeader>
        <CollapsibleCardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="agent-three-profile">1. Operação</Label>
              <Select
                value={profileId}
                disabled={controlsLocked}
                onValueChange={(value) => {
                  setConfirmedPreviewCampaignId(null);
                  selectProfile(value as CampaignProfileId);
                }}
              >
                <SelectTrigger id="agent-three-profile">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_PROFILES.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-three-campaign">2. Campanha</Label>
              <Select
                value={operation.currentCampaignId ?? "none"}
                onValueChange={(value) => {
                  void handleCampaignChange(value);
                }}
                disabled={controlsLocked}
              >
                <SelectTrigger id="agent-three-campaign">
                  <SelectValue placeholder="Selecione uma campanha" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma campanha</SelectItem>
                  {profileCampaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="3. Destinatários" value={campaignRecipientCount} />
            <SummaryCard label="Prontos" value={readyCount} />
            <SummaryCard label="Enviados" value={confirmedSentCount} />
            <SummaryCard label="Excluídos" value={excludedTotal} />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">4. Prévia de deduplicação</p>
            {deduplicationPreview ? (
              <>
                <GlobalDeduplicationPreviewPanel preview={deduplicationPreview} />
                <Button
                  variant={previewConfirmed ? "secondary" : "default"}
                  onClick={() =>
                    setConfirmedPreviewCampaignId(currentCampaign?.id ?? null)
                  }
                  disabled={
                    operation.status === "running" ||
                    deduplicationPreview.finalSendCount === 0
                  }
                >
                  <ShieldCheck className="size-4" />
                  {previewConfirmed ? "Prévia confirmada" : "Confirmar prévia"}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Selecione uma campanha para gerar a prévia global.
              </p>
            )}
          </div>

          <CollapsibleCard
            storageKey="agent-3-intervals"
            defaultOpen={false}
            className="border-border/50 bg-background/30"
          >
            <CollapsibleCardHeader>
              <CardTitle className="text-base">5. Intervalo / limite</CardTitle>
              <CardDescription>
                Preferências da operação (persistidas no Agente 3).
              </CardDescription>
            </CollapsibleCardHeader>
            <CollapsibleCardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="agent-three-numeric-limit">Limite numérico</Label>
                  <Input
                    id="agent-three-numeric-limit"
                    type="number"
                    min={1}
                    step={1}
                    value={operation.numericLimit}
                    disabled={controlsLocked || operation.untilQueueEnds}
                    onChange={(event) => {
                      handleNumericLimitChange(event.target.value);
                      setIntervalsDirty(true);
                    }}
                  />
                </div>
                <div className="flex items-center gap-3 pt-8">
                  <Checkbox
                    id="agent-three-unlimited"
                    checked={operation.untilQueueEnds}
                    disabled={controlsLocked}
                    onCheckedChange={(checked) => {
                      configureLimit(
                        profileId,
                        operation.numericLimit,
                        checked === true
                      );
                      setIntervalsDirty(true);
                    }}
                  />
                  <Label htmlFor="agent-three-unlimited">Até acabar a lista</Label>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="agent-three-min-interval">Intervalo mín. (s)</Label>
                  <Input
                    id="agent-three-min-interval"
                    type="number"
                    min={0}
                    step="any"
                    value={operation.minIntervalSeconds}
                    disabled={controlsLocked}
                    onChange={(event) => {
                      handleMinIntervalChange(event.target.value);
                      setIntervalsDirty(true);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agent-three-max-interval">Intervalo máx. (s)</Label>
                  <Input
                    id="agent-three-max-interval"
                    type="number"
                    min={operation.minIntervalSeconds}
                    step="any"
                    value={operation.maxIntervalSeconds}
                    disabled={controlsLocked}
                    onChange={(event) => {
                      handleMaxIntervalChange(event.target.value);
                      setIntervalsDirty(true);
                    }}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {intervalsDirty && (
                  <Badge variant="warning" className="text-[10px]">
                    Alterações não salvas
                  </Badge>
                )}
                <Button type="button" size="sm" onClick={saveIntervals}>
                  Salvar alterações
                </Button>
              </div>
            </CollapsibleCardContent>
          </CollapsibleCard>

          <div className="space-y-3 rounded-xl border border-border/60 bg-background/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">6. Verificar envio</p>
              <Button
                type="button"
                variant="outline"
                disabled={preflightBusy || controlsLocked}
                onClick={() => void handleVerifySend()}
              >
                {preflightBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Stethoscope className="size-4" />
                )}
                Verificar envio
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Testa configuração, SMTP/auth, flag de envio real e endpoint — sem
              enviar e-mail.
            </p>
            {smtpReady ? (
              <p
                className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"
                role="status"
              >
                <CheckCircle2 className="size-4" />
                {connectionMessage || "Pronto para envio real"}
              </p>
            ) : connectionMessage ? (
              <p
                className={cn(
                  "text-sm",
                  hasConnectionError
                    ? "text-amber-800 dark:text-amber-200"
                    : "text-muted-foreground"
                )}
                role="status"
              >
                {connectionMessage}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Clique em Verificar envio antes do Start.
              </p>
            )}
            {smtpResult?.diagnostics?.missingEnvVars &&
              smtpResult.diagnostics.missingEnvVars.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Variáveis ausentes (nomes apenas):{" "}
                  {smtpResult.diagnostics.missingEnvVars.join(", ")}
                </p>
              )}
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-background/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium" role="status" aria-live="polite">
                {activityMessage}
              </p>
              <Badge variant={visualVariant}>{visualState}</Badge>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-secondary"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {displayItem?.companyName ?? "—"} ·{" "}
              {displayItem?.normalizedEmail ?? displayItem?.originalEmail ?? "—"}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">7. Controles</p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void handleStart()}
                disabled={
                  controlsLocked ||
                  Boolean(startDisabledReason) ||
                  (readyCount === 0 && !isPreparing)
                }
                title={startDisabledReason ?? undefined}
              >
                {isPreparing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                {isPreparing ? "Carregando…" : "Start"}
              </Button>
              <Button
                variant="outline"
                onClick={() => runner.pause(profileId)}
                disabled={operation.status !== "running"}
              >
                <Pause className="size-4" />
                Pause
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleResume()}
                disabled={operation.status !== "paused" || !previewConfirmed}
              >
                <RotateCcw className="size-4" />
                Resume
              </Button>
              <Button
                variant="destructive"
                onClick={() => runner.stop(profileId)}
                disabled={!isActive}
              >
                <Square className="size-4" />
                Stop
              </Button>
            </div>
            {startDisabledReason && !isActive && (
              <p className="text-sm text-amber-800 dark:text-amber-200" role="status">
                {startDisabledReason}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">8. Resultado</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard label="Falharam" value={metrics.failed} />
              <SummaryCard
                label="Responderam"
                value={campaignDelivery?.repliedCount ?? 0}
              />
              <SummaryCard label="Processados" value={displayProcessedCount} />
              <SummaryCard
                label="Última atividade"
                value={formatActivity(metrics.lastActivityAt)}
              />
            </div>
            {excludedTotal > 0 && (
              <p className="text-sm text-muted-foreground" role="status">
                {excludedTotal} excluído(s):{" "}
                {exclusionSummary || "sem motivo registrado"}.
              </p>
            )}
            {emptyQueueReason && (
              <p className="text-sm text-amber-800 dark:text-amber-200" role="status">
                {emptyQueueReason}
              </p>
            )}
          </div>
        </CollapsibleCardContent>
      </CollapsibleCard>

      <CollapsibleCard storageKey="agent-3-advanced-details" defaultOpen={false}>
        <CollapsibleCardHeader>
          <CardTitle className="text-base">Detalhes avançados</CardTitle>
          <CardDescription>
            Métricas extras — oculto por padrão.
          </CardDescription>
        </CollapsibleCardHeader>
        <CollapsibleCardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Operação: {getCampaignProfileName(profileId)} · Campanha:{" "}
            {currentCampaign?.name ?? "—"} · Status fila: {operation.status}
          </p>
          <p>
            Flag realSend (servidor):{" "}
            {smtpResult?.diagnostics
              ? smtpResult.diagnostics.realSendEnabled
                ? "habilitada"
                : "desabilitada"
              : "ainda não verificada"}
          </p>
          {exclusionSummary && <p>Exclusões: {exclusionSummary}</p>}
        </CollapsibleCardContent>
      </CollapsibleCard>
    </div>
  );
}
