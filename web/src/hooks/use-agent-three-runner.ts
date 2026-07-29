"use client";

import { useRef, useState } from "react";
import {
  checkAgentThreeSmtpAvailability,
  requestAgentThreeSmtpSend,
} from "@/lib/agent-three-api";
import {
  AGENT_THREE_DNS_INCOMPLETE_MESSAGE,
  AGENT_THREE_LEAD_READY_MESSAGE,
  AGENT_THREE_VALIDATING_MESSAGE,
  validateAgentThreeCampaignLeads,
} from "@/lib/agent-three-auto-validation";
import { localEmailValidationProvider } from "@/lib/client-email-validation";
import {
  AGENT_THREE_TRACKING_ERROR_MESSAGE,
  buildAgentThreeSendRequest,
} from "@/lib/agent-three-send-request";
import {
  AGENT_THREE_SMTP_MESSAGES,
  type AgentThreeSmtpStatus,
} from "@/lib/agent-three-smtp-contract";
import { waitForAgentThreeInterval } from "@/lib/agent-three-execution";
import {
  NO_ELIGIBLE_LEADS_MESSAGE,
} from "@/lib/agent-three-queue";
import { useAgentThreeStore } from "@/store/agent-three-store";
import { useCampaignStore } from "@/store/campaign-store";
import { useLeadStore } from "@/store/lead-store";
import type { Campaign, CampaignLeadStatus } from "@/types/campaign";
import type { CampaignProfileId } from "@/types/campaign-profile";
import type { Lead } from "@/types/lead";

export type AgentThreeUiConnectionStatus =
  | AgentThreeSmtpStatus
  | "validating"
  | "lead_ready"
  | "dns_incomplete"
  | "request_error"
  | "paused"
  | null;

interface AgentThreeRunnerResult {
  started: boolean;
  message: string | null;
}

interface AgentThreeCampaignPreparation {
  campaign: Campaign | null;
  eligibleCount: number;
  dnsErrorCount: number;
  message: string | null;
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Interrompido", "AbortError"));
      return;
    }
    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Interrompido", "AbortError"));
      },
      { once: true }
    );
  });
}

function findLead(leadId: string): Lead | null {
  const state = useLeadStore.getState();
  const direct = [
    ...state.currentLeads,
    ...state.savedLeads,
    ...state.importedLeads,
  ].find((lead) => lead.id === leadId);
  if (direct) return direct;
  for (const record of state.fullSearchHistory) {
    const lead = record.leads?.find((candidate) => candidate.id === leadId);
    if (lead) return lead;
  }
  return null;
}

async function prepareSelectedCampaign(
  profileId: CampaignProfileId
): Promise<AgentThreeCampaignPreparation> {
  const agentStore = useAgentThreeStore.getState();
  const operation = agentStore.operations[profileId];
  if (!operation.currentCampaignId) {
    return {
      campaign: null,
      eligibleCount: 0,
      dnsErrorCount: 0,
      message: "Selecione uma campanha antes de iniciar.",
    };
  }
  const campaign =
    useCampaignStore
      .getState()
      .campaigns.find(
        (candidate) =>
          candidate.id === operation.currentCampaignId &&
          candidate.campaignProfileId === profileId
      ) ?? null;
  if (!campaign) {
    return {
      campaign: null,
      eligibleCount: 0,
      dnsErrorCount: 0,
      message: "Campanha selecionada não foi encontrada.",
    };
  }
  const deliveredLeadIds = new Set(
    campaign.leadStatuses
      .filter((status) =>
        ["sent", "opened", "clicked", "replied"].includes(status.status)
      )
      .map((status) => status.leadId)
  );
  const leads = campaign.leadIds
    .filter((leadId) => !deliveredLeadIds.has(leadId))
    .map(findLead)
    .filter((lead): lead is Lead => lead !== null);
  if (leads.length > 0) {
    agentStore.loadLeads(profileId, campaign.id, leads, leads.length);
  }
  const suppressedLeadIds = new Set(
    useAgentThreeStore
      .getState()
      .operations[profileId].queue.filter(
        (item) =>
          item.campaignId === campaign.id &&
          item.exclusionReason === "suppressed"
      )
      .map((item) => item.leadId)
  );
  const validation = await validateAgentThreeCampaignLeads(
    leads,
    (email) => localEmailValidationProvider.validate(email),
    {
      shouldSkip: (lead) => suppressedLeadIds.has(lead.id),
    }
  );
  const leadStore = useLeadStore.getState();
  for (const update of validation.updates) {
    leadStore.updateLeadEmailValidation(
      update.leadId,
      update.validation
    );
  }
  const preparation = useAgentThreeStore
    .getState()
    .prepareCampaign(profileId, campaign.id, validation.leads);
  return {
    campaign,
    eligibleCount: preparation.eligibleCount,
    dnsErrorCount: validation.dnsErrorCount,
    message:
      preparation.eligibleCount > 0
        ? null
        : validation.dnsErrorCount > 0
          ? AGENT_THREE_DNS_INCOMPLETE_MESSAGE
          : NO_ELIGIBLE_LEADS_MESSAGE,
  };
}

