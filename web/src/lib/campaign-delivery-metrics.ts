import type {
  Campaign,
  CampaignLeadStatus,
  CampaignSendError,
} from "../types/campaign.ts";

const DELIVERY_STATUSES = new Set([
  "sent",
  "opened",
  "clicked",
  "replied",
]);

/**
 * Real SMTP / provider IDs only.
 * Rejects simulate (`sim-…`), empty, and other non-delivery placeholders.
 */
export function isRealDeliveryMessageId(
  messageId?: string | null
): messageId is string {
  if (typeof messageId !== "string") return false;
  const id = messageId.trim();
  if (id.length < 6) return false;
  const lower = id.toLowerCase();
  if (lower.startsWith("sim-")) return false;
  if (lower.startsWith("simulate")) return false;
  if (lower.includes("not_configured")) return false;
  if (lower.includes("not-configured")) return false;
  if (lower === "undefined" || lower === "null" || lower === "none") {
    return false;
  }
  return true;
}

function isLeadStatusRecord(
  status: unknown
): status is CampaignLeadStatus {
  return Boolean(status) && typeof status === "object" && !Array.isArray(status);
}

/**
 * Confirmed delivery requires a non-simulate provider message id.
 * Engagement alone (opened/clicked/replied) without real SMTP evidence does not count.
 * Null/undefined nested entries from legacy storage are treated as non-delivery.
 */
export function isConfirmedCampaignDelivery(
  status: CampaignLeadStatus | null | undefined
): boolean {
  if (!isLeadStatusRecord(status)) return false;
  if (!DELIVERY_STATUSES.has(status.status)) return false;
  return isRealDeliveryMessageId(status.providerMessageId);
}

/** Any pseudo-delivery that must return to pending for Agent 3. */
export function isUnconfirmedCampaignSent(
  status: CampaignLeadStatus | null | undefined
): boolean {
  if (!isLeadStatusRecord(status)) return false;
  return (
    DELIVERY_STATUSES.has(status.status) &&
    !isRealDeliveryMessageId(status.providerMessageId)
  );
}

export function isNotConfiguredCampaignFailure(
  status: CampaignLeadStatus | null | undefined
): boolean {
  if (!isLeadStatusRecord(status)) return false;
  if (status.status !== "failed") return false;
  if (status.errorCode === "NOT_CONFIGURED") return true;
  if (status.errorCode === "BAD_REQUEST") return true;
  const message = status.errorMessage ?? "";
  return (
    /not[_\s-]?configured/i.test(message) ||
    /não configurado/i.test(message) ||
    /nao configurado/i.test(message) ||
    /credenciais/i.test(message) ||
    /smtp ausente/i.test(message)
  );
}

/** Failures that never reached a real mailbox (no SMTP confirmation). */
export function isNonSmtpLegacyFailure(
  status: CampaignLeadStatus | null | undefined
): boolean {
  if (!isLeadStatusRecord(status)) return false;
  if (status.status !== "failed") return false;
  if (isNotConfiguredCampaignFailure(status)) return true;
  // No real provider message id ⇒ no confirmed SMTP hop.
  if (!isRealDeliveryMessageId(status.providerMessageId)) {
    const code = (status.errorCode ?? "").toUpperCase();
    if (
      !code ||
      code === "SEND_FAILED" ||
      code === "NOT_CONFIGURED" ||
      code === "BAD_REQUEST" ||
      code === "UNSUPPORTED"
    ) {
      return true;
    }
  }
  return false;
}

export function countConfirmedSent(
  leadStatuses: readonly CampaignLeadStatus[] | null | undefined
): number {
  if (!Array.isArray(leadStatuses)) return 0;
  return leadStatuses.filter(isConfirmedCampaignDelivery).length;
}

export function countFailedDeliveries(
  leadStatuses: readonly CampaignLeadStatus[] | null | undefined
): number {
  if (!Array.isArray(leadStatuses)) return 0;
  return leadStatuses.filter(
    (status) => isLeadStatusRecord(status) && status.status === "failed"
  ).length;
}

export function deriveCampaignDeliveryCounts(
  leadStatuses: readonly CampaignLeadStatus[]
): {
  sentCount: number;
  failedCount: number;
  openedCount: number;
  clickedCount: number;
  repliedCount: number;
} {
  let sentCount = 0;
  let failedCount = 0;
  let openedCount = 0;
  let clickedCount = 0;
  let repliedCount = 0;
  for (const status of leadStatuses) {
    if (!isLeadStatusRecord(status)) continue;
    if (status.status === "failed") {
      failedCount += 1;
      continue;
    }
    if (!isConfirmedCampaignDelivery(status)) continue;
    sentCount += 1;
    if (status.status === "replied") {
      openedCount += 1;
      clickedCount += 1;
      repliedCount += 1;
      continue;
    }
    if (status.status === "clicked") {
      openedCount += 1;
      clickedCount += 1;
      continue;
    }
    if (status.status === "opened") {
      openedCount += 1;
    }
  }
  return { sentCount, failedCount, openedCount, clickedCount, repliedCount };
}

