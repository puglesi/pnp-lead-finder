import type { GlobalDeduplicationDecision } from "./global-email-deduplication.ts";
import type { GlobalDeduplicationPreview } from "./global-email-deduplication.ts";
import type {
  AgentThreeExclusionReason,
  AgentThreeQueueItem,
} from "./agent-three-queue.ts";

export function exclusionReasonFromDecision(
  decision: GlobalDeduplicationDecision | undefined
): AgentThreeExclusionReason {
  if (!decision || decision.included) return "already_contacted";
  if (decision.code === "duplicate_in_batch") return "duplicate";
  if (decision.code === "invalid_email") return "invalid_request";
  if (decision.code === "permanently_blocked") {
    if (decision.reason === "Descadastrado") return "unsubscribed";
    if (decision.reason === "Bounce permanente") return "permanent_bounce";
    return "contact_blocked";
  }
  if (decision.code === "guess_not_verified") return "guess_not_verified";
  if (decision.code === "synthetic") return "synthetic";
  if (decision.code === "outside_target") return "outside_target";
  if (decision.code === "unknown_location") return "unknown_location";
  if (decision.code === "validation_pending") return "validation_pending";
  return "already_contacted";
}

/**
 * Aligns an existing campaign queue with the authoritative preview.
 * Never adds excluded/same-operation contacts. Preserves queue item ids.
 */
export function syncCampaignQueueToAuthoritativePreview(input: {
  queue: readonly AgentThreeQueueItem[];
  campaignId: string;
  preview: GlobalDeduplicationPreview;
  occurredAt: string;
}): {
  queue: AgentThreeQueueItem[];
  readyCount: number;
  blockedCount: number;
  preservedCount: number;
} {
  const includedIds = new Set(
    input.preview.decisions
      .filter((decision) => decision.included)
      .map((decision) => decision.leadId)
  );
  const decisionByLead = new Map(
    input.preview.decisions.map((decision) => [decision.leadId, decision])
  );
  let blockedCount = 0;
  let preservedCount = 0;
  const queue = input.queue.map((item) => {
    if (item.campaignId !== input.campaignId) return item;
    if (
      item.queueStatus === "sent" ||
      item.queueStatus === "sending" ||
      item.queueStatus === "unknown"
    ) {
      return item;
    }
    if (includedIds.has(item.leadId)) {
      preservedCount += 1;
      return item;
    }
    if (item.queueStatus === "ready" || item.queueStatus === "pending") {
      const decision = decisionByLead.get(item.leadId);
      blockedCount += 1;
      return {
        ...item,
        queueStatus: "blocked" as const,
        exclusionReason: exclusionReasonFromDecision(decision),
        errorMessage:
          decision?.reason ?? "Fora da prévia authoritative.",
        updatedAt: input.occurredAt,
      };
    }
    return item;
  });
  return {
    queue,
    readyCount: queue.filter(
      (item) =>
        item.campaignId === input.campaignId && item.queueStatus === "ready"
    ).length,
    blockedCount,
    preservedCount,
  };
}