function patchCampaignDelivery(
  campaign: Campaign,
  leadId: string,
  status: "sent" | "failed",
  occurredAt: string,
  messageId?: string,
  errorMessage?: string
): Partial<Campaign> {
  const existing =
    campaign.leadStatuses.find((item) => item.leadId === leadId) ??
    ({ leadId, status: "pending" } satisfies CampaignLeadStatus);
  const nextStatus: CampaignLeadStatus =
    status === "sent"
      ? {
          ...existing,
          status: "sent",
          sentAt: occurredAt,
          providerMessageId: messageId,
          errorMessage: undefined,
          errorCode: undefined,
        }
      : existing.status === "sent" ||
          existing.status === "opened" ||
          existing.status === "clicked" ||
          existing.status === "replied"
        ? existing
        : {
            ...existing,
            status: "failed",
            errorMessage,
            errorCode: "AGENT3_SMTP",
          };
  const leadStatuses = campaign.leadStatuses.some(
    (item) => item.leadId === leadId
  )
    ? campaign.leadStatuses.map((item) =>
        item.leadId === leadId ? nextStatus : item
      )
    : [...campaign.leadStatuses, nextStatus];
  return {
    leadStatuses,
    sentCount: leadStatuses.filter((item) =>
      ["sent", "opened", "clicked", "replied"].includes(item.status)
    ).length,
    failedCount: leadStatuses.filter((item) => item.status === "failed").length,
  };
}

export function connectionStatusMessage(
  status: AgentThreeUiConnectionStatus
): string | null {
  if (status === "validating") return AGENT_THREE_VALIDATING_MESSAGE;
  if (status === "lead_ready") return AGENT_THREE_LEAD_READY_MESSAGE;
  if (status === "dns_incomplete") {
    return AGENT_THREE_DNS_INCOMPLETE_MESSAGE;
  }
  if (status === "request_error") {
    return AGENT_THREE_TRACKING_ERROR_MESSAGE;
  }
  if (status === "paused") return "Envio pausado.";
  if (status === "sent" || status === "connected") return "Conectado.";
  if (status === "real_send_disabled") return "Envio real desativado.";
  if (status === "configuration_error") {
    return "Configuração de envio incompleta.";
  }
  if (status === "authentication_error") return "Erro de autenticação.";
  if (
    status === "provider_rate_limit" ||
    status === "provider_account_blocked"
  ) {
    return "Conta limitada.";
  }
  return null;
}

