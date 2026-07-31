"use client";

import { useState, useSyncExternalStore } from "react";
import {
  AlertCircle,
  ListRestart,
  MailCheck,
  Loader2,
  Pause,
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
import {
  getAgentTwoEligibleLeadCount,
  getAgentTwoStats,
  parseAgentTwoLoadQuantity,
  type AgentTwoQueueAppendResult,
  type AgentTwoQueueItem,
} from "@/lib/agent-two-queue";
import {
  persistImmediateAgentTwoResults,
  useAgentTwoRunner,
} from "@/hooks/use-agent-two-runner";
import { useAgentTwoStore } from "@/store/agent-two-store";
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
  const persistedStatus = useAgentTwoStore((state) => state.status);
  const persistedQueue = useAgentTwoStore((state) => state.queue);
  const persistedCurrentItemId = useAgentTwoStore((state) => state.currentItemId);
  const persistedError = useAgentTwoStore((state) => state.errorMessage);
  const savedLeads = useLeadStore((state) => state.savedLeads);
  const loadQueue = useAgentTwoStore((state) => state.loadQueue);
  const appendSample = useAgentTwoStore((state) => state.appendSample);
  const appendAll = useAgentTwoStore((state) => state.appendAll);
  const start = useAgentTwoStore((state) => state.start);
  const pause = useAgentTwoStore((state) => state.pause);
  const resume = useAgentTwoStore((state) => state.resume);
  const stop = useAgentTwoStore((state) => state.stop);
  const retryItem = useAgentTwoStore((state) => state.retryItem);
  const retryDnsErrors = useAgentTwoStore((state) => state.retryDnsErrors);
  const { runQueue, isExecutionActive } = useAgentTwoRunner();
  const [loadQuantity, setLoadQuantity] = useState("10");
  const [loadError, setLoadError] = useState<string | null>(null);

  const status = hydrated ? persistedStatus : "idle";
  const queue = hydrated ? persistedQueue : [];
  const currentItemId = hydrated ? persistedCurrentItemId : null;
  const agentError = hydrated ? persistedError : null;
  const leads = hydrated ? savedLeads : [];
  const stats = getAgentTwoStats(queue);
  const leadsWithEmail = leads.filter((lead) => Boolean(lead.email?.trim())).length;
  const eligibleCount = getAgentTwoEligibleLeadCount(leads, queue);
  const currentItem =
    queue.find((item) => item.id === currentItemId) ??
    queue.find((item) => item.status === "validating") ??
    null;
  const isActive = status === "running" || status === "paused";
  const hasPending = queue.some((item) => item.status === "pending");
  const dnsErrorCount = queue.filter((item) => item.reason === "dns_error").length;

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

  return (
    <div className="space-y-6">
      <CollapsibleCard storageKey="agent-2-control">
        <CollapsibleCardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="flex items-center gap-2 text-xl">
                <ShieldCheck className="size-5 text-primary" />
                Controle da validação
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
              {leadsWithEmail} de {leads.length} lead(s) salvos possuem e-mail. A validação é sequencial.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleRevalidateAll}
              disabled={isActive || leads.length === 0}
            >
              <RotateCcw className="size-4" />
              Revalidar todos
            </Button>
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
              title={!hasPending ? "Carregue e-mails pendentes" : isActive ? "Validação já iniciada" : undefined}
            >
              {status === "running" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              {status === "running" ? "Validando…" : "Start"}
            </Button>
            <Button variant="outline" onClick={handlePause} disabled={status !== "running"}>
              <Pause className="size-4" />
              Pause
            </Button>
            <Button variant="outline" onClick={handleResume} disabled={status !== "paused"}>
              <RotateCcw className="size-4" />
              Resume
            </Button>
            <Button variant="destructive" onClick={handleStop} disabled={!isActive}>
              <Square className="size-4" />
              Stop
            </Button>
          </div>
        </CollapsibleCardHeader>
        <CollapsibleCardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-background/30 p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(180px,240px)_auto_auto] md:items-end">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="agent-two-load-quantity">
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
                  {eligibleCount.toLocaleString("pt-BR")} e-mail(s) único(s) realmente validável(is).
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <SummaryCard label="Total na fila" value={stats.total} />
            <SummaryCard label="Pendentes" value={stats.pending} />
            <SummaryCard label="Validados" value={stats.valid} />
            <SummaryCard label="Inválidos" value={stats.invalid} />
            <SummaryCard label="Duplicados" value={stats.duplicate} />
            <SummaryCard label="Arriscados" value={stats.risky} />
            <SummaryCard label="Desconhecidos" value={stats.unknown} />
            <SummaryCard label="Sem e-mail" value={stats.noEmail} />
            <SummaryCard label="Item atual" value={currentItem?.company ?? "Nenhum"} />
          </div>
          {agentError && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {agentError}
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MailCheck className="size-4" />
            Sintaxe e MX aprovados permanecem desconhecidos até uma futura confirmação externa da caixa postal.
          </div>
        </CollapsibleCardContent>
      </CollapsibleCard>

      <CollapsibleCard storageKey="agent-2-queue">
        <CollapsibleCardHeader>
          <CardTitle>Fila de e-mails</CardTitle>
          <CardDescription>
            A fila só é montada por uma ação acima. Cada resultado é salvo no lead imediatamente.
          </CardDescription>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          {queue.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center">
              <MailCheck className="mx-auto mb-3 size-8 text-muted-foreground" />
              <p className="font-medium">A fila está vazia.</p>
              <p className="text-sm text-muted-foreground">Carregue os leads pendentes para iniciar.</p>
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
