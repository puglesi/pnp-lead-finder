import { isRealDeliveryMessageId } from "../campaign-delivery-metrics.ts";
import {
  AGENT_THREE_SMTP_MESSAGES,
  type AgentThreeSendRequest,
  type AgentThreeSmtpResult,
} from "../agent-three-smtp-contract.ts";
import type { SendIntent } from "./local-database.ts";
import {
  sendAgentThreeSmtp,
  validateAgentThreeSendRequest,
  type AgentThreeSmtpDependencies,
} from "./agent-three-smtp-core.ts";

export interface AgentThreeLeaseDatabase {
  claimSendLease(input: AgentThreeSendRequest): SendIntent;
  finishSendIntent(intent: SendIntent, result: AgentThreeSmtpResult): void;
  markSendLeaseUnknown(intent: SendIntent, message?: string): void;
  isSuppressed(operation: string, email: string): boolean;
}

function result(
  status: AgentThreeSmtpResult["status"],
  message?: string,
  messageId?: string
): AgentThreeSmtpResult {
  return {
    status,
    message: message ?? AGENT_THREE_SMTP_MESSAGES[status],
    ...(messageId ? { messageId } : {}),
  };
}

/**
 * Claim the SQLite send lease, then SMTP, then persist.
 * A second worker never reaches sendMail. Post-SMTP persist failure
 * becomes reconciliation_required — never a retryable failed.
 */
export async function executeAgentThreeSendWithLease(
  input: unknown,
  dependencies: AgentThreeSmtpDependencies & {
    database: AgentThreeLeaseDatabase;
  }
): Promise<AgentThreeSmtpResult> {
  if (!validateAgentThreeSendRequest(input)) {
    return result("invalid_request");
  }
  if (typeof input.ownerId !== "string" || !input.ownerId.trim()) {
    return result("invalid_request", "ownerId obrigatório para envio.");
  }

  let intent: SendIntent;
  try {
    intent = dependencies.database.claimSendLease(input);
  } catch (error) {
    return result(
      "configuration_error",
      "Banco local indisponível — envio real bloqueado antes do SMTP. " +
        (error instanceof Error ? error.message : "")
    );
  }

  if (intent.decision === "already_sent") {
    return result(
      "sent",
      "Envio já confirmado no histórico local; duplicata bloqueada.",
      intent.existingMessageId
    );
  }
  if (intent.decision === "already_claimed") {
    return result("already_claimed");
  }
  if (intent.decision === "reconciliation_required") {
    return result("reconciliation_required");
  }

  let smtpResult: AgentThreeSmtpResult;
  try {
    smtpResult = await sendAgentThreeSmtp(input, {
      environment: dependencies.environment,
      createTransport: dependencies.createTransport,
      isSuppressed: (operation, email) =>
        dependencies.database.isSuppressed(operation, email),
    });
  } catch {
    try {
      dependencies.database.markSendLeaseUnknown(
        intent,
        AGENT_THREE_SMTP_MESSAGES.reconciliation_required
      );
    } catch {
      // Lease stays claimed until expiry + recon.
    }
    return result("reconciliation_required");
  }

  try {
    dependencies.database.finishSendIntent(intent, smtpResult);
  } catch (error) {
    try {
      dependencies.database.markSendLeaseUnknown(
        intent,
        "Persistência pós-SMTP falhou. Sem retry automático."
      );
    } catch {
      // Keep reconciliation_required below.
    }
    const sent =
      smtpResult.status === "sent" ||
      isRealDeliveryMessageId(smtpResult.messageId);
    return result(
      "reconciliation_required",
      sent
        ? "O SMTP aceitou o envio, mas a confirmação local falhou. Sem retry automático. " +
            (error instanceof Error ? error.message : "")
        : "Não foi possível gravar o resultado do SMTP. Sem retry automático. " +
            (error instanceof Error ? error.message : "")
    );
  }

  return smtpResult;
}
