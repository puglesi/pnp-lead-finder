import "server-only";

import nodemailer from "nodemailer";
import {
  getAgentThreeSmtpAvailability,
  sendAgentThreeSmtp,
  validateAgentThreeSendRequest,
  verifyAgentThreeSmtpConnection,
  type AgentThreeSmtpTransportFactory,
} from "./agent-three-smtp-core";
import {
  getLocalDatabase,
  type SendIntent,
} from "./local-database";
import type { AgentThreeSmtpResult } from "../agent-three-smtp-contract";
import { resolveAgentThreeSmtpTimeouts } from "../agent-three-timeouts";

const createTransport: AgentThreeSmtpTransportFactory = (options) => {
  const timeouts = resolveAgentThreeSmtpTimeouts(process.env);
  return nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: options.auth,
    connectionTimeout: options.connectionTimeout ?? timeouts.connectionTimeout,
    greetingTimeout: options.greetingTimeout ?? timeouts.greetingTimeout,
    socketTimeout: options.socketTimeout ?? timeouts.socketTimeout,
  });
};

export function getServerAgentThreeSmtpAvailability(operation: unknown) {
  return getAgentThreeSmtpAvailability(operation, process.env);
}

export function verifyServerAgentThreeSmtp(operation: unknown) {
  return verifyAgentThreeSmtpConnection(operation, {
    environment: process.env,
    createTransport,
  });
}

export async function sendServerAgentThreeSmtp(
  input: unknown
): Promise<AgentThreeSmtpResult> {
  if (!validateAgentThreeSendRequest(input)) {
    return sendAgentThreeSmtp(input, {
      environment: process.env,
      createTransport,
    });
  }

  let intent: SendIntent;
  let database: ReturnType<typeof getLocalDatabase>;
  try {
    database = getLocalDatabase();
    intent = database.createSendIntent(input);
    if (intent.existingMessageId) {
      return {
        status: "sent",
        message: "Envio já confirmado no histórico local; duplicata bloqueada.",
        messageId: intent.existingMessageId,
      };
    }
  } catch (error) {
    return {
      status: "configuration_error",
      message:
        "Banco local indisponível — envio real bloqueado antes do SMTP. " +
        (error instanceof Error ? error.message : ""),
    };
  }

  const result = await sendAgentThreeSmtp(input, {
    environment: process.env,
    createTransport,
    isSuppressed: (operation, email) =>
      database.isSuppressed(operation, email),
  });
  if (result.status === "reconciliation_required") {
    return result;
  }
  try {
    database.finishSendIntent(intent, result);
  } catch (error) {
    return {
      status: "transient_error",
      message:
        "O SMTP respondeu, mas a confirmação local falhou. Envio bloqueado para revisão manual. " +
        (error instanceof Error ? error.message : ""),
    };
  }
  return result;
}
