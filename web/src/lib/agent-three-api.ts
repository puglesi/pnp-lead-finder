import {
  AGENT_THREE_SMTP_MESSAGES,
  isAgentThreeSmtpStatus,
  type AgentThreeSendRequest,
  type AgentThreeSmtpResult,
} from "./agent-three-smtp-contract.ts";
import type { CampaignProfileId } from "../types/campaign-profile.ts";

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
  return {
    status: record.status,
    message: AGENT_THREE_SMTP_MESSAGES[record.status],
    ...(typeof record.messageId === "string" && record.messageId
      ? { messageId: record.messageId }
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
    });
    return readResult(response);
  } catch {
    return {
      status: "transient_error",
      message: AGENT_THREE_SMTP_MESSAGES.transient_error,
    };
  }
}
