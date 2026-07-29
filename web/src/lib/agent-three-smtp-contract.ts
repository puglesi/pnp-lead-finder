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
  | "permanent_error";

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

export interface AgentThreeSmtpResult {
  status: AgentThreeSmtpStatus;
  message: string;
  messageId?: string;
}

export const AGENT_THREE_SMTP_MESSAGES: Record<
  AgentThreeSmtpStatus,
  string
> = {
  real_send_disabled: "Envio real desativado.",
  configuration_error: "Configuração de envio incompleta.",
  connected: "Conectado.",
  invalid_request: "Dados de envio inválidos.",
  suppressed: "Destinatário removido da lista de envio.",
  sent: "E-mail enviado.",
  authentication_error: "Erro de autenticação.",
  provider_rate_limit: "Conta limitada pelo provedor.",
  provider_account_blocked: "Conta bloqueada pelo provedor.",
  transient_error: "Falha temporária no envio.",
  permanent_error: "Falha permanente no envio.",
};

export function isAgentThreeSmtpStatus(
  value: unknown
): value is AgentThreeSmtpStatus {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(AGENT_THREE_SMTP_MESSAGES, value)
  );
}
