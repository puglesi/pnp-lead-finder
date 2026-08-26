import type { CampaignProfileId } from "../types/campaign-profile.ts";

export type AgentThreeSmtpStatus =
  | "real_send_disabled"
  | "configuration_error"
  | "connected"
  | "invalid_request"
  | "suppressed"
  | "sent"
  | "authentication_error"
  | "provider_rate_limit"
  | "provider_account_blocked"
  | "transient_error"
  | "permanent_error"
  | "reconciliation_required";

export interface AgentThreeAttachmentPayload {
  filename: string;
  mimeType: "application/pdf";
  contentBase64: string;
}

export interface AgentThreeSendRequest {
  operation: CampaignProfileId;
  recipient: string;
  subject: string;
  html?: string;
  text?: string;
  campaignId?: string;
  leadId?: string;
  queueItemId?: string;
  attachment?: AgentThreeAttachmentPayload;
}

/** Non-secret server diagnostics for UI (never includes passwords/tokens). */
export interface AgentThreeSmtpDiagnostics {
  realSendEnabled: boolean;
  /** Env var names that are missing or invalid — never values. */
  missingEnvVars: string[];
  operation: string;
  verifiedLive?: boolean;
}

export interface AgentThreeSmtpResult {
  status: AgentThreeSmtpStatus;
  message: string;
  messageId?: string;
  diagnostics?: AgentThreeSmtpDiagnostics;
}

export const AGENT_THREE_SMTP_MESSAGES: Record<
  AgentThreeSmtpStatus,
  string
> = {
  real_send_disabled:
    "Envio real desativado na configuração do servidor (defina AGENT3_REAL_SEND_ENABLED=true no ambiente do host).",
  configuration_error:
    "Configuração SMTP incompleta no servidor (variáveis de ambiente da operação).",
  connected: "Conectado e pronto para envio real.",
  invalid_request: "Dados de envio inválidos.",
  suppressed: "Destinatário removido da lista de envio.",
  sent: "E-mail enviado.",
  authentication_error: "SMTP não autenticado — verifique usuário e senha de app no servidor.",
  provider_rate_limit: "Conta limitada pelo provedor.",
  provider_account_blocked: "Conta bloqueada pelo provedor.",
  transient_error: "Falha temporária no envio.",
  permanent_error: "Falha permanente no envio.",
  reconciliation_required:
    "UNKNOWN_RECONCILIATION_REQUIRED — o SMTP não confirmou o resultado a tempo. Sem retry automático.",
};

/** Human reasons for Start blocking (client-side preconditions). */
export function describeAgentThreeStartBlock(reason: {
  realSendDisabled?: boolean;
  configurationError?: boolean;
  authError?: boolean;
  campaignMissing?: boolean;
  campaignUnsavedDraft?: boolean;
  previewRequired?: boolean;
  noEligible?: boolean;
  campaignCompleted?: boolean;
  smtpMessage?: string | null;
  missingEnvVars?: string[];
}): string {
  if (reason.campaignCompleted) {
    return "Campanha concluída: todos os destinatários já foram enviados.";
  }
  if (reason.campaignMissing) {
    return "Selecione uma campanha salva antes de enviar.";
  }
  if (reason.campaignUnsavedDraft) {
    return "Campanha não salva — salve a campanha antes de enviar.";
  }
  if (reason.previewRequired) {
    return "Prévia de deduplicação necessária — confirme a prévia global.";
  }
  if (reason.noEligible) {
    return "Nenhum destinatário elegível.";
  }
  if (reason.realSendDisabled) {
    return (
      reason.smtpMessage ||
      AGENT_THREE_SMTP_MESSAGES.real_send_disabled
    );
  }
  if (reason.configurationError) {
    const missing = reason.missingEnvVars?.filter(Boolean) ?? [];
    if (missing.length > 0) {
      return `Configuração SMTP incompleta. Variáveis ausentes no servidor: ${missing.join(", ")}.`;
    }
    return reason.smtpMessage || AGENT_THREE_SMTP_MESSAGES.configuration_error;
  }
  if (reason.authError) {
    return reason.smtpMessage || AGENT_THREE_SMTP_MESSAGES.authentication_error;
  }
  if (reason.smtpMessage) return reason.smtpMessage;
  return "Envio bloqueado — verifique a configuração e a prévia.";
}

export function isAgentThreeSmtpStatus(
  value: unknown
): value is AgentThreeSmtpStatus {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(AGENT_THREE_SMTP_MESSAGES, value)
  );
}
