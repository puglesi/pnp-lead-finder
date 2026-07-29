import type { CampaignProfileId } from "../types/campaign-profile.ts";
import type { AgentThreeSmtpResult } from "./agent-three-smtp-contract.ts";
import {
  blockAgentThreeSendingItem,
  completeAgentThreeItem,
  failAgentThreeItem,
  releaseAgentThreeSendingItem,
  type AgentThreeSnapshot,
} from "./agent-three-queue.ts";

export interface AgentThreeDeliveryApplication {
  snapshot: AgentThreeSnapshot;
  shouldPause: boolean;
}

export function applyAgentThreeSmtpResult(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  itemId: string,
  smtpResult: AgentThreeSmtpResult,
  occurredAt: string
): AgentThreeDeliveryApplication {
  switch (smtpResult.status) {
    case "sent":
      return {
        snapshot: completeAgentThreeItem(
          snapshot,
          profileId,
          itemId,
          occurredAt,
          smtpResult.messageId
        ),
        shouldPause: false,
      };
    case "real_send_disabled":
    case "configuration_error":
      return {
        snapshot: releaseAgentThreeSendingItem(
          snapshot,
          profileId,
          itemId,
          occurredAt,
          {
            pause: true,
            consumeAttempt: false,
            message: smtpResult.message,
          }
        ),
        shouldPause: true,
      };
    case "authentication_error":
    case "provider_rate_limit":
    case "provider_account_blocked":
      return {
        snapshot: releaseAgentThreeSendingItem(
          snapshot,
          profileId,
          itemId,
          occurredAt,
          {
            pause: true,
            consumeAttempt: true,
            message: smtpResult.message,
          }
        ),
        shouldPause: true,
      };
    case "invalid_request":
    case "suppressed":
      return {
        snapshot: blockAgentThreeSendingItem(
          snapshot,
          profileId,
          itemId,
          smtpResult.message,
          occurredAt,
          smtpResult.status
        ),
        shouldPause: false,
      };
    case "transient_error":
    case "permanent_error":
      return {
        snapshot: failAgentThreeItem(
          snapshot,
          profileId,
          itemId,
          smtpResult.message,
          occurredAt
        ),
        shouldPause: false,
      };
    case "connected":
      return {
        snapshot: releaseAgentThreeSendingItem(
          snapshot,
          profileId,
          itemId,
          occurredAt,
          {
            pause: true,
            consumeAttempt: false,
            message: "Resposta de envio inválida.",
          }
        ),
        shouldPause: true,
      };
  }
}
