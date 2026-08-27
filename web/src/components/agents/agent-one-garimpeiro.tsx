"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  MapPin,
  Loader2,
  MailSearch,
  Pause,
  Pencil,
  Pickaxe,
  Play,
  Plus,
  RotateCcw,
  Square,
  Target,
  Trash2,
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
import { Input } from "@/components/ui/input";
import { BatchHandoffPanel } from "@/components/pipeline/batch-handoff-panel";
import { useAgentOneRunner } from "@/hooks/use-agent-one-runner";
import {
  requestAgentOneEmailEnrichment,
  selectAgentOneEmailEnrichmentCandidates,
  type AgentOneEnrichmentProgress,
} from "@/lib/agent-one-enrichment";
import {
  getAgentOneFoundLeadTotal,
  type AgentOneSectorItem,
  type AgentOneSectorStatus,
  type AgentOneStatus,
} from "@/lib/agent-one-queue";
import {
  filterLeadsByMemberIds,
  getBatchLeadStats,
  getBatchValidationCandidates,
  hasEmail,
} from "@/lib/lead-batch";
import { useAgentOneStore } from "@/store/agent-one-store";
import { useBatchPipelineStore } from "@/store/batch-pipeline-store";
import { useLeadStore } from "@/store/lead-store";
import { DEFAULT_GEO_SEARCH_LOCATION } from "@/lib/geo/regions";

const AGENT_STATUS_LABELS: Record<AgentOneStatus, string> = {
  idle: "Inativo",
  running: "Em execução",
  paused: "Pausado",
  stopped: "Parado",
  completed: "Concluído",
  error: "Erro",
};

const SECTOR_STATUS_LABELS: Record<AgentOneSectorStatus, string> = {
  pending: "Pendente",
  running: "Em execução",
  paused: "Pausado",
  completed: "Concluído",
  error: "Erro",
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erro inesperado";
}

function AgentStatusBadge({ status }: { status: AgentOneStatus }) {
  const variant =
    status === "completed"
      ? "success"
      : status === "error"
        ? "danger"
        : status === "running"
          ? "default"
          : status === "paused"
            ? "warning"
            : "secondary";

  return <Badge variant={variant}>{AGENT_STATUS_LABELS[status]}</Badge>;
}

function SectorStatusBadge({ status }: { status: AgentOneSectorStatus }) {
  const variant =
    status === "completed"
      ? "success"
      : status === "error"
        ? "danger"
        : status === "running"
          ? "default"
          : status === "paused"
            ? "warning"
            : "secondary";

  return <Badge variant={variant}>{SECTOR_STATUS_LABELS[status]}</Badge>;
}

function SectorProgress({ item }: { item: AgentOneSectorItem }) {
  const percentage = Math.min(
    100,
    Math.round((item.foundLeadCount / item.targetLeadCount) * 100)
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Progresso real da busca</span>
        <span>
          {item.foundLeadCount} / {item.targetLeadCount}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: percentage + "%" }}
        />
      </div>
    </div>
  );
}

