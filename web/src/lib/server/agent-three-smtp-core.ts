import type { CampaignProfileId } from "../../types/campaign-profile.ts";
import { isCampaignProfileId } from "../../types/campaign-profile.ts";
import {
  AGENT_THREE_SMTP_MESSAGES,
  type AgentThreeSendRequest,
  type AgentThreeSmtpResult,
  type AgentThreeSmtpStatus,
} from "../agent-three-smtp-contract.ts";

const MAX_SUBJECT_LENGTH = 998;
const MAX_HTML_LENGTH = 500_000;
const MAX_TEXT_LENGTH = 250_000;
const MAX_IDENTIFIER_LENGTH = 200;
const MAX_PDF_BASE64_LENGTH = 7_000_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AgentThreeServerEnvironment = Readonly<
  Record<string, string | undefined>
>;

export interface AgentThreeSmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface AgentThreeSmtpMailOptions {
  from: {
    name: string;
    address: string;
  };
  to: string;
  replyTo: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: "application/pdf";
  }>;
}

export interface AgentThreeSmtpTransport {
  sendMail(
    options: AgentThreeSmtpMailOptions
  ): Promise<{ messageId?: string }>;
}

export type AgentThreeSmtpTransportFactory = (
  options: AgentThreeSmtpTransportOptions
) => AgentThreeSmtpTransport;

export interface AgentThreeSmtpDependencies {
  environment: AgentThreeServerEnvironment;
  createTransport: AgentThreeSmtpTransportFactory;
  isSuppressed?: (
    operation: CampaignProfileId,
    normalizedRecipient: string
  ) => boolean | Promise<boolean>;
}

interface AgentThreeResolvedSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  replyTo: string;
}

interface SmtpErrorShape {
  code?: unknown;
  responseCode?: unknown;
  message?: unknown;
}

function result(
  status: AgentThreeSmtpStatus,
  messageId?: string
): AgentThreeSmtpResult {
  return {
    status,
    message: AGENT_THREE_SMTP_MESSAGES[status],
    ...(messageId ? { messageId } : {}),
  };
}

function trimmed(
  environment: AgentThreeServerEnvironment,
  key: string
): string {
  return environment[key]?.trim() ?? "";
}

function parsePort(value: string): number | null {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65_535
    ? port
    : null;
}

function parseSecure(value: string): boolean | null {
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return null;
}

function getEnvironmentPrefix(operation: CampaignProfileId): string {
  return operation === "panek-puglesi" ? "PNP" : "MODECLEAN";
}

function resolveSmtpConfig(
  operation: CampaignProfileId,
  environment: AgentThreeServerEnvironment
): AgentThreeResolvedSmtpConfig | null {
  const prefix = getEnvironmentPrefix(operation);
  const host = trimmed(environment, `${prefix}_SMTP_HOST`);
  const port = parsePort(trimmed(environment, `${prefix}_SMTP_PORT`));
  const secure = parseSecure(trimmed(environment, `${prefix}_SMTP_SECURE`));
  const user = trimmed(environment, `${prefix}_SMTP_USER`);
  const password = trimmed(environment, `${prefix}_SMTP_APP_PASSWORD`);
  const fromName = trimmed(environment, `${prefix}_FROM_NAME`);
  const replyTo = trimmed(environment, `${prefix}_REPLY_TO`);

  if (
    !host ||
    port === null ||
    secure === null ||
    !EMAIL_PATTERN.test(user) ||
    !password ||
    !fromName ||
    !EMAIL_PATTERN.test(replyTo)
  ) {
    return null;
  }

  return {
    host,
    port,
    secure,
    user,
    password,
    fromName,
    replyTo,
  };
}

function hasSafeIdentifier(value: string | undefined): boolean {
  return value === undefined || value.length <= MAX_IDENTIFIER_LENGTH;
}

function isValidBase64(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_PDF_BASE64_LENGTH &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}

