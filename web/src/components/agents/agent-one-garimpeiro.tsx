"use client";

import { FormEvent, useState } from "react";
import {
  MapPin,
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAgentOneRunner } from "@/hooks/use-agent-one-runner";
import {
  getAgentOneFoundLeadTotal,
  type AgentOneSectorItem,
  type AgentOneSectorStatus,
  type AgentOneStatus,
} from "@/lib/agent-one-queue";
import { useAgentOneStore } from "@/store/agent-one-store";
import { useLeadStore } from "@/store/lead-store";

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
  const { runQueue, isExecutionActive } = useAgentOneRunner();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [sector, setSector] = useState("");
  const [location, setLocation] = useState("");
  const [targetLeadCount, setTargetLeadCount] = useState("25");
  const [formError, setFormError] = useState<string | null>(null);

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
    if (searchIsActive) {
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Pickaxe className="size-5 text-primary" />
                Controle da execução
              </CardTitle>
              <AgentStatusBadge status={status} />
            </div>
            <CardDescription>
              Um setor é buscado por vez usando o mecanismo atual do Lead Finder.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleStart} disabled={!canStart || searchIsActive}>
              <Play className="size-4" />
              Start
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
            <Button
              variant="destructive"
              onClick={handleStop}
              disabled={status !== "running" && status !== "paused"}
            >
              <Square className="size-4" />
              Stop
            </Button>
          </div>
        </CardHeader>
        <CardContent>
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
              className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
            >
              {agentError}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Editar setor" : "Adicionar setor"}</CardTitle>
          <CardDescription>
            Defina o setor, a localização e a quantidade desejada de leads.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-[1fr_1fr_180px_auto]" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="agent-one-sector">
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
              <label className="text-sm font-medium" htmlFor="agent-one-location">
                Localização
              </label>
              <Input
                id="agent-one-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Ex.: London"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="agent-one-target">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fila de setores</CardTitle>
          <CardDescription>
            A ordem abaixo é a ordem de execução. Apenas itens ainda não iniciados podem ser editados ou excluídos.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                        className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400"
                      >
                        {item.errorMessage}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
