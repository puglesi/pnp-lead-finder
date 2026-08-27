"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ListRestart,
  MailCheck,
  Loader2,
  MapPin,
  Pause,
  Pickaxe,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
} from "lucide-react";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CardDescription, CardTitle } from "@/components/ui/card";
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardHeader,
} from "@/components/ui/collapsible-card";
import { BatchHandoffPanel } from "@/components/pipeline/batch-handoff-panel";
import {
  getAgentTwoEligibleLeadCount,
  getAgentTwoStats,
  parseAgentTwoLoadQuantity,
  type AgentTwoQueueAppendResult,
  type AgentTwoQueueItem,
} from "@/lib/agent-two-queue";
import {
  filterLeadsByMemberIds,
  getBatchEligibleLeads,
  getBatchLeadStats,
  getBatchValidationCandidates,
  hasEmail,
  validateBatchSnapshotIntegrity,
} from "@/lib/lead-batch";
import {
  persistImmediateAgentTwoResults,
  useAgentTwoRunner,
} from "@/hooks/use-agent-two-runner";
import { useAgentTwoStore } from "@/store/agent-two-store";
import { useBatchPipelineStore } from "@/store/batch-pipeline-store";
import { useLeadStore } from "@/store/lead-store";
import type { EmailValidationStatus } from "@/types/email-validation";

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

const AGENT_STATUS_LABELS = {
  idle: "Inativo",
  running: "Em execução",
  paused: "Pausado",
  stopped: "Parado",
  completed: "Concluído",
  error: "Erro",
} as const;

const VALIDATION_STATUS_LABELS: Record<EmailValidationStatus, string> = {
  pending: "Pendente",
  validating: "Validando",
  valid: "Válido",
  invalid: "Inválido",
  duplicate: "Duplicado",
  risky: "Arriscado",
  catch_all: "Catch-all",
  unknown: "Desconhecido",
  no_email: "Sem e-mail",
};

function statusVariant(status: EmailValidationStatus) {
  if (status === "valid") return "success" as const;
  if (status === "invalid") return "danger" as const;
  if (status === "duplicate" || status === "risky" || status === "catch_all") {
    return "warning" as const;
  }
  if (status === "validating") return "default" as const;
  return "secondary" as const;
}

function ValidationBadge({ status }: { status: EmailValidationStatus }) {
  return (
    <Badge variant={statusVariant(status)}>
      {VALIDATION_STATUS_LABELS[status]}
    </Badge>
  );
}

function formatValidationDate(value: string | undefined): string {
  return value ? value.replace("T", " ").slice(0, 16) : "—";
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export function AgentTwoValidator() {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot
  );
  return <AgentTwoValidatorContent hydrated={hydrated} />;
}

