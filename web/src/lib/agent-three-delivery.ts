import type { CampaignProfileId } from "../types/campaign-profile.ts";
import {
  isAgentThreeSmtpStatus,
  type AgentThreeSmtpResult,
  type AgentThreeSmtpStatus,
} from "./agent-three-smtp-contract.ts";
import {
  evaluateAgentThreeCircuitBreaker,
  type AgentThreeCircuitBreakerState,
} from "./agent-three-circuit-breaker.ts";
import { isRealDeliveryMessageId } from "./campaign-delivery-metrics.ts";
import {
  blockAgentThreeSendingItem,
  completeAgentThreeItem,
  failAgentThreeItem,
  markAgentThreeItemFailedAuth,
  markAgentThreeItemUnknown,
  pauseAgentThree,
  releaseAgentThreeSendingItem,
  type AgentThreeSnapshot,
} from "./agent-three-queue.ts";

function asSmtpStatus(
  value: string | null | undefined
): AgentThreeSmtpStatus | null {
  return value && isAgentThreeSmtpStatus(value) ? value : null;
}

export interface AgentThreeDeliveryApplication {
  snapshot: AgentThreeSnapshot;
  shouldPause: boolean;
  stopReason: string | null;
  isSystemic: boolean;
}

function countConfirmedSends(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  campaignId: string | undefined
): number {
  if (!campaignId) return 0;
  const operation = snapshot.operations[profileId];
  return operation.sentIndex.filter(
    (record) =>
      record.campaignId === campaignId &&
      isRealDeliveryMessageId(record.providerMessageId)
  ).length;
}

function withCircuitState(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  state: AgentThreeCircuitBreakerState & {
    stopReason?: string | null;
    forcePause?: boolean;
  }
): AgentThreeSnapshot {
  const operation = snapshot.operations[profileId];
  const next = {
    ...operation,
    consecutiveFailureStatus: state.consecutiveFailureStatus,
    consecutiveFailureCount: state.consecutiveFailureCount,
    stopReason:
      state.stopReason !== undefined
        ? state.stopReason
        : operation.stopReason,
  };
  let result: AgentThreeSnapshot = {
    ...snapshot,
    operations: {
      ...snapshot.operations,
      [profileId]: next,
    },
  };
  if (state.forcePause && next.status === "running") {
    result = pauseAgentThree(
      result,
      profileId,
      new Date().toISOString()
    );
    const paused = result.operations[profileId];
    result = {
      ...result,
      operations: {
        ...result.operations,
        [profileId]: {
          ...paused,
          errorMessage: state.stopReason ?? paused.errorMessage,
          stopReason: state.stopReason ?? paused.stopReason,
          consecutiveFailureStatus: state.consecutiveFailureStatus,
          consecutiveFailureCount: state.consecutiveFailureCount,
        },
      },
    };
  }
  return result;
}

