"use client";

import { useSyncExternalStore } from "react";
import { Pause, Play, RotateCcw, Send, Square } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { useAgentThreeStore } from "@/store/agent-three-store";
import { useCampaignStore } from "@/store/campaign-store";
import {
  CAMPAIGN_PROFILES,
  getCampaignProfileName,
  type CampaignProfileId,
} from "@/types/campaign-profile";

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

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
  const start = useAgentThreeStore((state) => state.start);
  const pause = useAgentThreeStore((state) => state.pause);
  const resume = useAgentThreeStore((state) => state.resume);
  const stop = useAgentThreeStore((state) => state.stop);
  const campaigns = useCampaignStore((state) => state.campaigns);

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
  const isActive =
    operation.status === "running" || operation.status === "paused";

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

  function handleStart() {
    const result = start(profileId);
    if (result.message) toast.error(result.message);
  }

  function handleResume() {
    const result = resume(profileId);
    if (result.message) toast.error(result.message);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Send className="size-5 text-primary" />
          Controle do envio
        </CardTitle>
        <CardDescription>
          Configuração independente de {getCampaignProfileName(profileId)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="agent-three-profile">Operação</Label>
            <Select
              value={profileId}
              onValueChange={(value) =>
                selectProfile(value as CampaignProfileId)
              }
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
              onValueChange={(value) =>
                selectCampaign(profileId, value === "none" ? null : value)
              }
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
              disabled={isActive || operation.untilQueueEnds}
              onChange={(event) =>
                handleNumericLimitChange(event.target.value)
              }
            />
          </div>

          <div className="flex items-center gap-3 pt-8">
            <Checkbox
              id="agent-three-unlimited"
              checked={operation.untilQueueEnds}
              disabled={isActive}
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
              disabled={isActive}
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
              disabled={isActive}
              onChange={(event) =>
                handleMaxIntervalChange(event.target.value)
              }
            />
          </div>
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Enviados" value={metrics.sent} />
          <SummaryCard
            label="Pendentes"
            value={metrics.pending + metrics.ready}
          />
          <SummaryCard label="Falharam" value={metrics.failed} />
          <SummaryCard
            label="Responderam"
            value={currentCampaign?.repliedCount ?? 0}
          />
          <SummaryCard label="Removidos" value={metrics.removed} />
          <SummaryCard
            label="Inválidos removidos"
            value={metrics.invalidRemoved}
          />
          <SummaryCard
            label="Processados nesta execução"
            value={metrics.processedCount}
          />
          <SummaryCard
            label="Última atividade"
            value={formatActivity(metrics.lastActivityAt)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