export function validateAgentThreeSendRequest(
  input: unknown
): input is AgentThreeSendRequest {
  if (typeof input !== "object" || input === null) return false;
  const value = input as Record<string, unknown>;
  if (!isCampaignProfileId(value.operation)) return false;
  if (
    typeof value.recipient !== "string" ||
    value.recipient.length > 254 ||
    !EMAIL_PATTERN.test(value.recipient.trim())
  ) {
    return false;
  }
  if (
    typeof value.subject !== "string" ||
    !value.subject.trim() ||
    value.subject.length > MAX_SUBJECT_LENGTH
  ) {
    return false;
  }

  const html = typeof value.html === "string" ? value.html : undefined;
  const text = typeof value.text === "string" ? value.text : undefined;
  if (
    (!html?.trim() && !text?.trim()) ||
    (html?.length ?? 0) > MAX_HTML_LENGTH ||
    (text?.length ?? 0) > MAX_TEXT_LENGTH
  ) {
    return false;
  }
  if (
    !hasSafeIdentifier(
      typeof value.campaignId === "string" ? value.campaignId : undefined
    ) ||
    !hasSafeIdentifier(
      typeof value.leadId === "string" ? value.leadId : undefined
    ) ||
    !hasSafeIdentifier(
      typeof value.queueItemId === "string" ? value.queueItemId : undefined
    )
  ) {
    return false;
  }
  for (const key of ["campaignId", "leadId", "queueItemId"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string") return false;
  }

  if (value.attachment !== undefined) {
    if (typeof value.attachment !== "object" || value.attachment === null) {
      return false;
    }
    const attachment = value.attachment as Record<string, unknown>;
    if (
      typeof attachment.filename !== "string" ||
      !attachment.filename.trim() ||
      attachment.filename.length > 180 ||
      /[\\/\u0000-\u001f]/.test(attachment.filename) ||
      attachment.mimeType !== "application/pdf" ||
      typeof attachment.contentBase64 !== "string" ||
      !isValidBase64(attachment.contentBase64)
    ) {
      return false;
    }
  }
  return true;
}

function defaultSuppressionCheck(
  environment: AgentThreeServerEnvironment,
  normalizedRecipient: string
): boolean {
  const entries = trimmed(environment, "AGENT3_SUPPRESSION_LIST")
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return entries.includes(normalizedRecipient);
}

function errorShape(error: unknown): SmtpErrorShape {
  return typeof error === "object" && error !== null
    ? (error as SmtpErrorShape)
    : {};
}

export function classifyAgentThreeSmtpError(
  error: unknown
): Exclude<
  AgentThreeSmtpStatus,
  | "real_send_disabled"
  | "configuration_error"
  | "connected"
  | "invalid_request"
  | "suppressed"
  | "sent"
> {
  const shape = errorShape(error);
  const code = typeof shape.code === "string" ? shape.code.toUpperCase() : "";
  const responseCode =
    typeof shape.responseCode === "number" ? shape.responseCode : 0;
  const message =
    typeof shape.message === "string" ? shape.message.toLowerCase() : "";

  if (code === "EAUTH" || responseCode === 534 || responseCode === 535) {
    return "authentication_error";
  }
  if (
    responseCode === 421 ||
    responseCode === 454 ||
    /\b(rate|quota|too many|limit exceeded)\b/i.test(message)
  ) {
    return "provider_rate_limit";
  }
  if (
    (responseCode === 550 || responseCode === 554) &&
    /\b(account|user).*(blocked|disabled|suspended)\b/i.test(message)
  ) {
    return "provider_account_blocked";
  }
  if (
    (responseCode >= 400 && responseCode < 500) ||
    new Set([
      "ECONNECTION",
      "ETIMEDOUT",
      "ECONNRESET",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "EDNS",
    ]).has(code)
  ) {
    return "transient_error";
  }
  return "permanent_error";
}

export function getAgentThreeSmtpAvailability(
  operation: unknown,
  environment: AgentThreeServerEnvironment
): AgentThreeSmtpResult {
  if (!isCampaignProfileId(operation)) return result("invalid_request");
  if (
    trimmed(environment, "AGENT3_REAL_SEND_ENABLED").toLowerCase() !== "true"
  ) {
    return result("real_send_disabled");
  }
  return resolveSmtpConfig(operation, environment)
    ? result("connected")
    : result("configuration_error");
}

export async function sendAgentThreeSmtp(
  input: unknown,
  dependencies: AgentThreeSmtpDependencies
): Promise<AgentThreeSmtpResult> {
  const availability =
    typeof input === "object" && input !== null
      ? getAgentThreeSmtpAvailability(
          (input as Record<string, unknown>).operation,
          dependencies.environment
        )
      : result("invalid_request");
  if (availability.status !== "connected") return availability;
  if (!validateAgentThreeSendRequest(input)) return result("invalid_request");

  const normalizedRecipient = input.recipient.trim().toLowerCase();
  const suppressed = dependencies.isSuppressed
    ? await dependencies.isSuppressed(input.operation, normalizedRecipient)
    : defaultSuppressionCheck(
        dependencies.environment,
        normalizedRecipient
      );
  if (suppressed) return result("suppressed");

  const config = resolveSmtpConfig(input.operation, dependencies.environment);
  if (!config) return result("configuration_error");

  try {
    const transport = dependencies.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.password,
      },
    });
    const info = await transport.sendMail({
      from: {
        name: config.fromName,
        address: config.user,
      },
      to: normalizedRecipient,
      replyTo: config.replyTo,
      subject: input.subject.trim(),
      html: input.html,
      text: input.text,
      attachments: input.attachment
        ? [
            {
              filename: input.attachment.filename,
              content: Buffer.from(input.attachment.contentBase64, "base64"),
              contentType: "application/pdf",
            },
          ]
        : undefined,
    });
    return result("sent", info.messageId);
  } catch (error) {
    return result(classifyAgentThreeSmtpError(error));
  }
}
