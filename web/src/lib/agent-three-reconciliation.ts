import type { Campaign, CampaignLeadStatus } from "../types/campaign.ts";
import type { CampaignProfileId } from "../types/campaign-profile.ts";
import { isRealDeliveryMessageId } from "./campaign-delivery-metrics.ts";
import { normalizeEmail } from "./email-validation.ts";
import { AGENT_THREE_UNKNOWN_RECONCILIATION_MESSAGE } from "./agent-three-timeouts.ts";
import {
  confirmAgentThreeItem,
  markAgentThreeItemFailedAuth,
  markAgentThreeItemUnknown,
  pauseAgentThree,
  touchAgentThreeHeartbeat,
  type AgentThreeQueueItem,
  type AgentThreeSnapshot,
} from "./agent-three-queue.ts";
import type { AgentThreeSmtpResult } from "./agent-three-smtp-contract.ts";

export interface AgentThreePersistedSendRecord {
  id?: string;
  intentKey?: string;
  campaignId: string | null;
  leadId: string | null;
  email: string;
  operation: string;
  queueItemId: string | null;
  providerMessageId: string | null;
  confirmedAt: string | null;
  attemptedAt?: string | null;
  status: "confirmed" | "failed" | "intent" | string;
  error?: string | null;
}

export interface AgentThreeReconciliationResult {
  snapshot: AgentThreeSnapshot;
  changed: boolean;
  confirmedCount: number;
  unknownCount: number;
  failedCount: number;
}

function emailsMatch(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const a = normalizeEmail(left);
  const b = normalizeEmail(right);
  return Boolean(a && b && a === b);
}

function isAuthenticationFailureRecord(
  record: AgentThreePersistedSendRecord | null | undefined
): boolean {
  if (!record || record.status !== "failed" || record.providerMessageId) {
    return false;
  }
  return /authentication|autentic|eauth|app password|senha de app|\b53[45]\b/i.test(
    record.error ?? ""
  );
}

/**
 * Historical unknown/sending items from another campaign must not pause a
 * new run that still has READY recipients. Pause only when the current
 * campaign is running, has unresolved items, and has nothing ready to send.
 */
export function shouldPauseRunningQueueForUnresolvedItems(
  operation: {
    status: string;
    currentCampaignId: string | null;
    queue: readonly AgentThreeQueueItem[];
  }
): boolean {
  if (operation.status !== "running") return false;
  const currentId = operation.currentCampaignId;
  const currentQueue = operation.queue.filter(
    (item) => item.campaignId === currentId
  );
  const hasReady = currentQueue.some((item) => item.queueStatus === "ready");
  if (hasReady) return false;
  return currentQueue.some(
    (item) =>
      item.queueStatus === "sending" || item.queueStatus === "unknown"
  );
}

export function isConfirmedSendRecord(
  record: AgentThreePersistedSendRecord | null | undefined
): boolean {
  if (!record || record.status !== "confirmed") return false;
  return isRealDeliveryMessageId(record.providerMessageId);
}

export function matchPersistedSend(
  item: Pick<
    AgentThreeQueueItem,
    "id" | "leadId" | "normalizedEmail" | "originalEmail" | "campaignId" | "campaignProfileId"
  >,
  records: readonly AgentThreePersistedSendRecord[]
): AgentThreePersistedSendRecord | null {
  const byQueueId = records.find(
    (record) => record.queueItemId && record.queueItemId === item.id
  );
  if (byQueueId) return byQueueId;
  const byLead = records.find(
    (record) =>
      record.operation === item.campaignProfileId &&
      record.campaignId === (item.campaignId ?? null) &&
      record.leadId === item.leadId
  );
  if (byLead) return byLead;
  return (
    records.find(
      (record) =>
        record.operation === item.campaignProfileId &&
        record.campaignId === (item.campaignId ?? null) &&
        emailsMatch(record.email, item.normalizedEmail ?? item.originalEmail)
    ) ?? null
  );
}