export function AgentOneGarimpeiro() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlBatchId = searchParams.get("batchId");
  /** URL batchId wins: exclusive lote mode hides the general sector queue. */
  const isBatchMode = Boolean(urlBatchId);

  const status = useAgentOneStore((state) => state.status);
  const queue = useAgentOneStore((state) => state.queue);
  const currentSectorId = useAgentOneStore(
    (state) => state.currentSectorId
  );
  const agentError = useAgentOneStore((state) => state.errorMessage);
  const addSector = useAgentOneStore((state) => state.addSector);
  const updateSector = useAgentOneStore((state) => state.updateSector);
  const removeSector = useAgentOneStore((state) => state.removeSector);
  const start = useAgentOneStore((state) => state.start);
  const pause = useAgentOneStore((state) => state.pause);
  const resume = useAgentOneStore((state) => state.resume);
  const stop = useAgentOneStore((state) => state.stop);
  const searchIsActive = useLeadStore((state) => state.isSearching);
  const savedLeads = useLeadStore((state) => state.savedLeads);
  const currentLeads = useLeadStore((state) => state.currentLeads);
  const applyContactUpdates = useLeadStore(
    (state) => state.applyAgentOneContactUpdates
  );
  const repairBatchMembershipFromSnapshot = useLeadStore(
    (state) => state.repairBatchMembershipFromSnapshot
  );
  const activeBatchId = useBatchPipelineStore((state) => state.activeBatchId);
  const batches = useBatchPipelineStore((state) => state.batches);
  const setActiveBatch = useBatchPipelineStore((state) => state.setActiveBatch);
  const updateBatchStage = useBatchPipelineStore(
    (state) => state.updateBatchStage
  );
  const { runQueue, isExecutionActive } = useAgentOneRunner();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [sector, setSector] = useState("");
  const [location, setLocation] = useState("");
  const [targetLeadCount, setTargetLeadCount] = useState("25");
  const [formError, setFormError] = useState<string | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] =
    useState<AgentOneEnrichmentProgress | null>(null);

  const selectedBatchId = urlBatchId ?? activeBatchId;
  const activeBatch =
    selectedBatchId && batches[selectedBatchId]
      ? batches[selectedBatchId]
      : null;

  // Activate + repair membership from SearchRecord snapshot on open.
  const urlBatchReady = Boolean(urlBatchId && batches[urlBatchId]);
  const repairedBatchRef = useRef<string | null>(null);
  useEffect(() => {
    if (!urlBatchId) return;
    setActiveBatch(urlBatchId);
    if (!batches[urlBatchId]) return;
    if (repairedBatchRef.current === urlBatchId) return;
    repairedBatchRef.current = urlBatchId;
    repairBatchMembershipFromSnapshot(urlBatchId);
  }, [
    urlBatchId,
    setActiveBatch,
    urlBatchReady,
    batches,
    repairBatchMembershipFromSnapshot,
  ]);

  useEffect(() => {
    if (!urlBatchId || !urlBatchReady) return;
    updateBatchStage(urlBatchId, "garimpo");
  }, [urlBatchId, urlBatchReady, updateBatchStage]);

  const batchMemberIds = useMemo(
    () => activeBatch?.leadIds ?? [],
    [activeBatch]
  );

  const batchLeads = useMemo(() => {
    if (!selectedBatchId) return [];
    // Exclusive membership: batch.leadIds only (never sector/location/batchId expand).
    if (batchMemberIds.length === 0) return [];
    return filterLeadsByMemberIds(
      [...currentLeads, ...savedLeads],
      batchMemberIds
    );
  }, [selectedBatchId, batchMemberIds, currentLeads, savedLeads]);

  const batchStats = useMemo(
    () => getBatchLeadStats(batchLeads),
    [batchLeads]
  );
  const batchWithoutEmail = useMemo(
    () => selectAgentOneEmailEnrichmentCandidates(batchLeads),
    [batchLeads]
  );
  // Exclusive snapshot count from batch.leadIds only.
  const batchLeadCount =
    batchMemberIds.length > 0
      ? batchMemberIds.length
      : activeBatch?.foundCount ?? 0;

  const currentSector =
    queue.find((item) => item.id === currentSectorId) ??
    queue.find((item) => item.status === "running") ??
    null;
  const completedCount = queue.filter(
    (item) => item.status === "completed" || item.status === "error"
  ).length;
  const totalFound = getAgentOneFoundLeadTotal(queue);
  const hasIncomplete = queue.some(
    (item) => item.status === "pending" || item.status === "paused"
  );
  const canStart =
    hasIncomplete && status !== "running" && status !== "paused";
  const leadsWithoutEmail = selectAgentOneEmailEnrichmentCandidates(
    isBatchMode || selectedBatchId ? batchLeads : savedLeads
  );

  function clearForm() {
    setEditingId(null);
    setSector("");
    setLocation("");
    setTargetLeadCount("25");
    setFormError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const count = Number(targetLeadCount);
    if (!sector.trim() || !location.trim()) {
      setFormError("Informe o setor e a localização.");
      return;
    }
    if (!Number.isInteger(count) || count < 1) {
      setFormError("A quantidade desejada deve ser um número inteiro maior que zero.");
      return;
    }

    const input = {
      sector: sector.trim(),
      location: location.trim(),
      targetLeadCount: count,
    };

    if (editingId) {
      updateSector(editingId, input);
      toast.success("Setor atualizado na fila.");
    } else {
      addSector(input);
      toast.success("Setor adicionado à fila.");
    }
    clearForm();
  }

  function beginEdit(item: AgentOneSectorItem) {
    setEditingId(item.id);
    setSector(item.sector);
    setLocation(item.location);
    setTargetLeadCount(String(item.targetLeadCount));
    setFormError(null);
  }

  function handleRemove(item: AgentOneSectorItem) {
    removeSector(item.id);
    if (editingId === item.id) clearForm();
    toast.success("Setor removido da fila.");
  }

  function handleStart() {
    if (searchIsActive || isEnriching) {
      toast.error("Aguarde a busca atual terminar antes de iniciar o Agente 1.");
      return;
    }
    if (start()) void runQueue();
  }

  function handlePause() {
    pause();
    toast("O agente pausará antes de iniciar o próximo setor.");
  }

  function handleResume() {
    resume(isExecutionActive());
    void runQueue();
  }

  function handleStop() {
    stop();
    toast("Execução interrompida com os resultados já salvos preservados.");
  }

  async function handleReprocessSavedLeads() {
    if (searchIsActive || status === "running" || status === "paused") {
      toast.error("Pause ou conclua a busca antes de reprocessar os leads.");
      return;
    }
    if (leadsWithoutEmail.length === 0) {
      toast("Não há leads elegíveis sem e-mail neste lote.");
      return;
    }

    setIsEnriching(true);
    setEnrichmentProgress({
      processedCount: 0,
      totalCount: leadsWithoutEmail.length,
      emailFoundCount: 0,
    });

    try {
      const updates = await requestAgentOneEmailEnrichment(
        leadsWithoutEmail,
        {
          onBatch: applyContactUpdates,
          onProgress: setEnrichmentProgress,
        }
      );
      const emailFoundCount = updates.filter((update) => update.email).length;
      toast.success(
        `Reprocessamento concluído: ${emailFoundCount} e-mail(s) encontrado(s) em ${leadsWithoutEmail.length} website(s).`
      );
    } catch (error) {
      toast.error("Reprocessamento interrompido: " + getErrorMessage(error));
    } finally {
      setIsEnriching(false);
    }
  }

  function handleSendToAgentTwo() {
    const batchId = selectedBatchId ?? activeBatch?.batchId;
    if (!batchId) {
      toast.error("Nenhum lote ativo. Conclua uma busca primeiro.");
      return;
    }
    // Repair from SearchRecord snapshot before handoff (detach contaminants).
    // Do NOT saveLead() — that creates new ids and contaminates counts.
    const repaired = repairBatchMembershipFromSnapshot(batchId);
    const memberIds = repaired?.leadIds ?? batchMemberIds;
    setActiveBatch(batchId);
    updateBatchStage(batchId, "validation");
    const withEmail = batchLeads.filter((lead) => hasEmail(lead)).length;
    toast.success(
      `Lote (${memberIds.length} leads · ${withEmail} com e-mail) aberto no Agente 2.`
    );
    // Always pass batchId in the URL so Agente 2 opens in exclusive lote mode.
    router.push(`/agente-2?batchId=${encodeURIComponent(batchId)}`);
  }

  return (
    <div className="space-y-6">
      {isBatchMode && (
        <>
          {activeBatch ? (
            <BatchHandoffPanel
              batch={activeBatch}
              stats={{
                ...batchStats,
                total: batchLeadCount || batchStats.total || activeBatch.foundCount,
              }}
              title="Lote da busca aberta no Agente 1"
              description={`${activeBatch.sector} · ${activeBatch.location} · ${batchLeadCount || activeBatch.foundCount} leads · ${batchStats.withEmail} com e-mail · ${batchWithoutEmail.length} sem e-mail elegíveis para garimpo.`}
              actionLabel="Enviar este lote para o Agente 2"
              onAction={handleSendToAgentTwo}
              actionDisabled={
                getBatchValidationCandidates(batchLeads).length === 0 &&
                batchLeadCount === 0
              }
              extraStats={[
                { label: "Sem e-mail", value: batchStats.withoutEmail },
                {
                  label: "Deste lote",
                  value: batchLeadCount || activeBatch.foundCount,
                },
              ]}
            />
          ) : (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-sm font-medium text-amber-100">
                Lote não encontrado no pipeline
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                batchId:{" "}
                <span className="font-mono text-foreground/80">{urlBatchId}</span>
                . A fila geral permanece oculta enquanto este lote estiver
                selecionado na URL. Execute a busca novamente se o lote sumiu.
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
                {batchLeadCount || activeBatch?.foundCount || 0}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Fila geral de setores oculta neste modo
              </p>
            </div>
          </div>

          <CollapsibleCard storageKey="agent-1-email-enrichment-batch">
            <CollapsibleCardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2">
                  <MailSearch className="size-5 text-primary" />
                  Enriquecimento de e-mails deste lote
                </CardTitle>
                <CardDescription>
                  Processa apenas leads do lote selecionado. Não mistura outros
                  lotes nem a fila geral de setores.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleReprocessSavedLeads()}
                disabled={
                  isEnriching ||
                  searchIsActive ||
                  status === "running" ||
                  status === "paused" ||
                  leadsWithoutEmail.length === 0
                }
              >
                {isEnriching ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <MailSearch className="size-4" />
                )}
                {isEnriching
                  ? `Processando ${enrichmentProgress?.processedCount ?? 0}/${enrichmentProgress?.totalCount ?? leadsWithoutEmail.length}`
                  : `Reprocessar ${leadsWithoutEmail.length} sem e-mail`}
              </Button>
            </CollapsibleCardHeader>
            {enrichmentProgress && (
              <CollapsibleCardContent>
                <p className="text-sm text-muted-foreground">
                  {enrichmentProgress.processedCount} de{" "}
                  {enrichmentProgress.totalCount}
                  {" website(s) verificado(s) · "}
                  {enrichmentProgress.emailFoundCount} e-mail(s) encontrado(s)
                </p>
              </CollapsibleCardContent>
            )}
          </CollapsibleCard>

          {activeBatch && (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleSendToAgentTwo}
                disabled={
                  getBatchValidationCandidates(batchLeads).length === 0 &&
                  batchLeadCount === 0
                }
              >
                Enviar este lote para o Agente 2
              </Button>
            </div>
          )}
        </>
      )}

      {!isBatchMode && (
        <>
          {activeBatch && (
            <BatchHandoffPanel
              batch={activeBatch}
              stats={batchStats}
              title="Lote da busca aberta no Agente 1"
              description={`${batchStats.withEmail} com e-mail · ${batchWithoutEmail.length} sem e-mail elegíveis para garimpo.`}
              actionLabel="Enviar este lote para o Agente 2"
              onAction={handleSendToAgentTwo}
              actionDisabled={
                getBatchValidationCandidates(batchLeads).length === 0
              }
              extraStats={[
                { label: "Sem e-mail", value: batchStats.withoutEmail },
              ]}
            />
          )}
          <CollapsibleCard storageKey="agent-1-control">
            <CollapsibleCardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Pickaxe className="size-5 text-primary" />
                    Controle da execução
                  </CardTitle>
                  <AgentStatusBadge status={status} />
                </div>
                <CardDescription>
                  Um setor é buscado por vez usando o mecanismo atual do Lead
                  Finder.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleStart}
                  disabled={!canStart || searchIsActive || isEnriching}
                  title={
                    !canStart
                      ? "Adicione um setor pendente"
                      : searchIsActive || isEnriching
                        ? "Aguarde o processamento atual"
                        : undefined
                  }
                >
                  {status === "running" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  {status === "running" ? "Processando…" : "Start"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handlePause}
                  disabled={status !== "running"}
                  title={
                    status !== "running"
                      ? "Disponível durante a execução"
                      : undefined
                  }
                >
                  <Pause className="size-4" />
                  Pause
                </Button>
                <Button
                  variant="outline"
                  onClick={handleResume}
                  disabled={status !== "paused"}
                  title={
                    status !== "paused"
                      ? "Disponível quando estiver pausado"
                      : undefined
                  }
                >
                  <RotateCcw className="size-4" />
                  Resume
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleStop}
                  disabled={status !== "running" && status !== "paused"}
                  title={
                    status !== "running" && status !== "paused"
                      ? "Nenhuma execução ativa"
                      : undefined
                  }
                >
                  <Square className="size-4" />
                  Stop
                </Button>
              </div>
            </CollapsibleCardHeader>
            <CollapsibleCardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-background/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Fila processada
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {completedCount} / {queue.length}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Leads encontrados
                  </p>
                  <p className="mt-1 text-2xl font-semibold">{totalFound}</p>
                </div>
                <div className="rounded-lg border border-border bg-background/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Setor atual
                  </p>
                  <p className="mt-1 truncate text-base font-semibold">
                    {currentSector?.sector ?? "Nenhum"}
                  </p>
                  {currentSector && (
                    <p className="truncate text-xs text-muted-foreground">
                      {currentSector.location}
                    </p>
                  )}
                </div>
              </div>
              {agentError && (
                <p
                  role="alert"
                  className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-400"
                >
                  {agentError}
                </p>
              )}
            </CollapsibleCardContent>
          </CollapsibleCard>

          <CollapsibleCard storageKey="agent-1-email-enrichment">
            <CollapsibleCardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2">
                  <MailSearch className="size-5 text-primary" />
                  Enriquecimento de e-mails
                </CardTitle>
                <CardDescription>
                  Visita os websites dos leads já salvos no servidor. Esta ação
                  não repete a busca nem consome chamadas do SerpAPI.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleReprocessSavedLeads()}
                disabled={
                  isEnriching ||
                  searchIsActive ||
                  status === "running" ||
                  status === "paused" ||
                  leadsWithoutEmail.length === 0
                }
              >
                {isEnriching ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <MailSearch className="size-4" />
                )}
                {isEnriching
                  ? `Processando ${enrichmentProgress?.processedCount ?? 0}/${enrichmentProgress?.totalCount ?? leadsWithoutEmail.length}`
                  : `Reprocessar ${leadsWithoutEmail.length} sem e-mail`}
              </Button>
            </CollapsibleCardHeader>
            {enrichmentProgress && (
              <CollapsibleCardContent>
                <p className="text-sm text-muted-foreground">
                  {enrichmentProgress.processedCount} de{" "}
                  {enrichmentProgress.totalCount}
                  {" website(s) verificado(s) · "}
                  {enrichmentProgress.emailFoundCount} e-mail(s) encontrado(s)
                </p>
              </CollapsibleCardContent>
            )}
          </CollapsibleCard>

          <CollapsibleCard storageKey="agent-1-sector-form">
            <CollapsibleCardHeader>
              <CardTitle>
                {editingId ? "Editar setor" : "Adicionar setor"}
              </CardTitle>
              <CardDescription>
                Defina o setor, a localização e a quantidade desejada de leads.
              </CardDescription>
            </CollapsibleCardHeader>
            <CollapsibleCardContent>
              <form
                className="grid gap-4 md:grid-cols-[1fr_1fr_180px_auto]"
                onSubmit={handleSubmit}
              >
                <div className="space-y-1.5">
                  <label
                    className="text-sm font-medium"
                    htmlFor="agent-one-sector"
                  >
                    Setor
                  </label>
                  <Input
                    id="agent-one-sector"
                    value={sector}
                    onChange={(event) => setSector(event.target.value)}
                    placeholder="Ex.: Contabilidade"
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    className="text-sm font-medium"
                    htmlFor="agent-one-location"
                  >
                    Localização
                  </label>
                  <Input
                    id="agent-one-location"
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder={DEFAULT_GEO_SEARCH_LOCATION}
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    className="text-sm font-medium"
                    htmlFor="agent-one-target"
                  >
                    Quantidade desejada
                  </label>
                  <Input
                    id="agent-one-target"
                    type="number"
                    min={1}
                    step={1}
                    value={targetLeadCount}
                    onChange={(event) => setTargetLeadCount(event.target.value)}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button type="submit" className="flex-1 md:flex-none">
                    {editingId ? (
                      <Pencil className="size-4" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    {editingId ? "Salvar" : "Adicionar"}
                  </Button>
                  {editingId && (
                    <Button type="button" variant="ghost" onClick={clearForm}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </form>
              {formError && (
                <p role="alert" className="mt-3 text-sm text-red-400">
                  {formError}
                </p>
              )}
            </CollapsibleCardContent>
          </CollapsibleCard>

          <CollapsibleCard storageKey="agent-1-queue">
            <CollapsibleCardHeader>
              <CardTitle>Fila de setores</CardTitle>
              <CardDescription>
                A ordem abaixo é a ordem de execução. Apenas itens ainda não
                iniciados podem ser editados ou excluídos.
              </CardDescription>
            </CollapsibleCardHeader>
            <CollapsibleCardContent>
              {queue.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-10 text-center">
                  <Pickaxe className="mx-auto mb-3 size-8 text-muted-foreground" />
                  <p className="font-medium">A fila está vazia.</p>
                  <p className="text-sm text-muted-foreground">
                    Adicione o primeiro setor para preparar o Agente 1.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {queue.map((item, index) => {
                    const editable =
                      item.status === "pending" && item.startedAt === undefined;
                    return (
                      <div
                        key={item.id}
                        className="rounded-lg border border-border bg-background/30 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                #{index + 1}
                              </span>
                              <p className="font-semibold">{item.sector}</p>
                              <SectorStatusBadge status={item.status} />
                            </div>
                            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1.5">
                                <MapPin className="size-3.5" />
                                {item.location}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <Target className="size-3.5" />
                                Meta: {item.targetLeadCount}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              disabled={!editable}
                              onClick={() => beginEdit(item)}
                              title="Editar setor"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              disabled={!editable}
                              onClick={() => handleRemove(item)}
                              title="Excluir setor"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-4">
                          <SectorProgress item={item} />
                        </div>
                        {item.errorMessage && (
                          <p
                            role="alert"
                            className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-400"
                          >
                            {item.errorMessage}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CollapsibleCardContent>
          </CollapsibleCard>
        </>
      )}
    </div>
  );
}
