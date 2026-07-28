"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  Clock3,
  ListPlus,
  Pause,
  Play,
  RotateCcw,
  Send,
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
  type AgentThreeQueueStatus,
  type AgentThreeStatus,
} from "@/lib/agent-three-queue";
import { useAgentThreeStore } from "@/store/agent-three-store";
import { useCampaignStore } from "@/store/campaign-store";
import { useLeadStore } from "@/store/lead-store";
import {
  CAMPAIGN_PROFILES,
  getCampaignProfileName,
  type CampaignProfileId,
} from "@/types/campaign-profile";

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

const STATUS_LABELS: Record<AgentThreeStatus, string> = {
  idle: "Inativo",
  running: "Em execução",
  paused: "Pausado",
  stopped: "Parado",
  completed: "Concluído",
  error: "Erro",
};

const QUEUE_STATUS_LABELS: Record<AgentThreeQueueStatus, string> = {
  pending: "Pendente",
  ready: "Preparado",
  sending: "Enviando",
  sent: "Enviado",
  failed: "Falhou",
  blocked: "Bloqueado",
  skipped: "Ignorado",
};

function statusVariant(status: AgentThreeStatus) {
  if (status === "completed") return "success" as const;
  if (status === "running") return "default" as const;
  if (status === "paused") return "warning" as const;
  if (status === "error") return "danger" as const;
  return "secondary" as const;
}

function queueStatusVariant(status: AgentThreeQueueStatus) {
  if (status === "sent") return "success" as const;
  if (status === "failed") return "danger" as const;
  if (status === "blocked") return "warning" as const;
  if (status === "sending" || status === "ready") return "default" as const;
  return "secondary" as const;
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-2xl font-semibold" title={String(value)}>
        {value}
      </p>
    </div>
  );
}

function formatActivity(value: string | null): string {
  return value ? value.replace("T", " ").slice(0, 16) : "Nenhuma";
}