export function reconcileAgentThreeOperation(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  records: readonly AgentThreePersistedSendRecord[],
  occurredAt: string
): AgentThreeReconciliationResult {
  let next = snapshot;
  let confirmedCount = 0;
  let unknownCount = 0;
  let failedCount = 0;
  const operation = snapshot.operations[profileId];
  if (!operation) {
    return { snapshot, changed: false, confirmedCount, unknownCount, failedCount };
  }

  for (const item of operation.queue) {
    if (
      item.queueStatus === "sent" &&
      isRealDeliveryMessageId(item.providerMessageId)
    ) {
      confirmedCount += 1;
      continue;
    }
    const match = matchPersistedSend(item, records);
    if (isConfirmedSendRecord(match)) {
      next = confirmAgentThreeItem(
        next,
        profileId,
        item.id,
        match!.confirmedAt ?? occurredAt,
        match!.providerMessageId!
      );
      confirmedCount += 1;
      continue;
    }
    if (isAuthenticationFailureRecord(match)) {
      next = markAgentThreeItemFailedAuth(
        next,
        profileId,
        item.id,
        match!.error ?? "Falha de autenticação SMTP.",
        match!.attemptedAt ?? occurredAt
      );
      failedCount += 1;
      continue;
    }
    if (item.queueStatus === "sending") {
      if (match?.status === "failed") {
        failedCount += 1;
        continue;
      }
      next = markAgentThreeItemUnknown(
        next,
        profileId,
        item.id,
        occurredAt,
        AGENT_THREE_UNKNOWN_RECONCILIATION_MESSAGE
      );
      unknownCount += 1;
    }
  }

  const reconciled = next.operations[profileId];
  const sent = reconciled.queue.filter((item) => item.queueStatus === "sent").length;
  const processedCount = Math.max(reconciled.processedCount, sent);
  if (processedCount !== reconciled.processedCount) {
    next = {
      ...next,
      operations: {
        ...next.operations,
        [profileId]: { ...reconciled, processedCount },
      },
    };
  }

  if (shouldPauseRunningQueueForUnresolvedItems(next.operations[profileId])) {
    next = pauseAgentThree(next, profileId, occurredAt);
  }

  return {
    snapshot: next,
    changed: next !== snapshot,
    confirmedCount,
    unknownCount,
    failedCount,
  };
}

export function reconcileCampaignFromSendHistory(
  campaign: Campaign,
  records: readonly AgentThreePersistedSendRecord[]
): Campaign {
  const relevant = records.filter(
    (record) =>
      record.campaignId === campaign.id &&
      record.operation === campaign.campaignProfileId
  );
  if (relevant.length === 0) return campaign;
  const leadIds = campaign.leadIds ?? [];
  const existing = campaign.leadStatuses ?? [];
  const leadStatuses: CampaignLeadStatus[] = leadIds.map((leadId) => {
    const current =
      existing.find((status) => status.leadId === leadId) ?? {
        leadId,
        status: "pending" as const,
      };
    if (
      current.status === "sent" &&
      isRealDeliveryMessageId(current.providerMessageId)
    ) {
      return current;
    }
    const confirmed = relevant.find((record) => record.leadId === leadId);
    if (isConfirmedSendRecord(confirmed)) {
      return {
        ...current,
        leadId,
        status: "sent",
        sentAt: confirmed!.confirmedAt ?? current.sentAt,
        providerMessageId: confirmed!.providerMessageId!,
        errorMessage: undefined,
        errorCode: undefined,
      };
    }
    const failedAuth = relevant.find(
      (record) =>
        record.leadId === leadId && isAuthenticationFailureRecord(record)
    );
    if (!failedAuth || current.status === "sent") return current;
    return {
      ...current,
      leadId,
      status: "failed",
      sentAt: undefined,
      providerMessageId: undefined,
      errorMessage: failedAuth.error ?? "Falha de autenticação SMTP.",
      errorCode: "AGENT3_SMTP_AUTH",
    };
  });
  return {
    ...campaign,
    leadStatuses,
    sentCount: leadStatuses.filter((status) =>
      ["sent", "opened", "clicked", "replied"].includes(status.status)
    ).length,
    failedCount: leadStatuses.filter((status) => status.status === "failed")
      .length,
  };
}

export function isConfirmedSmtpDelivery(
  result: Pick<AgentThreeSmtpResult, "status" | "messageId">
): boolean {
  return result.status === "sent" && isRealDeliveryMessageId(result.messageId);
}

export function decideRunnerContinuation(input: {
  confirmed: boolean;
  campaignPersistFailed: boolean;
  shouldPause: boolean;
  hasReady: boolean;
}): "continue" | "pause" | "finish" {
  if (input.shouldPause && !input.confirmed) return "pause";
  if (input.confirmed && input.campaignPersistFailed) {
    return input.hasReady ? "continue" : "finish";
  }
  if (input.shouldPause) return input.confirmed && input.hasReady ? "continue" : "pause";
  if (!input.hasReady) return "finish";
  return "continue";
}

export async function persistCampaignAfterConfirmedSend(
  updateCampaign: () => void
): Promise<{ ok: boolean; error?: unknown }> {
  try {
    updateCampaign();
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

export function touchRunningHeartbeat(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  occurredAt: string
): AgentThreeSnapshot {
  return touchAgentThreeHeartbeat(snapshot, profileId, occurredAt);
}

export function shouldSkipSmtpForItem(
  item: AgentThreeQueueItem,
  records: readonly AgentThreePersistedSendRecord[]
): AgentThreePersistedSendRecord | null {
  if (item.queueStatus === "sent" && isRealDeliveryMessageId(item.providerMessageId)) {
    return {
      campaignId: item.campaignId ?? null,
      leadId: item.leadId,
      email: item.normalizedEmail ?? "",
      operation: item.campaignProfileId,
      queueItemId: item.id,
      providerMessageId: item.providerMessageId ?? null,
      confirmedAt: item.sentAt ?? null,
      status: "confirmed",
    };
  }
  const match = matchPersistedSend(item, records);
  return isConfirmedSendRecord(match) ? match : null;
}