/**
 * Align persisted campaign counters with real SMTP evidence only.
 * Demotes simulate / NOT_CONFIGURED / legacy pseudo-sends and zeros stale counters.
 */
export function reconcileCampaignDelivery(campaign: Campaign): {
  leadStatuses: CampaignLeadStatus[];
  sentCount: number;
  failedCount: number;
  openedCount: number;
  clickedCount: number;
  repliedCount: number;
  sendErrors: CampaignSendError[];
  recoveredNotConfiguredCount: number;
  demotedUnconfirmedSentCount: number;
  changed: boolean;
} {
  let recoveredNotConfiguredCount = 0;
  let demotedUnconfirmedSentCount = 0;
  const recoveredLeadIds = new Set<string>();
  const simulateCampaign = campaign.emailProvider === "simulate";

  const leadStatuses = (campaign.leadStatuses ?? [])
    .filter(isLeadStatusRecord)
    .map((status) => {
      if (
        isNotConfiguredCampaignFailure(status) ||
        isNonSmtpLegacyFailure(status)
      ) {
        recoveredNotConfiguredCount += 1;
        recoveredLeadIds.add(status.leadId);
        return { leadId: status.leadId, status: "pending" as const };
      }
      // Simulate provider never produces real SMTP confirmations.
      if (
        simulateCampaign &&
        (DELIVERY_STATUSES.has(status.status) || status.status === "failed")
      ) {
        demotedUnconfirmedSentCount += 1;
        recoveredLeadIds.add(status.leadId);
        return { leadId: status.leadId, status: "pending" as const };
      }
      if (isUnconfirmedCampaignSent(status)) {
        demotedUnconfirmedSentCount += 1;
        recoveredLeadIds.add(status.leadId);
        return { leadId: status.leadId, status: "pending" as const };
      }
      return status;
    });

  // Ensure every leadId has a status entry (legacy campaigns sometimes only stored counters).
  const statusByLeadId = new Map(leadStatuses.map((s) => [s.leadId, s]));
  for (const leadId of campaign.leadIds ?? []) {
    if (!statusByLeadId.has(leadId)) {
      statusByLeadId.set(leadId, { leadId, status: "pending" });
    }
  }
  const normalizedLeadStatuses = (campaign.leadIds ?? []).map(
    (leadId) => statusByLeadId.get(leadId) ?? { leadId, status: "pending" as const }
  );
  // Keep any orphan statuses for leads no longer in leadIds only if confirmed SMTP.
  for (const status of leadStatuses) {
    if (
      !statusByLeadId.has(status.leadId) &&
      isConfirmedCampaignDelivery(status)
    ) {
      normalizedLeadStatuses.push(status);
    }
  }

  const counts = deriveCampaignDeliveryCounts(normalizedLeadStatuses);
  const sendErrors = (campaign.sendErrors ?? []).filter((error) => {
    if (!error || typeof error !== "object") return false;
    if (recoveredLeadIds.has(error.leadId)) return false;
    if (error.errorCode === "NOT_CONFIGURED") return false;
    if (simulateCampaign) return false;
    return true;
  });

  const changed =
    recoveredNotConfiguredCount > 0 ||
    demotedUnconfirmedSentCount > 0 ||
    campaign.sentCount !== counts.sentCount ||
    (campaign.failedCount ?? 0) !== counts.failedCount ||
    campaign.openedCount !== counts.openedCount ||
    campaign.clickedCount !== counts.clickedCount ||
    campaign.repliedCount !== counts.repliedCount ||
    sendErrors.length !== (campaign.sendErrors ?? []).length ||
    normalizedLeadStatuses.length !== (campaign.leadStatuses ?? []).length;

  return {
    leadStatuses: normalizedLeadStatuses,
    ...counts,
    sendErrors,
    recoveredNotConfiguredCount,
    demotedUnconfirmedSentCount,
    changed,
  };
}

export function getConfirmedDeliveryLeadIds(
  campaign: Campaign
): Set<string> {
  return new Set(
    campaign.leadStatuses
      .filter(isConfirmedCampaignDelivery)
      .map((status) => status.leadId)
  );
}