export function applyAgentThreeSmtpResult(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  itemId: string,
  smtpResult: AgentThreeSmtpResult,
  occurredAt: string
): AgentThreeDeliveryApplication {
  const deliveryResult: AgentThreeSmtpResult =
    smtpResult.status === "sent" &&
    !isRealDeliveryMessageId(smtpResult.messageId)
      ? {
          status: "transient_error",
          message:
            "O provedor não devolveu um providerMessageId válido; o envio não foi confirmado.",
        }
      : smtpResult;
  const operation = snapshot.operations[profileId];
  const sendingItem = operation.queue.find((item) => item.id === itemId);
  const campaignId = sendingItem?.campaignId ?? operation.currentCampaignId ?? undefined;
  const confirmedBefore = countConfirmedSends(snapshot, profileId, campaignId);
  const isFirstSendAttempt = confirmedBefore === 0 && operation.processedCount <= 1;

  const breaker = evaluateAgentThreeCircuitBreaker({
    smtpStatus: deliveryResult.status,
    consecutiveFailureStatus: asSmtpStatus(operation.consecutiveFailureStatus),
    consecutiveFailureCount: operation.consecutiveFailureCount,
    confirmedSendCount: confirmedBefore,
    isFirstSendAttempt,
  });

  const applyBreaker = (
    nextSnapshot: AgentThreeSnapshot,
    baseShouldPause: boolean
  ): AgentThreeDeliveryApplication => {
    const shouldPause = baseShouldPause || breaker.shouldPause;
    const withState = withCircuitState(nextSnapshot, profileId, {
      consecutiveFailureStatus: breaker.consecutiveFailureStatus,
      consecutiveFailureCount: breaker.consecutiveFailureCount,
      stopReason: breaker.stopReason,
      forcePause: shouldPause && !baseShouldPause,
    });
    // If base path already paused, still stamp stopReason/counters.
    const stamped =
      baseShouldPause && breaker.stopReason
        ? withCircuitState(withState, profileId, {
            consecutiveFailureStatus: breaker.consecutiveFailureStatus,
            consecutiveFailureCount: breaker.consecutiveFailureCount,
            stopReason: breaker.stopReason,
          })
        : withState;
    const finalOp = stamped.operations[profileId];
    return {
      snapshot:
        shouldPause && finalOp.status === "running"
          ? withCircuitState(stamped, profileId, {
              consecutiveFailureStatus: breaker.consecutiveFailureStatus,
              consecutiveFailureCount: breaker.consecutiveFailureCount,
              stopReason: breaker.stopReason,
              forcePause: true,
            })
          : stamped,
      shouldPause,
      stopReason: breaker.stopReason,
      isSystemic: breaker.isSystemic,
    };
  };

  switch (deliveryResult.status) {
    case "sent": {
      const completed = completeAgentThreeItem(
        snapshot,
        profileId,
        itemId,
        occurredAt,
        deliveryResult.messageId
      );
      return applyBreaker(completed, false);
    }
    case "real_send_disabled":
    case "configuration_error": {
      const released = releaseAgentThreeSendingItem(
        snapshot,
        profileId,
        itemId,
        occurredAt,
        {
          pause: true,
          consumeAttempt: false,
          message: deliveryResult.message,
        }
      );
      return applyBreaker(released, true);
    }
    case "authentication_error": {
      const failedAuth = markAgentThreeItemFailedAuth(
        snapshot,
        profileId,
        itemId,
        deliveryResult.message,
        occurredAt
      );
      return applyBreaker(failedAuth, true);
    }
    case "provider_rate_limit":
    case "provider_account_blocked": {
      const released = releaseAgentThreeSendingItem(
        snapshot,
        profileId,
        itemId,
        occurredAt,
        {
          pause: true,
          consumeAttempt: true,
          message: deliveryResult.message,
        }
      );
      return applyBreaker(released, true);
    }
    case "invalid_request":
    case "suppressed": {
      const blocked = blockAgentThreeSendingItem(
        snapshot,
        profileId,
        itemId,
        deliveryResult.message,
        occurredAt,
        deliveryResult.status
      );
      return applyBreaker(blocked, false);
    }
    case "reconciliation_required": {
      const unknown = markAgentThreeItemUnknown(
        snapshot,
        profileId,
        itemId,
        occurredAt,
        deliveryResult.message
      );
      return applyBreaker(unknown, false);
    }
    case "auth_transient":
    case "connection_error":
    case "transient_error":
    case "permanent_error": {
      const failed = failAgentThreeItem(
        snapshot,
        profileId,
        itemId,
        deliveryResult.message,
        occurredAt
      );
      // First-send provider unavailable or 3 consecutive same type → pause.
      return applyBreaker(failed, breaker.shouldPause);
    }
    case "connected": {
      const released = releaseAgentThreeSendingItem(
        snapshot,
        profileId,
        itemId,
        occurredAt,
        {
          pause: true,
          consumeAttempt: false,
          message: "Resposta de envio inválida.",
        }
      );
      return applyBreaker(released, true);
    }
  }
}
