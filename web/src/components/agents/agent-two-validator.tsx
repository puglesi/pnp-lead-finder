"use client";

import { useSyncExternalStore } from "react";
import {
  AlertCircle,
  ListRestart,
  MailCheck,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
} from "lucide-react";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAgentTwoStats, type AgentTwoQueueItem } from "@/lib/agent-two-queue";
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
  const start = useAgentTwoStore((state) => state.start);
  const pause = useAgentTwoStore((state) => state.pause);
  const resume = useAgentTwoStore((state) => state.resume);
  const stop = useAgentTwoStore((state) => state.stop);
  const { runQueue, isExecutionActive } = useAgentTwoRunner();

  const status = hydrated ? persistedStatus : "idle";
  const queue = hydrated ? persistedQueue : [];
  const currentItemId = hydrated ? persistedCurrentItemId : null;
  const agentError = hydrated ? persistedError : null;
  const leads = hydrated ? savedLeads : [];
  const stats = getAgentTwoStats(queue);
  const leadsWithEmail = leads.filter((lead) => Boolean(lead.email?.trim())).length;
  const currentItem =
    queue.find((item) => item.id === currentItemId) ??
    queue.find((item) => item.status === "validating") ??
    null;
  const isActive = status === "running" || status === "paused";
  const hasPending = queue.some((item) => item.status === "pending");

  function handleLoad(revalidate: boolean) {
    if (isActive) return;
    const nextQueue = loadQueue(leads, revalidate);
    persistImmediateAgentTwoResults();
    toast.success(
      nextQueue.length === 0
        ? "Nenhum lead pendente para validar."
        : nextQueue.length + " lead(s) carregado(s) na fila."
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
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
            <Button variant="outline" onClick={() => handleLoad(false)} disabled={isActive}>
              <ListRestart className="size-4" />
              Carregar pendentes
            </Button>
            <Button variant="outline" onClick={() => handleLoad(true)} disabled={isActive || leads.length === 0}>
              <RotateCcw className="size-4" />
              Revalidar todos
            </Button>
            <Button onClick={handleStart} disabled={!hasPending || isActive}>
              <Play className="size-4" />
              Start
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
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fila de e-mails</CardTitle>
          <CardDescription>
            A fila só é montada por uma ação acima. Cada resultado é salvo no lead imediatamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                    <QueueRow key={item.id} item={item} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QueueRow({ item }: { item: AgentTwoQueueItem }) {
  return (
    <tr className="bg-background/20 align-top">
      <td className="px-4 py-3 font-medium">{item.company}</td>
      <td className="px-4 py-3 text-muted-foreground">{item.email || "—"}</td>
      <td className="px-4 py-3"><ValidationBadge status={item.status} /></td>
      <td className="px-4 py-3">
        <span className={item.errorMessage ? "text-red-400" : "text-muted-foreground"}>
          {item.errorMessage ?? item.reason}
        </span>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{formatValidationDate(item.completedAt)}</td>
    </tr>
  );
}
