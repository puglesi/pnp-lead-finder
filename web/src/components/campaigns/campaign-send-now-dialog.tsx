"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Play,
  Stethoscope,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  connectionStatusMessage,
  useAgentThreeRunner,
} from "@/hooks/use-agent-three-runner";
import { useAgentThreeStore } from "@/store/agent-three-store";
import { getAgentThreeMetrics } from "@/lib/agent-three-queue";
import { GlobalDeduplicationPreviewPanel } from "@/components/campaigns/global-deduplication-preview";
import { describeAgentThreeStartBlock } from "@/lib/agent-three-smtp-contract";
import { getCampaignProfileName } from "@/types/campaign-profile";
import type { Campaign } from "@/types/campaign";
import { getOperationSendAccount } from "@/lib/operation-identity";
import { isCampaignFullyDelivered } from "@/lib/campaign-completion";
import { cn } from "@/lib/utils";

/**
 * Modal “Enviar agora” — reuses Agent 3 runner (queue, preflight, dedupe, locks).
 * No second send system and no bypass of SMTP verify / Start confirmation.
 */
export function CampaignSendNowDialog({
  open,
  onOpenChange,
  campaign,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: Campaign;
}) {
  const profileId = campaign.campaignProfileId;
  const selectProfile = useAgentThreeStore((s) => s.selectProfile);
  const selectCampaign = useAgentThreeStore((s) => s.selectCampaign);
  const setRecipientSourceMode = useAgentThreeStore(
    (s) => s.setRecipientSourceMode
  );
  const configureIntervals = useAgentThreeStore((s) => s.configureIntervals);
  const operation = useAgentThreeStore((s) => s.operations[profileId]);
  const runner = useAgentThreeRunner();
  const [previewConfirmed, setPreviewConfirmed] = useState(false);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [confirmStart, setConfirmStart] = useState(false);

  const account = getOperationSendAccount(profileId);
  const metrics = getAgentThreeMetrics(operation);
  const preparation = runner.preparations[profileId];
  const connectionStatus = runner.statuses[profileId];
  const smtpResult = runner.smtpResults[profileId];
  const isLoading = runner.loadingCampaign[profileId] === true;
  const readyCount = metrics.ready;
  const fullyDelivered = isCampaignFullyDelivered(campaign);
  const smtpReady = connectionStatus === "connected";

  const sessionKey = open ? `${campaign.id}:${profileId}` : "closed";
  const [bootKey, setBootKey] = useState(sessionKey);
  if (open && bootKey !== sessionKey) {
    setBootKey(sessionKey);
    setPreviewConfirmed(false);
    setConfirmStart(false);
  }

  useEffect(() => {
    if (!open) return;
    setRecipientSourceMode("campaign");
    selectProfile(profileId);
    selectCampaign(profileId, campaign.id);
    void runner.loadCampaign(profileId, campaign.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, campaign.id, profileId]);

  if (!open) return null;

  const blockReason = (() => {
    if (fullyDelivered) {
      return describeAgentThreeStartBlock({ campaignCompleted: true });
    }
    if (!previewConfirmed) {
      return describeAgentThreeStartBlock({ previewRequired: true });
    }
    if (readyCount === 0 && !isLoading) {
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
    return null;
  })();

  async function handleVerify() {
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

  async function handleStart() {
    if (!confirmStart) {
      toast.error("Confirme o envio antes do Start.");
      return;
    }
    if (blockReason) {
      toast.error(blockReason);
      return;
    }
    const result = await runner.start(profileId);
    if (result.message) toast.error(result.message);
    else {
      toast.success("Envio iniciado pelo Agente 3.");
      onOpenChange(false);
    }
  }

  const connectionMessage = connectionStatusMessage(
    connectionStatus,
    smtpResult?.message
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-now-title"
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="send-now-title" className="text-lg font-semibold">
              Enviar agora — {campaign.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              Usa a fila, preflight SMTP, dedupe e blocklist do Agente 3. Sem
              bypass.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <p>
              <span className="text-muted-foreground">Operação: </span>
              <strong>{getCampaignProfileName(profileId)}</strong>
            </p>
            <p className="mt-1">
              <span className="text-muted-foreground">Enviando pela conta: </span>
              <strong>{account.accountLabel}</strong>
            </p>
            <p className="mt-1">
              <span className="text-muted-foreground">Assinatura: </span>
              <strong>{account.signatureLabel}</strong>
            </p>
            <p className="mt-1">
              <span className="text-muted-foreground">Modelo/assunto: </span>
              <strong>{campaign.subject || "—"}</strong>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Elegíveis</p>
              <p className="text-xl font-semibold tabular-nums">{readyCount}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Excluídos</p>
              <p className="text-xl font-semibold tabular-nums">
                {Math.max(
                  0,
                  (preparation?.campaignRecipientCount ??
                    campaign.leadIds.length) - readyCount
                )}
              </p>
            </div>
          </div>

          {preparation?.deduplicationPreview && (
            <div className="space-y-2">
              <GlobalDeduplicationPreviewPanel
                preview={preparation.deduplicationPreview}
              />
              <Button
                type="button"
                size="sm"
                variant={previewConfirmed ? "secondary" : "default"}
                onClick={() => setPreviewConfirmed(true)}
                disabled={preparation.deduplicationPreview.finalSendCount === 0}
              >
                {previewConfirmed ? "Prévia confirmada" : "Confirmar prévia"}
              </Button>
            </div>
          )}

          <div
            className={
              operation.untilQueueEnds
                ? "rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3"
                : "rounded-lg border border-amber-500/40 bg-amber-500/10 p-3"
            }
          >
            <p className="text-sm font-semibold">
              {operation.untilQueueEnds
                ? "Limite desta execução: até acabar a lista"
                : `Limite desta execução: ${operation.numericLimit}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Padrão do Agente 3 é 50 se não alterar. Defina o limite antes de
              confirmar o Start.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Enviar até</Label>
                <Input
                  type="number"
                  min={1}
                  value={operation.numericLimit}
                  disabled={operation.untilQueueEnds}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isInteger(n) || n < 1) return;
                    useAgentThreeStore
                      .getState()
                      .configureLimit(profileId, n, false);
                  }}
                />
              </div>
              <label className="flex items-center gap-2 pt-6 text-sm">
                <input
                  type="checkbox"
                  checked={operation.untilQueueEnds}
                  onChange={(e) =>
                    useAgentThreeStore
                      .getState()
                      .configureLimit(
                        profileId,
                        operation.numericLimit,
                        e.target.checked
                      )
                  }
                />
                Até acabar a lista
              </label>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Intervalo mín. (s)</Label>
              <Input
                type="number"
                min={0}
                value={operation.minIntervalSeconds}
                onChange={(e) =>
                  configureIntervals(
                    profileId,
                    Number(e.target.value) || 0,
                    operation.maxIntervalSeconds
                  )
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Intervalo máx. (s)</Label>
              <Input
                type="number"
                min={0}
                value={operation.maxIntervalSeconds}
                onChange={(e) =>
                  configureIntervals(
                    profileId,
                    operation.minIntervalSeconds,
                    Number(e.target.value) || 0
                  )
                }
              />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">Verificar envio</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={preflightBusy || isLoading}
                onClick={() => void handleVerify()}
              >
                {preflightBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Stethoscope className="size-4" />
                )}
                Verificar envio
              </Button>
            </div>
            {smtpReady ? (
              <p className="flex items-center gap-2 text-emerald-600 dark:text-emerald-300">
                <CheckCircle2 className="size-4" />
                {connectionMessage || "Pronto para envio real"}
              </p>
            ) : (
              <p className="text-muted-foreground">
                {connectionMessage ||
                  "Preflight obrigatório — não envia e-mail nesta etapa."}
              </p>
            )}
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={confirmStart}
              onChange={(e) => setConfirmStart(e.target.checked)}
            />
            <span>
              Confirmo o envio pela conta <strong>{account.accountLabel}</strong>{" "}
              com assinatura <strong>{account.signatureLabel}</strong>. O Start
              usa a fila do Agente 3 (sem bypass de preflight/dedupe).
            </span>
          </label>

          {blockReason && (
            <p className="text-sm text-amber-700 dark:text-amber-200">
              {blockReason}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                Boolean(blockReason) ||
                !confirmStart ||
                isLoading ||
                operation.status === "running"
              }
              className={cn("bg-emerald-600 hover:bg-emerald-500")}
              onClick={() => void handleStart()}
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Confirmar envio (Start)
            </Button>
          </div>
          {operation.status === "running" && (
            <Badge variant="default">Envio em andamento no Agente 3</Badge>
          )}
        </div>
      </div>
    </div>
  );
}