function listText(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "Nenhuma";
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
  const loadLeads = useAgentThreeStore((state) => state.loadLeads);
  const start = useAgentThreeStore((state) => state.start);
  const pause = useAgentThreeStore((state) => state.pause);
  const resume = useAgentThreeStore((state) => state.resume);
  const stop = useAgentThreeStore((state) => state.stop);
  const campaigns = useCampaignStore((state) => state.campaigns);
  const savedLeads = useLeadStore((state) => state.savedLeads);
  const currentLeads = useLeadStore((state) => state.currentLeads);
  const importedLeads = useLeadStore((state) => state.importedLeads);
  const [quantity, setQuantity] = useState("10");
  const [loadError, setLoadError] = useState<string | null>(null);

  const profileId: CampaignProfileId = hydrated
    ? persistedProfileId
    : "panek-puglesi";
  const initialOperation = createInitialAgentThreeSnapshot().operations[profileId];
  const operation = hydrated ? persistedOperations[profileId] : initialOperation;
  const metrics = getAgentThreeMetrics(operation);
  const profileCampaigns = campaigns.filter(
    (campaign) => campaign.campaignProfileId === profileId
  );
  const currentCampaign = profileCampaigns.find(
    (campaign) => campaign.id === operation.currentCampaignId
  );
  const campaignNameById = useMemo(
    () => new Map(campaigns.map((campaign) => [campaign.id, campaign.name])),
    [campaigns]
  );
  const allLeadsById = useMemo(() => {
    const map = new Map(
      [...currentLeads, ...importedLeads, ...savedLeads].map((lead) => [
        lead.id,
        lead,
      ])
    );
    return map;
  }, [currentLeads, importedLeads, savedLeads]);
  const campaignLeads = currentCampaign
    ? currentCampaign.leadIds
        .map((leadId) => allLeadsById.get(leadId))
        .filter((lead) => lead !== undefined)
    : [];
  const currentItem =
    operation.queue.find((item) => item.id === operation.currentItemId) ??
    operation.queue.find((item) => item.queueStatus === "sending") ??
    null;
  const isActive = operation.status === "running" || operation.status === "paused";

  function handleProfileChange(value: string) {
    const nextProfileId = value as CampaignProfileId;
    selectProfile(nextProfileId);
    setLoadError(null);
  }

  function handleCampaignChange(value: string) {
    selectCampaign(profileId, value === "none" ? null : value);
    setLoadError(null);
  }

  function handleLoadLeads() {
    if (!currentCampaign) {
      setLoadError("Selecione uma campanha desta operação.");
      return;
    }
    const parsedQuantity = Number(quantity.trim());
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      setLoadError("Informe uma quantidade inteira maior ou igual a 1.");
      return;
    }
    setLoadError(null);
    const result = loadLeads(
      profileId,
      currentCampaign.id,
      campaignLeads,
      parsedQuantity
    );
    toast.success(
      result.addedCount +
        " adicionado(s), " +
        result.blockedCount +
        " bloqueado(s) e " +
        result.ignoredCount +
        " ignorado(s)."
    );
  }

  function handleStart() {
    const result = start(profileId);
    if (result.message) toast.error(result.message);
  }

  function handleResume() {
    const result = resume(profileId);
    if (result.message) toast.error(result.message);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Send className="size-5 text-primary" />
                Controle do envio
              </CardTitle>
              <Badge variant={statusVariant(operation.status)}>
                {STATUS_LABELS[operation.status]}
              </Badge>
            </div>
            <CardDescription>
              Filas e histórico exclusivos de {getCampaignProfileName(profileId)}.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleStart} disabled={isActive}>
              <Play className="size-4" />
              Start
            </Button>
            <Button
              variant="outline"
              onClick={() => pause(profileId)}
              disabled={operation.status !== "running"}
            >
              <Pause className="size-4" />
              Pause
            </Button>
            <Button
              variant="outline"
              onClick={handleResume}
              disabled={operation.status !== "paused"}
            >
              <RotateCcw className="size-4" />
              Resume
            </Button>
            <Button
              variant="destructive"
              onClick={() => stop(profileId)}
              disabled={!isActive}
            >
              <Square className="size-4" />
              Stop
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 rounded-lg border border-border bg-background/30 p-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="agent-three-profile">Operação</Label>
              <Select value={profileId} onValueChange={handleProfileChange}>
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
              <Label htmlFor="agent-three-campaign">Campanha atualmente selecionada</Label>
              <Select
                value={operation.currentCampaignId ?? "none"}
                onValueChange={handleCampaignChange}
                disabled={isActive}
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
              {profileCampaigns.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Crie uma campanha vinculada a esta operação para carregar leads.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium">Nenhum provedor de envio configurado.</p>
              <p className="mt-1 text-amber-200/80">
                Start está protegido: nenhum item será enviado ou marcado como enviado.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background/30 p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(180px,240px)_auto] md:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="agent-three-load-quantity">Quantidade</Label>
                <Input
                  id="agent-three-load-quantity"
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  disabled={isActive || !currentCampaign}
                  onChange={(event) => {
                    setQuantity(event.target.value);
                    setLoadError(null);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {campaignLeads.length.toLocaleString("pt-BR")} lead(s) disponíveis na campanha.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleLoadLeads}
                disabled={isActive || !currentCampaign || campaignLeads.length === 0}
              >
                <ListPlus className="size-4" />
                Carregar leads
              </Button>
            </div>
            {loadError && (
              <p role="alert" className="mt-3 text-sm text-red-400">
                {loadError}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Total na fila" value={metrics.total} />
            <SummaryCard label="Pendentes" value={metrics.pending} />
            <SummaryCard label="Preparados" value={metrics.ready} />
            <SummaryCard label="Enviados" value={metrics.sent} />
            <SummaryCard label="Falharam" value={metrics.failed} />
            <SummaryCard label="Bloqueados" value={metrics.blocked} />
            <SummaryCard label="Ignorados" value={metrics.skipped} />
            <SummaryCard label="Item atual" value={currentItem?.companyName ?? "Nenhum"} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Relatório em tempo real</CardTitle>
          <CardDescription>
            Calculado diretamente da fila persistente de {getCampaignProfileName(profileId)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SummaryCard
            label="Campanha atual"
            value={currentCampaign?.name ?? "Nenhuma"}
          />
          <SummaryCard label="Setor atual" value={metrics.currentSector ?? "Nenhum"} />
          <SummaryCard label="Última atividade" value={formatActivity(metrics.lastActivityAt)} />
          <div className="rounded-lg border border-border bg-background/40 p-4 md:col-span-1 xl:col-span-3">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Listas concluídas
                </p>
                <p className="mt-2 text-sm">{listText(metrics.completedLists)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Listas pendentes
                </p>
                <p className="mt-2 text-sm">{listText(metrics.pendingLists)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fila persistente</CardTitle>
          <CardDescription>
            `unknown` permanece bloqueado como “Aguardando decisão”; não há liberação automática.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {operation.queue.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center">
              <Clock3 className="mx-auto mb-3 size-8 text-muted-foreground" />
              <p className="font-medium">A fila desta operação está vazia.</p>
              <p className="text-sm text-muted-foreground">
                Selecione uma campanha e use Carregar leads.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Empresa</th>
                    <th className="px-4 py-3 font-medium">E-mail</th>
                    <th className="px-4 py-3 font-medium">Campanha</th>
                    <th className="px-4 py-3 font-medium">Validação</th>
                    <th className="px-4 py-3 font-medium">Fila</th>
                    <th className="px-4 py-3 font-medium">Tentativas</th>
                    <th className="px-4 py-3 font-medium">Atualizado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {operation.queue.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <p className="font-medium">{item.companyName}</p>
                        <p className="text-xs text-muted-foreground">{item.sector || "Sem setor"}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {item.normalizedEmail ?? "Sem e-mail"}
                      </td>
                      <td className="px-4 py-3">
                        {item.campaignId
                          ? campaignNameById.get(item.campaignId) ?? item.campaignId
                          : "Sem campanha"}
                      </td>
                      <td className="px-4 py-3">
                        <p>{item.validationStatus}</p>
                        <p className="max-w-64 truncate text-xs text-muted-foreground" title={item.validationReason}>
                          {item.validationStatus === "unknown"
                            ? "Aguardando decisão"
                            : item.validationReason}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={queueStatusVariant(item.queueStatus)}>
                          {QUEUE_STATUS_LABELS[item.queueStatus]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{item.attemptCount}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatActivity(item.updatedAt)}
                      </td>
                    </tr>
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