function AgentTwoValidatorContent({ hydrated }: { hydrated: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlBatchId = searchParams.get("batchId");
  /** URL batchId wins: exclusive lote mode (hide general 200-lead queue). */
  const isBatchMode = Boolean(urlBatchId);

  const persistedStatus = useAgentTwoStore((state) => state.status);
  const persistedQueue = useAgentTwoStore((state) => state.queue);
  const persistedCurrentItemId = useAgentTwoStore((state) => state.currentItemId);
  const persistedError = useAgentTwoStore((state) => state.errorMessage);
  const savedLeads = useLeadStore((state) => state.savedLeads);
  const currentLeads = useLeadStore((state) => state.currentLeads);
  const repairBatchMembershipFromSnapshot = useLeadStore(
    (state) => state.repairBatchMembershipFromSnapshot
  );
  const loadQueue = useAgentTwoStore((state) => state.loadQueue);
  const appendSample = useAgentTwoStore((state) => state.appendSample);
  const appendAll = useAgentTwoStore((state) => state.appendAll);
  const start = useAgentTwoStore((state) => state.start);
  const pause = useAgentTwoStore((state) => state.pause);
  const resume = useAgentTwoStore((state) => state.resume);
  const stop = useAgentTwoStore((state) => state.stop);
  const retryItem = useAgentTwoStore((state) => state.retryItem);
  const retryDnsErrors = useAgentTwoStore((state) => state.retryDnsErrors);
  const activeBatchId = useBatchPipelineStore((state) => state.activeBatchId);
  const batches = useBatchPipelineStore((state) => state.batches);
  const setActiveBatch = useBatchPipelineStore((state) => state.setActiveBatch);
  const updateBatchStage = useBatchPipelineStore(
    (state) => state.updateBatchStage
  );
  const { runQueue, isExecutionActive } = useAgentTwoRunner();
  const [loadQuantity, setLoadQuantity] = useState("10");
  const [loadError, setLoadError] = useState<string | null>(null);
  const preparedBatchRef = useRef<string | null>(null);
  const repairedBatchRef = useRef<string | null>(null);

  const selectedBatchId = urlBatchId ?? (!isBatchMode ? activeBatchId : null);
  const status = hydrated ? persistedStatus : "idle";
  const currentItemId = hydrated ? persistedCurrentItemId : null;
  const agentError = hydrated ? persistedError : null;
  const activeBatch =
    hydrated && selectedBatchId && batches[selectedBatchId]
      ? batches[selectedBatchId]
      : null;

  // Repair membership from SearchRecord snapshot on open (detach 42 contaminants).
  useEffect(() => {
    if (!hydrated || !urlBatchId) return;
    if (repairedBatchRef.current === urlBatchId) return;
    repairedBatchRef.current = urlBatchId;
    setActiveBatch(urlBatchId);
    const repaired = repairBatchMembershipFromSnapshot(urlBatchId);
    if (repaired) {
      updateBatchStage(repaired.batchId, "validation");
      const integrity = validateBatchSnapshotIntegrity(repaired);
      if (!integrity.ok) {
        console.warn(
          "[agent-2] batch integrity mismatch",
          integrity,
          repaired.batchId
        );
      }
    }
  }, [
    hydrated,
    urlBatchId,
    setActiveBatch,
    repairBatchMembershipFromSnapshot,
    updateBatchStage,
  ]);

  useEffect(() => {
    if (!activeBatch || !isBatchMode) return;
    updateBatchStage(activeBatch.batchId, "validation");
  }, [activeBatch, isBatchMode, updateBatchStage]);

  // Exclusive source of truth: batch.leadIds from repaired snapshot only.
  const batchMemberIds = useMemo(() => {
    if (!isBatchMode) return [] as string[];
    return activeBatch?.leadIds ?? [];
  }, [isBatchMode, activeBatch]);

  const batchLeadCount = batchMemberIds.length;

  const batchScopedLeads = useMemo(() => {
    if (!hydrated) return [];
    // General mode (no URL batch): full saved pool for classic Agente 2 UX.
    if (!isBatchMode) return savedLeads;
    // Batch mode: ONLY snapshot leadIds — never batchId/sector/fingerprint expand.
    if (batchMemberIds.length === 0) return [];
    const pool = [...currentLeads, ...savedLeads];
    return filterLeadsByMemberIds(pool, batchMemberIds);
  }, [
    hydrated,
    isBatchMode,
    batchMemberIds,
    savedLeads,
    currentLeads,
  ]);

  const leads = batchScopedLeads;

  // Exclusive queue: only items whose leadId is in batch.leadIds.
  const queue = useMemo(() => {
    const fullQueue = hydrated ? persistedQueue : [];
    if (!isBatchMode) return fullQueue;
    if (batchMemberIds.length === 0) return [];
    const allowed = new Set(batchMemberIds);
    return fullQueue.filter((item) => allowed.has(item.leadId));
  }, [isBatchMode, hydrated, persistedQueue, batchMemberIds]);

  const batchStats = useMemo(() => {
    const stats = getBatchLeadStats(leads);
    // total always equals exclusive membership count in batch mode
    if (isBatchMode && batchLeadCount > 0) {
      return { ...stats, total: batchLeadCount };
    }
    return stats;
  }, [leads, isBatchMode, batchLeadCount]);

  const eligibleLeads = useMemo(() => getBatchEligibleLeads(leads), [leads]);
  const stats = getAgentTwoStats(queue);
  const leadsWithEmail = leads.filter((lead) => hasEmail(lead)).length;
  const eligibleCount = getAgentTwoEligibleLeadCount(leads, queue);
  const currentItem =
    queue.find((item) => item.id === currentItemId) ??
    queue.find((item) => item.status === "validating") ??
    null;
  const isActive = status === "running" || status === "paused";
  const hasPending = queue.some((item) => item.status === "pending");
  const dnsErrorCount = queue.filter((item) => item.reason === "dns_error").length;

  // Auto-prepare validation queue with only emails from batch.leadIds (once).
  useEffect(() => {
    if (!hydrated || !isBatchMode || !selectedBatchId) return;
    if (!activeBatch?.leadIds || activeBatch.leadIds.length === 0) return;
    if (preparedBatchRef.current === selectedBatchId) return;
    // Wait for snapshot leads to resolve before locking preparation.
    if (leads.length === 0 && batchLeadCount > 0) return;
    if (batchLeadCount === 0) return;

    preparedBatchRef.current = selectedBatchId;
    // loadQueue scopes the validation work queue to ONLY these member IDs.
    // Does not delete leads of other lots from the lead store.
    loadQueue(leads, false);
    persistImmediateAgentTwoResults();
    const emailCount = getBatchValidationCandidates(leads).length;
    if (emailCount > 0) {
      toast.success(
        `${emailCount} e-mail(s) do lote preparados para validação (${batchLeadCount} leads no lote).`
      );
    } else {
      toast(
        `Lote com ${batchLeadCount} lead(s) — nenhum e-mail elegível ainda.`
      );
    }
  }, [
    hydrated,
    isBatchMode,
    selectedBatchId,
    activeBatch,
    leads,
    batchLeadCount,
    loadQueue,
  ]);

  function reportAddedItems(result: AgentTwoQueueAppendResult) {
    persistImmediateAgentTwoResults();
    if (result.addedItems.length === 0) {
      toast.success("Nenhum novo item elegível foi adicionado.");
      return;
    }
    toast.success(
      result.addedPendingCount +
        " e-mail(s) adicionado(s) para validação e " +
        result.addedDuplicateCount +
        " duplicado(s) identificado(s)."
    );
  }

  function handleLoadSample() {
    if (isActive) return;
    if (eligibleCount === 0) {
      setLoadError("Não existem e-mails pendentes disponíveis.");
      return;
    }
    const parsed = parseAgentTwoLoadQuantity(loadQuantity, eligibleCount);
    if (parsed.error || parsed.quantity === null) {
      setLoadError(parsed.error);
      return;
    }
    setLoadError(null);
    const result = appendSample(leads, parsed.quantity);
    reportAddedItems(result);
  }

  function handleLoadAll() {
    if (isActive) return;
    if (eligibleCount === 0) {
      setLoadError("Não existem e-mails pendentes disponíveis.");
      return;
    }
    setLoadError(null);
    const result = appendAll(leads, (count) =>
      window.confirm(
        "Adicionar " + count.toLocaleString("pt-BR") + " e-mails à fila?"
      )
    );
    if (!result.confirmed) {
      toast("Carregamento cancelado; a fila não foi alterada.");
      return;
    }
    reportAddedItems(result);
  }

  function handleRevalidateAll() {
    if (isActive) return;
    const nextQueue = loadQueue(leads, true);
    persistImmediateAgentTwoResults();
    toast.success(
      nextQueue.length === 0
        ? "Nenhum lead disponível para revalidar."
        : nextQueue.length + " lead(s) preparado(s) para revalidação."
    );
  }

  function handleStart() {
    if (start()) void runQueue();
  }

  function handlePause() {
    pause();
    toast("O agente pausará antes do próximo e-mail.");
  }

  function handleResume() {
    resume(isExecutionActive());
    void runQueue();
  }

  function handleStop() {
    stop();
    toast("Validação interrompida; o progresso foi preservado.");
  }

  function handleRetry(item: AgentTwoQueueItem) {
    if (retryItem(item.id)) {
      toast.success(item.company + ": item preparado para nova tentativa.");
    }
  }

  function handleRetryDnsErrors() {
    const retriedCount = retryDnsErrors();
    if (retriedCount > 0) {
      toast.success(
        retriedCount +
          " item(ns) com erro DNS preparado(s). Use Start para tentar novamente."
      );
    }
  }

  function handleCreateCampaignWithEligible() {
    const batchId = urlBatchId ?? activeBatch?.batchId;
    if (!batchId) {
      toast.error("Nenhum lote ativo. Abra um lote a partir da busca.");
      return;
    }
    if (eligibleLeads.length === 0) {
      toast.error(
        "Não há e-mails elegíveis neste lote. Enriqueça leads sem e-mail no Agente 1 ou valide a fila."
      );
      return;
    }
    updateBatchStage(batchId, "campaign");
    router.push(`/campanhas/nova?batchId=${encodeURIComponent(batchId)}`);
  }

  function handleBackToAgentOne() {
    const batchId = urlBatchId ?? activeBatch?.batchId;
    if (!batchId) {
      router.push("/agente-1");
      return;
    }
    router.push(`/agente-1?batchId=${encodeURIComponent(batchId)}`);
  }

  const campaignActionLabel = `Criar campanha com ${eligibleLeads.length} elegíveis`;

  const batchSummaryCards = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <SummaryCard label="Encontrados reais" value={batchStats.realFound} />
      <SummaryCard label="Com e-mail" value={batchStats.withEmail} />
      <SummaryCard label="Sem e-mail" value={batchStats.withoutEmail} />
      <SummaryCard label="E-mail único" value={batchStats.uniqueEmails} />
      <SummaryCard label="Duplicados" value={batchStats.duplicates} />
      <SummaryCard label="Inválidos" value={batchStats.invalid} />
      <SummaryCard
        label="Não confirmados"
        value={batchStats.unconfirmed}
      />
      <SummaryCard label="Elegíveis" value={batchStats.eligible} />
      <SummaryCard label="Pend. validação" value={batchStats.pendingValidation} />
      <SummaryCard label="Total na fila" value={stats.total} />
      <SummaryCard label="Pendentes" value={stats.pending} />
      <SummaryCard label="Duplicados" value={stats.duplicate} />
      <SummaryCard label="Item atual" value={currentItem?.company ?? "Nenhum"} />
    </div>
  );

  const controlButtons = (
    <div className="flex flex-wrap gap-2">
      {!isBatchMode && (
        <Button
          variant="outline"
          onClick={handleRevalidateAll}
          disabled={isActive || leads.length === 0}
        >
          <RotateCcw className="size-4" />
          Revalidar todos
        </Button>
      )}
      <Button
        variant="outline"
        onClick={handleRetryDnsErrors}
        disabled={isActive || dnsErrorCount === 0}
      >
        <RotateCcw className="size-4" />
        Tentar novamente erros DNS
      </Button>
      <Button
        onClick={handleStart}
        disabled={!hasPending || isActive}
        title={
          !hasPending
            ? "Carregue e-mails pendentes"
            : isActive
              ? "Validação já iniciada"
              : undefined
        }
      >
        {status === "running" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Play className="size-4" />
        )}
        {status === "running" ? "Validando…" : "Start"}
      </Button>
      <Button
        variant="outline"
        onClick={handlePause}
        disabled={status !== "running"}
      >
        <Pause className="size-4" />
        Pause
      </Button>
      <Button
        variant="outline"
        onClick={handleResume}
        disabled={status !== "paused"}
      >
        <RotateCcw className="size-4" />
        Resume
      </Button>
      <Button variant="destructive" onClick={handleStop} disabled={!isActive}>
        <Square className="size-4" />
        Stop
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      {isBatchMode && (
        <>
          {activeBatch ? (
            <BatchHandoffPanel
              batch={activeBatch}
              stats={{
                ...batchStats,
                total: batchLeadCount || batchStats.total,
              }}
              title="Lote aberto no Agente 2"
              description={`${activeBatch.sector} · ${activeBatch.location} · ${batchLeadCount || activeBatch.foundCount} leads · ${batchStats.withEmail} com e-mail · ${batchStats.withoutEmail} sem e-mail · ${batchStats.eligible} elegíveis (mailbox desc. ok).`}
              actionLabel={campaignActionLabel}
              onAction={handleCreateCampaignWithEligible}
              actionDisabled={eligibleLeads.length === 0}
              extraStats={[
                {
                  label: "Pend. validação",
                  value: batchStats.pendingValidation,
                },
                {
                  label: "Deste lote",
                  value: batchLeadCount || activeBatch.foundCount,
                },
              ]}
            />
          ) : (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-sm font-medium text-amber-100">
                Carregando lote da URL…
              </p>
              <p className="mt-1 text-xs text-muted-foreground font-mono">
                batchId: {urlBatchId}
              </p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-background/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Setor do lote
              </p>
              <p className="mt-1 truncate text-lg font-semibold">
                {activeBatch?.sector ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Localização
              </p>
              <p className="mt-1 flex items-center gap-1.5 truncate text-lg font-semibold">
                <MapPin className="size-4 shrink-0 text-muted-foreground" />
                {activeBatch?.location ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Leads deste lote
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {batchLeadCount}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Fila geral oculta · só IDs do batch
              </p>
            </div>
          </div>
        </>
      )}

      {!isBatchMode && activeBatch && (
        <BatchHandoffPanel
          batch={activeBatch}
          stats={batchStats}
          title="Lote aberto no Agente 2"
          description="Somente leads deste lote. Elegíveis = e-mail com sintaxe/MX ok (mailbox pode ser desconhecida)."
          actionLabel={campaignActionLabel}
          onAction={handleCreateCampaignWithEligible}
          actionDisabled={eligibleLeads.length === 0}
          extraStats={[
            { label: "Pend. validação", value: batchStats.pendingValidation },
          ]}
        />
      )}

      <CollapsibleCard storageKey="agent-2-control">
        <CollapsibleCardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="flex items-center gap-2 text-xl">
                <ShieldCheck className="size-5 text-primary" />
                {isBatchMode
                  ? "Validação deste lote"
                  : "Controle da validação"}
              </CardTitle>
              <Badge
                variant={
                  status === "completed"
                    ? "success"
                    : status === "error"
                      ? "danger"
                      : status === "running"
                        ? "default"
                        : status === "paused"
                          ? "warning"
                          : "secondary"
                }
              >
                {AGENT_STATUS_LABELS[status]}
              </Badge>
            </div>
            <CardDescription>
              {isBatchMode
                ? `${leadsWithEmail} de ${batchLeadCount || leads.length} lead(s) do lote possuem e-mail. Fila geral oculta.`
                : `${leadsWithEmail} de ${leads.length} lead(s) salvos possuem e-mail.`}{" "}
              A validação é sequencial.
            </CardDescription>
          </div>
          {controlButtons}
        </CollapsibleCardHeader>
        <CollapsibleCardContent className="space-y-4">
          {!isBatchMode && (
            <div className="rounded-lg border border-border bg-background/30 p-4">
              <div className="grid gap-3 md:grid-cols-[minmax(180px,240px)_auto_auto] md:items-end">
                <div className="space-y-1.5">
                  <label
                    className="text-sm font-medium"
                    htmlFor="agent-two-load-quantity"
                  >
                    Quantidade para carregar
                  </label>
                  <Input
                    id="agent-two-load-quantity"
                    type="number"
                    min={1}
                    max={Math.max(1, eligibleCount)}
                    step={1}
                    value={loadQuantity}
                    disabled={isActive || eligibleCount === 0}
                    onChange={(event) => {
                      setLoadQuantity(event.target.value);
                      setLoadError(null);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {eligibleCount.toLocaleString("pt-BR")} e-mail(s) único(s)
                    realmente validável(is).
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleLoadSample}
                  disabled={isActive || eligibleCount === 0}
                >
                  <ListRestart className="size-4" />
                  Carregar amostra
                </Button>
                <Button
                  variant="outline"
                  onClick={handleLoadAll}
                  disabled={isActive || eligibleCount === 0}
                >
                  <MailCheck className="size-4" />
                  Carregar todos
                </Button>
              </div>
              {loadError && (
                <p role="alert" className="mt-3 text-sm text-red-400">
                  {loadError}
                </p>
              )}
            </div>
          )}

          {isBatchMode ? (
            batchSummaryCards
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <SummaryCard label="Total na fila" value={stats.total} />
              <SummaryCard label="Pendentes" value={stats.pending} />
              <SummaryCard label="Validados" value={stats.valid} />
              <SummaryCard label="Inválidos" value={stats.invalid} />
              <SummaryCard label="Duplicados" value={stats.duplicate} />
              <SummaryCard label="Arriscados" value={stats.risky} />
              <SummaryCard label="Desconhecidos" value={stats.unknown} />
              <SummaryCard label="Sem e-mail" value={stats.noEmail} />
              <SummaryCard
                label="Item atual"
                value={currentItem?.company ?? "Nenhum"}
              />
            </div>
          )}

          {agentError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-400"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {agentError}
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MailCheck className="size-4" />
            Sintaxe e MX aprovados permanecem desconhecidos até uma futura
            confirmação externa da caixa postal.
          </div>
        </CollapsibleCardContent>
      </CollapsibleCard>

      <CollapsibleCard storageKey="agent-2-queue">
        <CollapsibleCardHeader>
          <CardTitle>
            {isBatchMode ? "Fila de e-mails deste lote" : "Fila de e-mails"}
          </CardTitle>
          <CardDescription>
            {isBatchMode
              ? "Somente e-mails dos leadIds deste batch. A fila geral de 200 fica oculta."
              : "A fila só é montada por uma ação acima. Cada resultado é salvo no lead imediatamente."}
          </CardDescription>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          {queue.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center">
              <MailCheck className="mx-auto mb-3 size-8 text-muted-foreground" />
              <p className="font-medium">A fila está vazia.</p>
              <p className="text-sm text-muted-foreground">
                {isBatchMode
                  ? "Nenhum e-mail elegível neste lote ainda."
                  : "Carregue os leads pendentes para iniciar."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Empresa</th>
                    <th className="px-4 py-3 font-medium">E-mail</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Motivo</th>
                    <th className="px-4 py-3 font-medium">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {queue.map((item) => (
                    <QueueRow
                      key={item.id}
                      item={item}
                      retryDisabled={isActive}
                      onRetry={handleRetry}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleCardContent>
      </CollapsibleCard>

      {isBatchMode && activeBatch && (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleCreateCampaignWithEligible}
            disabled={eligibleLeads.length === 0}
          >
            {campaignActionLabel}
          </Button>
          {batchStats.withoutEmail > 0 && (
            <Button variant="outline" onClick={handleBackToAgentOne}>
              <Pickaxe className="size-4" />
              Voltar ao Agente 1 ({batchStats.withoutEmail} sem e-mail)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function QueueRow({
  item,
  retryDisabled,
  onRetry,
}: {
  item: AgentTwoQueueItem;
  retryDisabled: boolean;
  onRetry: (item: AgentTwoQueueItem) => void;
}) {
  return (
    <tr className="bg-background/20 align-top">
      <td className="px-4 py-3 font-medium">{item.company}</td>
      <td className="px-4 py-3 text-muted-foreground">{item.email || "—"}</td>
      <td className="px-4 py-3"><ValidationBadge status={item.status} /></td>
      <td className="px-4 py-3">
        <div className="space-y-2">
          <span
            className={
              item.errorMessage ? "text-red-400" : "text-muted-foreground"
            }
          >
            {item.errorMessage ?? item.reason}
          </span>
          {item.errorMessage && item.reason === "validation_error" && (
            <Button
              size="sm"
              variant="outline"
              disabled={retryDisabled}
              onClick={() => onRetry(item)}
            >
              <RotateCcw className="size-3.5" />
              Tentar novamente
            </Button>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{formatValidationDate(item.completedAt)}</td>
    </tr>
  );
}