export function useAgentThreeRunner() {
  const controllers = useRef(
    new Map<CampaignProfileId, AbortController>()
  );
  const activeLoops = useRef(new Set<CampaignProfileId>());
  const [statuses, setStatuses] = useState<
    Record<CampaignProfileId, AgentThreeUiConnectionStatus>
  >({
    "panek-puglesi": null,
    modeclean: null,
  });

  function setStatus(
    profileId: CampaignProfileId,
    status: AgentThreeUiConnectionStatus
  ) {
    setStatuses((current) => ({ ...current, [profileId]: status }));
  }

  async function run(profileId: CampaignProfileId): Promise<void> {
    if (activeLoops.current.has(profileId)) return;
    activeLoops.current.add(profileId);
    try {
      while (true) {
        const store = useAgentThreeStore.getState();
        const operation = store.operations[profileId];
        if (operation.status !== "running") break;

        const item = store.claimNext(profileId);
        if (!item) {
          store.finish(profileId);
          break;
        }
        const campaign = useCampaignStore
          .getState()
          .campaigns.find(
            (candidate) =>
              candidate.id === item.campaignId &&
              candidate.campaignProfileId === profileId
          );
        const requestBuild = campaign
          ? buildAgentThreeSendRequest(
              profileId,
              campaign,
              item,
              findLead(item.leadId)
            )
          : {
              request: null,
              errorMessage: AGENT_THREE_SMTP_MESSAGES.invalid_request,
            };
        if (!requestBuild.request) {
          useAgentThreeStore.getState().applyDeliveryResult(
            profileId,
            item.id,
            {
              status: "configuration_error",
              message:
                requestBuild.errorMessage ??
                AGENT_THREE_TRACKING_ERROR_MESSAGE,
            }
          );
          setStatus(profileId, "request_error");
          break;
        }
        const smtpResult = await requestAgentThreeSmtpSend(
          requestBuild.request
        );
        const occurredAt = new Date().toISOString();
        const application = useAgentThreeStore
          .getState()
          .applyDeliveryResult(profileId, item.id, smtpResult);
        setStatus(
          profileId,
          smtpResult.status === "sent" ? "connected" : smtpResult.status
        );

        if (campaign && smtpResult.status === "sent") {
          useCampaignStore.getState().updateCampaign(
            campaign.id,
            patchCampaignDelivery(
              campaign,
              item.leadId,
              "sent",
              occurredAt,
              smtpResult.messageId
            )
          );
        } else if (
          campaign &&
          (smtpResult.status === "transient_error" ||
            smtpResult.status === "permanent_error")
        ) {
          useCampaignStore.getState().updateCampaign(
            campaign.id,
            patchCampaignDelivery(
              campaign,
              item.leadId,
              "failed",
              occurredAt,
              undefined,
              smtpResult.message
            )
          );
        }

        if (application.shouldPause) break;
        const nextOperation =
          useAgentThreeStore.getState().operations[profileId];
        const hasAnotherItem =
          nextOperation.status === "running" &&
          nextOperation.queue.some(
            (candidate) =>
              candidate.campaignId === nextOperation.currentCampaignId &&
              candidate.queueStatus === "ready"
          );
        if (!hasAnotherItem) {
          useAgentThreeStore.getState().finish(profileId);
          break;
        }

        const controller = new AbortController();
        controllers.current.set(profileId, controller);
        const waited = await waitForAgentThreeInterval(
          nextOperation,
          { delay, random: Math.random },
          controller.signal
        );
        controllers.current.delete(profileId);
        if (waited.interrupted) break;
      }
    } finally {
      controllers.current.delete(profileId);
      activeLoops.current.delete(profileId);
    }
  }

  async function start(
    profileId: CampaignProfileId
  ): Promise<AgentThreeRunnerResult> {
    setStatus(profileId, "validating");
    const preparation = await prepareSelectedCampaign(profileId);
    if (preparation.message) {
      setStatus(
        profileId,
        preparation.dnsErrorCount > 0 ? "dns_incomplete" : null
      );
      return { started: false, message: preparation.message };
    }
    setStatus(profileId, "lead_ready");
    const availability = await checkAgentThreeSmtpAvailability(profileId);
    setStatus(profileId, availability.status);
    if (availability.status !== "connected") {
      return { started: false, message: availability.message };
    }
    const result = useAgentThreeStore.getState().start(profileId, true);
    if (result.started) void run(profileId);
    return { started: result.started, message: result.message };
  }

  function pause(profileId: CampaignProfileId) {
    controllers.current.get(profileId)?.abort();
    useAgentThreeStore.getState().pause(profileId);
    setStatus(profileId, "paused");
  }

  async function resume(
    profileId: CampaignProfileId
  ): Promise<AgentThreeRunnerResult> {
    if (activeLoops.current.has(profileId)) {
      return { started: false, message: "Aguarde a pausa ser concluída." };
    }
    const availability = await checkAgentThreeSmtpAvailability(profileId);
    setStatus(profileId, availability.status);
    if (availability.status !== "connected") {
      return { started: false, message: availability.message };
    }
    const result = useAgentThreeStore.getState().resume(profileId, true);
    if (result.started) void run(profileId);
    return { started: result.started, message: result.message };
  }

  function stop(profileId: CampaignProfileId) {
    controllers.current.get(profileId)?.abort();
    useAgentThreeStore.getState().stop(profileId);
    setStatus(profileId, "paused");
  }

  return {
    statuses,
    start,
    pause,
    resume,
    stop,
  };
}
