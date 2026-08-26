import {
  AGENT_THREE_SMTP_MESSAGES,
  isAgentThreeSmtpStatus,
  type AgentThreeSendRequest,
  type AgentThreeSmtpDiagnostics,
  type AgentThreeSmtpResult,
} from "./agent-three-smtp-contract.ts";
import type { CampaignProfileId } from "../types/campaign-profile.ts";
import type { AgentThreePersistedSendRecord } from "./agent-three-reconciliation.ts";
import { AGENT_THREE_SEND_HTTP_TIMEOUT_MS } from "./agent-three-timeouts.ts";

function parseDiagnostics(value: unknown): AgentThreeSmtpDiagnostics | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.realSendEnabled !== "boolean") return undefined;
  if (typeof record.operation !== "string") return undefined;
  const missingEnvVars = Array.isArray(record.missingEnvVars)
    ? record.missingEnvVars.filter((item): item is string => typeof item === "string")
    : [];
  return {
    realSendEnabled: record.realSendEnabled,
    missingEnvVars,
    operation: record.operation,
    ...(typeof record.verifiedLive === "boolean"
      ? { verifiedLive: record.verifiedLive }
      : {}),
  };
}

function safeApiResult(value: unknown): AgentThreeSmtpResult {
  if (typeof value !== "object" || value === null) {
    return {
      status: "transient_error",
      message: AGENT_THREE_SMTP_MESSAGES.transient_error,
    };
  }
  const record = value as Record<string, unknown>;
  if (!isAgentThreeSmtpStatus(record.status)) {
    return {
      status: "transient_error",
      message: AGENT_THREE_SMTP_MESSAGES.transient_error,
    };
  }
  // Prefer server human message when present (specific cause).
  const serverMessage =
    typeof record.message === "string" && record.message.trim()
      ? record.message.trim()
      : AGENT_THREE_SMTP_MESSAGES[record.status];
  return {
    status: record.status,
    message: serverMessage,
    ...(typeof record.messageId === "string" && record.messageId
      ? { messageId: record.messageId }
      : {}),
    ...(parseDiagnostics(record.diagnostics)
      ? { diagnostics: parseDiagnostics(record.diagnostics) }
      : {}),
  };
}

async function readResult(response: Response): Promise<AgentThreeSmtpResult> {
  try {
    return safeApiResult(await response.json());
  } catch {
    return {
      status: "transient_error",
      message: AGENT_THREE_SMTP_MESSAGES.transient_error,
    };
  }
}

export async function checkAgentThreeSmtpAvailability(
  operation: CampaignProfileId,
  options: { verify?: boolean } = {}
): Promise<AgentThreeSmtpResult> {
  try {
    const params = new URLSearchParams({ operation });
    if (options.verify) params.set("verify", "1");
    const response = await fetch(`/api/agent-3/send?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
    });
    return readResult(response);
  } catch {
    return {
      status: "transient_error",
      message: AGENT_THREE_SMTP_MESSAGES.transient_error,
    };
  }
}

export async function requestAgentThreeSmtpSend(
  request: AgentThreeSendRequest
): Promise<AgentThreeSmtpResult> {
  try {
    const response = await fetch("/api/agent-3/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(AGENT_THREE_SEND_HTTP_TIMEOUT_MS),
    });
    return readResult(response);
  } catch (error) {
    const timedOut =
      (error instanceof DOMException && error.name === "TimeoutError") ||
      (error instanceof Error && error.name === "AbortError");
    return {
      status: timedOut ? "reconciliation_required" : "transient_error",
      message: timedOut
        ? AGENT_THREE_SMTP_MESSAGES.reconciliation_required
        : AGENT_THREE_SMTP_MESSAGES.transient_error,
    };
  }
}

export async function fetchAgentThreeSendHistory(input: {
  operation: CampaignProfileId;
  campaignId?: string | null;
}): Promise<AgentThreePersistedSendRecord[]> {
  try {
    const params = new URLSearchParams({ operation: input.operation });
    if (input.campaignId) params.set("campaignId", input.campaignId);
    const response = await fetch(`/api/agent-3/history?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const body = (await response.json().catch(() => null)) as {
      sends?: AgentThreePersistedSendRecord[];
    } | null;
    return Array.isArray(body?.sends) ? body.sends : [];
  } catch {
    return [];
  }
}
