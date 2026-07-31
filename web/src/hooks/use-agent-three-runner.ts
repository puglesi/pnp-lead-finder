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
import {
  describeAgentThreeEmptyQueue,
  getAgentThreeLoadableLeadIds,
  isAgentThreeConfirmedDelivery,
  recoverNotConfiguredCampaignLeadStatuses,
} from "@/lib/agent-three-campaign-load";
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
  getAgentThreeMetrics,
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

export interface AgentThreeCampaignPreparation {
  campaign: Campaign | null;
  campaignRecipientCount: number;
  loadableCount: number;
  resolvedLeadCount: number;
  eligibleCount: number;
  preparedCount: number;
  removedCount: number;
  alreadySentCount: number;
  /** Duplicates/skips ignored on load (not confirmed sends). */
  excludedOnLoadCount: number;
  confirmedDeliveryCount: number;
  recoveredNotConfiguredCount: number;
  missingLeadCount: number;
  dnsErrorCount: number;
  message: string | null;
}

const EMPTY_PREPARATION: AgentThreeCampaignPreparation = {
  campaign: null,
  campaignRecipientCount: 0,
  loadableCount: 0,
  resolvedLeadCount: 0,
  eligibleCount: 0,
  preparedCount: 0,
  removedCount: 0,
  alreadySentCount: 0,
  excludedOnLoadCount: 0,
  confirmedDeliveryCount: 0,
  recoveredNotConfiguredCount: 0,
  missingLeadCount: 0,
  dnsErrorCount: 0,
  message: "Selecione uma campanha antes de iniciar.",
};

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
  profileId: CampaignProfileId,
  campaignIdOverride?: string | null
): Promise<AgentThreeCampaignPreparation> {
  const agentStore = useAgentThreeStore.getState();
  const operation = agentStore.operations[profileId];
  const campaignId =
    campaignIdOverride === undefined
      ? operation.currentCampaignId
      : campaignIdOverride;

  if (!campaignId) {
    return { ...EMPTY_PREPARATION };
  }

  if (operation.currentCampaignId !== campaignId) {
    agentStore.selectCampaign(profileId, campaignId);
  }

  let campaign =
    useCampaignStore
      .getState()
      .campaigns.find(
        (candidate) =>
          candidate.id === campaignId &&
          candidate.campaignProfileId === profileId
      ) ?? null;
  if (!campaign) {
    return {
      ...EMPTY_PREPARATION,
      message: "Campanha selecionada não foi encontrada.",
    };
  }

  const recovered = recoverNotConfiguredCampaignLeadStatuses(campaign);
  if (recovered.changed) {
    const campaignIdToRecover = campaign.id;
    useCampaignStore.getState().updateCampaign(campaignIdToRecover, {
      leadStatuses: recovered.leadStatuses,
      failedCount: recovered.failedCount,
      sentCount: recovered.sentCount,
      openedCount: recovered.openedCount,
      clickedCount: recovered.clickedCount,
      repliedCount: recovered.repliedCount,
      sendErrors: recovered.sendErrors,
    });
    campaign =
      useCampaignStore
        .getState()
        .campaigns.find((candidate) => candidate.id === campaignIdToRecover) ??
      {
        ...campaign,
        leadStatuses: recovered.leadStatuses,
        failedCount: recovered.failedCount,
        sentCount: recovered.sentCount,
        openedCount: recovered.openedCount,
        clickedCount: recovered.clickedCount,
        repliedCount: recovered.repliedCount,
        sendErrors: recovered.sendErrors,
      };
  }

  const activeCampaign = campaign;
  const confirmedDeliveryCount = activeCampaign.leadStatuses.filter(
    isAgentThreeConfirmedDelivery
  ).length;
  const loadableLeadIds = getAgentThreeLoadableLeadIds(activeCampaign);
  const resolvedLeads: Lead[] = [];
  let missingLeadCount = 0;
  for (const leadId of loadableLeadIds) {
    const lead = findLead(leadId);
    if (lead) resolvedLeads.push(lead);
    else missingLeadCount += 1;
  }

  let alreadySentCount = 0;
  let excludedOnLoadCount = 0;
  if (resolvedLeads.length > 0) {
    const loadResult = agentStore.loadLeads(
      profileId,
      activeCampaign.id,
      resolvedLeads,
      resolvedLeads.length
    );
    alreadySentCount = loadResult.alreadySentCount;
    excludedOnLoadCount = Math.max(
      0,
      loadResult.ignoredCount - loadResult.alreadySentCount
    );
  }

  const suppressedLeadIds = new Set(
    useAgentThreeStore
      .getState()
      .operations[profileId].queue.filter(
        (item) =>
          item.campaignId === activeCampaign.id &&
          item.exclusionReason === "suppressed"
      )
      .map((item) => item.leadId)
  );
  const validation = await validateAgentThreeCampaignLeads(
    resolvedLeads,
    (email) => localEmailValidationProvider.validate(email),
    {
      shouldSkip: (lead) => suppressedLeadIds.has(lead.id),
    }
  );
  const leadStore = useLeadStore.getState();
  for (const update of validation.updates) {
    leadStore.updateLeadEmailValidation(update.leadId, update.validation);
  }
  const preparation = useAgentThreeStore
    .getState()
    .prepareCampaign(profileId, activeCampaign.id, validation.leads);
  const metrics = getAgentThreeMetrics(
    useAgentThreeStore.getState().operations[profileId]
  );
  const message = describeAgentThreeEmptyQueue({
    hasCampaign: true,
    campaignRecipientCount: activeCampaign.leadIds.length,
    loadableCount: loadableLeadIds.length,
    resolvedLeadCount: resolvedLeads.length,
    readyCount: preparation.eligibleCount,
    alreadySentCount,
    confirmedDeliveryCount,
    recoveredNotConfiguredCount: recovered.recoveredCount,
    missingLeadCount,
    removedCount: preparation.removedCount + metrics.removed + metrics.invalidRemoved,
    dnsErrorCount: validation.dnsErrorCount,
    dnsMessage: AGENT_THREE_DNS_INCOMPLETE_MESSAGE,
    noEligibleMessage: NO_ELIGIBLE_LEADS_MESSAGE,
  });

  return {
    campaign: activeCampaign,
    campaignRecipientCount: activeCampaign.leadIds.length,
    loadableCount: loadableLeadIds.length,
    resolvedLeadCount: resolvedLeads.length,
    eligibleCount: preparation.eligibleCount,
    preparedCount: preparation.preparedCount,
    removedCount: preparation.removedCount,
    alreadySentCount,
    excludedOnLoadCount,
    confirmedDeliveryCount,
    recoveredNotConfiguredCount: recovered.recoveredCount,
    missingLeadCount,
    dnsErrorCount: validation.dnsErrorCount,
    message,
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
  const startRequests = useRef(new Set<CampaignProfileId>());
  const loadPromises = useRef(
    new Map<string, Promise<AgentThreeCampaignPreparation>>()
  );
  const [statuses, setStatuses] = useState<
    Record<CampaignProfileId, AgentThreeUiConnectionStatus>
  >({
    "panek-puglesi": null,
    modeclean: null,
  });
  const [nextSendAt, setNextSendAt] = useState<
    Record<CampaignProfileId, number | null>
  >({
    "panek-puglesi": null,
    modeclean: null,
  });
  const [preparations, setPreparations] = useState<
    Record<CampaignProfileId, AgentThreeCampaignPreparation | null>
  >({
    "panek-puglesi": null,
    modeclean: null,
  });
  const [loadingCampaign, setLoadingCampaign] = useState<
    Record<CampaignProfileId, boolean>
  >({
    "panek-puglesi": false,
    modeclean: false,
  });

  function setStatus(
    profileId: CampaignProfileId,
    status: AgentThreeUiConnectionStatus
  ) {
    setStatuses((current) => ({ ...current, [profileId]: status }));
  }

  function setProfileNextSendAt(
    profileId: CampaignProfileId,
    value: number | null
  ) {
    setNextSendAt((current) => ({ ...current, [profileId]: value }));
  }

  function setPreparation(
    profileId: CampaignProfileId,
    preparation: AgentThreeCampaignPreparation | null
  ) {
    setPreparations((current) => ({ ...current, [profileId]: preparation }));
  }

  async function loadCampaign(
    profileId: CampaignProfileId,
    campaignId?: string | null
  ): Promise<AgentThreeCampaignPreparation> {
    const resolvedCampaignId =
      campaignId === undefined
        ? useAgentThreeStore.getState().operations[profileId].currentCampaignId
        : campaignId;
    const loadKey = `${profileId}:${resolvedCampaignId ?? "none"}`;
    const inflight = loadPromises.current.get(loadKey);
    if (inflight) return inflight;

    const operation = useAgentThreeStore.getState().operations[profileId];
    if (operation.status === "running" || operation.status === "paused") {
      const metrics = getAgentThreeMetrics(operation);
      const current: AgentThreeCampaignPreparation = {
        ...EMPTY_PREPARATION,
        campaign:
          useCampaignStore
            .getState()
            .campaigns.find((item) => item.id === operation.currentCampaignId) ??
          null,
        campaignRecipientCount:
          useCampaignStore
            .getState()
            .campaigns.find((item) => item.id === operation.currentCampaignId)
            ?.leadIds.length ?? metrics.total,
        eligibleCount: metrics.ready,
        message: null,
      };
      setPreparation(profileId, current);
      return current;
    }

    const promise = (async (): Promise<AgentThreeCampaignPreparation> => {
      setLoadingCampaign((current) => ({ ...current, [profileId]: true }));
      setStatus(profileId, "validating");
      try {
        if (!resolvedCampaignId) {
          useAgentThreeStore.getState().selectCampaign(profileId, null);
          const empty = { ...EMPTY_PREPARATION };
          setPreparation(profileId, empty);
          setStatus(profileId, null);
          return empty;
        }
        const preparation = await prepareSelectedCampaign(
          profileId,
          resolvedCampaignId
        );
        setPreparation(profileId, preparation);
        if (preparation.message && preparation.eligibleCount === 0) {
          setStatus(
            profileId,
            preparation.dnsErrorCount > 0 ? "dns_incomplete" : null
          );
        } else {
          setStatus(profileId, "lead_ready");
        }
        return preparation;
      } finally {
        setLoadingCampaign((current) => ({ ...current, [profileId]: false }));
      }
    })();

    loadPromises.current.set(loadKey, promise);
    try {
      return await promise;
    } finally {
      loadPromises.current.delete(loadKey);
    }
  }

  async function run(profileId: CampaignProfileId): Promise<void> {
    if (activeLoops.current.has(profileId)) return;
    activeLoops.current.add(profileId);
    try {
      while (true) {
        const store = useAgentThreeStore.getState();
        const operation = store.operations[profileId];
        if (operation.status !== "running") break;

        setProfileNextSendAt(profileId, null);
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
          {
            delay,
            random: Math.random,
            onIntervalSelected: (intervalSeconds) =>
              setProfileNextSendAt(
                profileId,
                Date.now() + intervalSeconds * 1_000
              ),
          },
          controller.signal
        );
        controllers.current.delete(profileId);
        setProfileNextSendAt(profileId, null);
        if (waited.interrupted) break;
      }
    } finally {
      controllers.current.delete(profileId);
      activeLoops.current.delete(profileId);
      setProfileNextSendAt(profileId, null);
    }
  }

  async function start(
    profileId: CampaignProfileId
  ): Promise<AgentThreeRunnerResult> {
    if (startRequests.current.has(profileId)) {
      return { started: false, message: null };
    }
    startRequests.current.add(profileId);
    setProfileNextSendAt(profileId, null);
    setStatus(profileId, "validating");
    try {
      const preparation = await loadCampaign(profileId);
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
    } finally {
      startRequests.current.delete(profileId);
    }
  }

  function pause(profileId: CampaignProfileId) {
    controllers.current.get(profileId)?.abort();
    setProfileNextSendAt(profileId, null);
    useAgentThreeStore.getState().pause(profileId);
    setStatus(profileId, "paused");
  }

  async function resume(
    profileId: CampaignProfileId
  ): Promise<AgentThreeRunnerResult> {
    setProfileNextSendAt(profileId, null);
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
    setProfileNextSendAt(profileId, null);
    useAgentThreeStore.getState().stop(profileId);
    setStatus(profileId, "paused");
  }

  return {
    statuses,
    nextSendAt,
    preparations,
    loadingCampaign,
    loadCampaign,
    start,
    pause,
    resume,
    stop,
  };
}
