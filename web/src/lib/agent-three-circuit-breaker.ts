import type { AgentThreeSmtpStatus } from "./agent-three-smtp-contract.ts";

/** Failures that mean the provider/account is unusable — stop immediately. */
export const AGENT_THREE_SYSTEMIC_SMTP_STATUSES = new Set<AgentThreeSmtpStatus>([
  "authentication_error",
  "configuration_error",
  "real_send_disabled",
  "provider_rate_limit",
  "provider_account_blocked",
]);

/** Connection/provider availability failures (classified as transient by SMTP core). */
export const AGENT_THREE_PROVIDER_UNAVAILABLE_STATUSES =
  new Set<AgentThreeSmtpStatus>(["transient_error"]);

export const AGENT_THREE_CONSECUTIVE_FAILURE_LIMIT = 3;

export interface AgentThreeCircuitBreakerState {
  consecutiveFailureStatus: AgentThreeSmtpStatus | null;
  consecutiveFailureCount: number;
}

export interface AgentThreeCircuitBreakerInput
  extends AgentThreeCircuitBreakerState {
  smtpStatus: AgentThreeSmtpStatus;
  /** Confirmed real deliveries in this campaign (providerMessageId evidence). */
  confirmedSendCount: number;
  /** True when this is the first SMTP attempt of the current run. */
  isFirstSendAttempt: boolean;
}

export interface AgentThreeCircuitBreakerDecision
  extends AgentThreeCircuitBreakerState {
  shouldPause: boolean;
  stopReason: string | null;
  isSystemic: boolean;
}

export function isAgentThreeSystemicSmtpStatus(
  status: AgentThreeSmtpStatus
): boolean {
  return AGENT_THREE_SYSTEMIC_SMTP_STATUSES.has(status);
}

export function evaluateAgentThreeCircuitBreaker(
  input: AgentThreeCircuitBreakerInput
): AgentThreeCircuitBreakerDecision {
  if (input.smtpStatus === "sent" || input.smtpStatus === "connected") {
    return {
      consecutiveFailureStatus: null,
      consecutiveFailureCount: 0,
      shouldPause: false,
      stopReason: null,
      isSystemic: false,
    };
  }

  // Non-failure control statuses that already pause the queue item without counting.
  if (
    input.smtpStatus === "suppressed" ||
    input.smtpStatus === "invalid_request" ||
    input.smtpStatus === "reconciliation_required"
  ) {
    return {
      consecutiveFailureStatus: input.consecutiveFailureStatus,
      consecutiveFailureCount: input.consecutiveFailureCount,
      shouldPause: false,
      stopReason: null,
      isSystemic: false,
    };
  }

  const isSystemic = isAgentThreeSystemicSmtpStatus(input.smtpStatus);
  const isProviderUnavailable =
    AGENT_THREE_PROVIDER_UNAVAILABLE_STATUSES.has(input.smtpStatus);

  const nextStatus = input.smtpStatus;
  const nextCount =
    input.consecutiveFailureStatus === nextStatus
      ? input.consecutiveFailureCount + 1
      : 1;

  if (isSystemic) {
    return {
      consecutiveFailureStatus: nextStatus,
      consecutiveFailureCount: nextCount,
      shouldPause: true,
      stopReason: `Falha sistêmica do provedor (${input.smtpStatus}). Envio interrompido antes de novos destinatários.`,
      isSystemic: true,
    };
  }

  // First real attempt fails because the provider is unreachable → stop immediately.
  if (
    input.isFirstSendAttempt &&
    input.confirmedSendCount === 0 &&
    isProviderUnavailable
  ) {
    return {
      consecutiveFailureStatus: nextStatus,
      consecutiveFailureCount: nextCount,
      shouldPause: true,
      stopReason:
        "Provedor SMTP indisponível no primeiro envio. Execução interrompida para evitar centenas de falhas.",
      isSystemic: true,
    };
  }

  if (nextCount >= AGENT_THREE_CONSECUTIVE_FAILURE_LIMIT) {
    return {
      consecutiveFailureStatus: nextStatus,
      consecutiveFailureCount: nextCount,
      shouldPause: true,
      stopReason: `${AGENT_THREE_CONSECUTIVE_FAILURE_LIMIT} falhas consecutivas do mesmo tipo (${nextStatus}). Envio interrompido.`,
      isSystemic: isSystemic || isProviderUnavailable,
    };
  }

  return {
    consecutiveFailureStatus: nextStatus,
    consecutiveFailureCount: nextCount,
    shouldPause: false,
    stopReason: null,
    isSystemic: false,
  };
}
