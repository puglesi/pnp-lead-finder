"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Square,
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
  const nextSendAt = runner.nextSendAt[profileId];
  const preparation = runner.preparations[profileId];
  const isLoadingCampaign = runner.loadingCampaign[profileId] === true;
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [confirmedPreviewCampaignId, setConfirmedPreviewCampaignId] =
    useState<string | null>(null);
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
    .join(" · ");
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
        ? "Campanha concluída: todos os destinatários já foram enviados."
        : preparation?.message ??
          (campaignRecipientCount === 0
            ? "A campanha não possui destinatários."
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
            ? "Concluído"
            : operation.status === "error"
              ? "Erro"
              : "Pronto";
  const visualVariant =
    visualState === "Concluído"
      ? "success"
      : visualState === "Erro"
        ? "danger"
        : visualState === "Pausado" || visualState === "Carregando"
          ? "warning"
          : visualState === "Enviando"
            ? "default"
            : "secondary";
  const activityMessage = isPreparing
    ? "Carregando destinatários da campanha…"
    : visualState === "Erro"
      ? operation.errorMessage ??
        connectionStatusMessage(connectionStatus) ??
        "Erro durante a execução."
      : operation.status === "running" && nextSendSeconds !== null
        ? `Próximo envio em ${nextSendSeconds}s`
        : operation.status === "running"
          ? `Enviando ${currentPosition} de ${executionTotal}`
          : visualState === "Pausado"
            ? "Envio pausado."
            : visualState === "Concluído"
              ? "Campanha concluída."
              : emptyQueueReason
                ? emptyQueueReason
                : readyCount > 0
                  ? `${readyCount} destinatário(s) pronto(s) para envio.`
                  : "Aguardando início.";

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
      toast.error("O intervalo máximo deve ser maior ou igual ao mínimo.");
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
    if (!previewConfirmed) {
      toast.error("Confirme a prévia global antes de iniciar o envio.");
      return;
    }
    const result = await runner.start(profileId);
    if (result.message) toast.error(result.message);
  }

  async function handleResume() {
    if (!previewConfirmed) {
      toast.error("Confirme novamente a prévia global antes de retomar.");
      return;
    }
    const result = await runner.resume(profileId);
    if (result.message) toast.error(result.message);
  }

  const connectionMessage = connectionStatusMessage(connectionStatus);

  return (
    <CollapsibleCard storageKey="agent-3-control">
      <CollapsibleCardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Send className="size-5 text-primary" />
          Controle do envio
        </CardTitle>
        <CardDescription>
          Configuração independente de {getCampaignProfileName(profileId)}.
        </CardDescription>
      </CollapsibleCardHeader>
      <CollapsibleCardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="agent-three-profile">Operação</Label>
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
            <Label htmlFor="agent-three-campaign">Campanha</Label>
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

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="agent-three-numeric-limit">
              Limite numérico da operação
            </Label>
            <Input
              id="agent-three-numeric-limit"
              type="number"
              min={1}
              step={1}
              value={operation.numericLimit}
              disabled={controlsLocked || operation.untilQueueEnds}
              onChange={(event) =>
                handleNumericLimitChange(event.target.value)
              }
            />
          </div>

          <div className="flex items-center gap-3 pt-8">
            <Checkbox
              id="agent-three-unlimited"
              checked={operation.untilQueueEnds}
              disabled={controlsLocked}
              onCheckedChange={(checked) =>
                configureLimit(
                  profileId,
                  operation.numericLimit,
                  checked === true
                )
              }
            />
            <Label htmlFor="agent-three-unlimited">
              Até acabar a lista
            </Label>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="agent-three-min-interval">
              Intervalo mínimo (segundos)
            </Label>
            <Input
              id="agent-three-min-interval"
              type="number"
              min={0}
              step="any"
              value={operation.minIntervalSeconds}
              disabled={controlsLocked}
              onChange={(event) =>
                handleMinIntervalChange(event.target.value)
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-three-max-interval">
              Intervalo máximo (segundos)
            </Label>
            <Input
              id="agent-three-max-interval"
              type="number"
              min={operation.minIntervalSeconds}
              step="any"
              value={operation.maxIntervalSeconds}
              disabled={controlsLocked}
              onChange={(event) =>
                handleMaxIntervalChange(event.target.value)
              }
            />
          </div>
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
            aria-label="Progresso do envio"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="grid gap-1 text-sm sm:grid-cols-2">
            <p className="truncate" title={displayItem?.companyName}>
              <span className="text-muted-foreground">Empresa: </span>
              {displayItem?.companyName ?? "—"}
            </p>
            <p
              className="truncate"
              title={
                displayItem?.normalizedEmail ??
                displayItem?.originalEmail ??
                undefined
              }
            >
              <span className="text-muted-foreground">E-mail: </span>
              {displayItem?.normalizedEmail ?? displayItem?.originalEmail ?? "—"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {deduplicationPreview && operation.status !== "running" && (
            <Button
              variant={previewConfirmed ? "secondary" : "outline"}
              onClick={() =>
                setConfirmedPreviewCampaignId(currentCampaign?.id ?? null)
              }
              disabled={deduplicationPreview.finalSendCount === 0}
            >
              <ShieldCheck className="size-4" />
              {previewConfirmed ? "Prévia confirmada" : "Confirmar prévia"}
            </Button>
          )}
          <Button
            onClick={() => void handleStart()}
            disabled={
              controlsLocked ||
              !previewConfirmed ||
              campaignFullyDelivered ||
              (readyCount === 0 && !isPreparing)
            }
            title={
              campaignFullyDelivered
                ? "Campanha concluída — destinatários já enviados"
                : controlsLocked
                  ? "Envio em andamento ou indisponível"
                  : readyCount === 0
                    ? "Nenhum destinatário pronto"
                    : undefined
            }
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

        {deduplicationPreview && (
          <GlobalDeduplicationPreviewPanel preview={deduplicationPreview} />
        )}

        {emptyQueueReason && (
          <p className="text-sm text-amber-200/90" role="status">
            {emptyQueueReason}
          </p>
        )}

        {connectionMessage &&
          !isPreparing &&
          connectionMessage !== activityMessage &&
          connectionMessage !== emptyQueueReason && (
          <p className="text-sm text-muted-foreground" role="status">
            {connectionMessage}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryCard
            label="Destinatários da campanha"
            value={campaignRecipientCount}
          />
          <SummaryCard label="Prontos" value={readyCount} />
          <SummaryCard label="Enviados" value={confirmedSentCount} />
          <SummaryCard label="Falharam" value={metrics.failed} />
          <SummaryCard
            label="Excluídos / duplicados"
            value={excludedTotal}
          />
          <SummaryCard
            label="Responderam"
            value={campaignDelivery?.repliedCount ?? 0}
          />
          <SummaryCard
            label="Processados nesta execução"
            value={displayProcessedCount}
          />
          <SummaryCard
            label="Última atividade"
            value={formatActivity(metrics.lastActivityAt)}
          />
        </div>

        {excludedTotal > 0 && (
          <p className="text-sm text-muted-foreground" role="status">
            {excludedTotal} excluído(s): {exclusionSummary || "sem motivo registrado"}.
          </p>
        )}
      </CollapsibleCardContent>
    </CollapsibleCard>
  );
}
