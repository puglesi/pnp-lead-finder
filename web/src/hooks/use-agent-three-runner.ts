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
  type AgentThreeSmtpResult,
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
import { isRealDeliveryMessageId } from "@/lib/campaign-delivery-metrics";
import {
  acquireGlobalEmailSendLock,
  auditGlobalEmailRecipients,
  buildGlobalEmailHistory,
  buildPermanentContactBlocks,
  type GlobalDeduplicationPreview,
} from "@/lib/global-email-deduplication";
import {
  emailBlocklistToPermanentBlocks,
  mergePermanentBlocks,
} from "@/lib/email-blocklist";
import { useEmailBlocklistStore } from "@/store/email-blocklist-store";

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
  deduplicationPreview: GlobalDeduplicationPreview | null;
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
  deduplicationPreview: null,
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

function getAllKnownLeads(): Lead[] {
  const state = useLeadStore.getState();
  const byId = new Map<string, Lead>();
  for (const lead of [
    ...state.currentLeads,
    ...state.savedLeads,
    ...state.importedLeads,
    ...state.fullSearchHistory.flatMap((record) => record.leads ?? []),
  ]) {
    byId.set(lead.id, lead);
  }
  return [...byId.values()];
}

function buildCampaignDeduplicationPreview(
  campaign: Campaign,
  recipients: readonly Lead[],
  companiesFound = campaign.leadIds.length
): GlobalDeduplicationPreview {
  const campaigns = useCampaignStore.getState().campaigns;
  const operations = useAgentThreeStore.getState().operations;
  const leads = getAllKnownLeads();
  const evidence = { campaigns, operations, leads };
  const manualBlocks = emailBlocklistToPermanentBlocks(
    useEmailBlocklistStore.getState().entries
  );
  return auditGlobalEmailRecipients({
    operation: campaign.campaignProfileId,
    campaignId: campaign.id,
    contactKind: campaign.contactKind ?? "first_contact",
    companiesFound,
    recipients: recipients.map((lead) => ({
      leadId: lead.id,
      company: lead.company,
      email: lead.normalizedEmail ?? lead.email,
    })),
    history: buildGlobalEmailHistory(evidence),
    // Same suppression list for global dedupe + Agent 3.
    permanentBlocks: mergePermanentBlocks(
      buildPermanentContactBlocks(evidence),
      manualBlocks
    ),
  });
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
  const campaignLeads = activeCampaign.leadIds
    .map((leadId) => findLead(leadId))
    .filter(Boolean) as Lead[];
  const deduplicationPreview = buildCampaignDeduplicationPreview(
    activeCampaign,
    campaignLeads
  );
  const includedLeadIds = new Set(
    deduplicationPreview.decisions
      .filter((decision) => decision.included)
      .map((decision) => decision.leadId)
  );
  agentStore.applyDeduplicationPreview(
    profileId,
    activeCampaign.id,
    deduplicationPreview
  );
  const resolvedLeads: Lead[] = [];
  let missingLeadCount = 0;
  for (const leadId of loadableLeadIds) {
    const lead = findLead(leadId);
    if (lead && includedLeadIds.has(lead.id)) resolvedLeads.push(lead);
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
  const message =
    deduplicationPreview.finalSendCount === 0
      ? "A prévia global não encontrou destinatários autorizados para envio."
      : describeAgentThreeEmptyQueue({
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
    deduplicationPreview,
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
  status: AgentThreeUiConnectionStatus,
  smtpMessage?: string | null
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
  if (status === "sent" || status === "connected") {
    return smtpMessage?.trim() || "✓ Pronto para envio real";
  }
  // Prefer specific server message for known failure statuses.
  if (
    status === "real_send_disabled" ||
    status === "configuration_error" ||
    status === "authentication_error" ||
    status === "provider_rate_limit" ||
    status === "provider_account_blocked" ||
    status === "transient_error" ||
    status === "permanent_error"
  ) {
    if (smtpMessage?.trim()) return smtpMessage.trim();
  }
  if (status === "real_send_disabled") {
    return AGENT_THREE_SMTP_MESSAGES.real_send_disabled;
  }
  if (status === "configuration_error") {
    return AGENT_THREE_SMTP_MESSAGES.configuration_error;
  }
  if (status === "authentication_error") {
    return AGENT_THREE_SMTP_MESSAGES.authentication_error;
  }
  if (
    status === "provider_rate_limit" ||
    status === "provider_account_blocked"
  ) {
    return "Conta limitada pelo provedor.";
  }
  return smtpMessage?.trim() || null;
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
  const [smtpResults, setSmtpResults] = useState<
    Record<CampaignProfileId, AgentThreeSmtpResult | null>
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

  function setSmtpResult(
    profileId: CampaignProfileId,
    result: AgentThreeSmtpResult | null
  ) {
    setSmtpResults((current) => ({ ...current, [profileId]: result }));
    if (result) setStatus(profileId, result.status);
  }

  /**
   * Preflight only — never sends a message.
   * Live verify when verify=true.
   */
  async function verifySend(
    profileId: CampaignProfileId,
    options: { verify?: boolean } = { verify: true }
  ): Promise<AgentThreeSmtpResult> {
    setStatus(profileId, "validating");
    const result = await checkAgentThreeSmtpAvailability(profileId, {
      verify: options.verify !== false,
    });
    setSmtpResult(profileId, result);
    return result;
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
        deduplicationPreview: operation.currentCampaignId
          ? (() => {
              const campaign = useCampaignStore
                .getState()
                .campaigns.find((item) => item.id === operation.currentCampaignId);
              if (!campaign) return null;
              const leads = campaign.leadIds
                .map((leadId) => findLead(leadId))
                .filter(Boolean) as Lead[];
              return buildCampaignDeduplicationPreview(campaign, leads);
            })()
          : null,
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
        const lead = findLead(item.leadId);
        const immediatePreview = campaign
          ? buildCampaignDeduplicationPreview(
              campaign,
              lead ? [lead] : [],
              lead ? 1 : 0
            )
          : null;
        const immediateDecision = immediatePreview?.decisions[0];
        if (!immediateDecision?.included) {
          useAgentThreeStore.getState().blockClaimed(
            profileId,
            item.id,
            immediateDecision?.reason ?? "Destinatário bloqueado pela verificação global.",
            immediateDecision?.reason === "Descadastrado"
              ? "unsubscribed"
              : immediateDecision?.reason === "Bounce permanente"
                ? "permanent_bounce"
                : immediateDecision?.reason === "Contato bloqueado"
                  ? "contact_blocked"
                  : "already_contacted"
          );
          continue;
        }
        const sendLock = acquireGlobalEmailSendLock({
          operation: profileId,
          email: item.normalizedEmail ?? item.originalEmail,
          owner: `${item.campaignId ?? "campaign"}:${item.id}`,
        });
        if (!sendLock.acquired) {
          useAgentThreeStore.getState().blockClaimed(
            profileId,
            item.id,
            "Outro envio para este destinatário já está em processamento.",
            "send_locked"
          );
          continue;
        }
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
          sendLock.release();
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
        let smtpResult: Awaited<ReturnType<typeof requestAgentThreeSmtpSend>>;
        try {
          smtpResult = await requestAgentThreeSmtpSend(requestBuild.request);
        } finally {
          sendLock.release();
        }
        const occurredAt = new Date().toISOString();
        const application = useAgentThreeStore
          .getState()
          .applyDeliveryResult(profileId, item.id, smtpResult);
        const confirmedSmtpSend =
          smtpResult.status === "sent" &&
          isRealDeliveryMessageId(smtpResult.messageId);
        setStatus(
          profileId,
          confirmedSmtpSend
            ? "connected"
            : smtpResult.status === "sent"
              ? "transient_error"
              : smtpResult.status
        );

        if (campaign && confirmedSmtpSend) {
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
            smtpResult.status === "permanent_error" ||
            smtpResult.status === "sent")
        ) {
          useCampaignStore.getState().updateCampaign(
            campaign.id,
            patchCampaignDelivery(
              campaign,
              item.leadId,
              "failed",
              occurredAt,
              undefined,
              smtpResult.status === "sent"
                ? "O provedor não confirmou o envio com providerMessageId."
                : smtpResult.message
            )
          );
        }

        if (application.shouldPause) {
          // Systemic / consecutive-failure circuit breaker — do not claim more recipients.
          break;
        }
        const nextOperation =
          useAgentThreeStore.getState().operations[profileId];
        if (nextOperation.status !== "running") break;
        const hasAnotherItem = nextOperation.queue.some(
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
      // Live SMTP auth/connection check before the first real send (no message).
      const availability = await verifySend(profileId, { verify: true });
      if (availability.status !== "connected") {
        return {
          started: false,
          message:
            availability.message ||
            "SMTP indisponível ou mal configurado. Corrija a configuração antes de enviar.",
        };
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
    const availability = await verifySend(profileId, { verify: true });
    if (availability.status !== "connected") {
      return {
        started: false,
        message:
          availability.message ||
          "SMTP indisponível ou mal configurado. Corrija a configuração antes de retomar.",
      };
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
    smtpResults,
    nextSendAt,
    preparations,
    loadingCampaign,
    loadCampaign,
    verifySend,
    start,
    pause,
    resume,
    stop,
  };
}
