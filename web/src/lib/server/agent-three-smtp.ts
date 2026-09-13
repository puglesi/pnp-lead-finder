import "server-only";

import nodemailer from "nodemailer";
import {
  getAgentThreeSmtpAvailability,
  verifyAgentThreeSmtpConnection,
  type AgentThreeSmtpTransport,
  type AgentThreeSmtpTransportFactory,
} from "./agent-three-smtp-core";
import { getLocalDatabase } from "./local-database";
import type { AgentThreeSmtpResult } from "../agent-three-smtp-contract";
import { resolveAgentThreeSmtpTimeouts } from "../agent-three-timeouts";
import { executeAgentThreeSendWithLease } from "./agent-three-send-pipeline";

const pooledTransports = new Map<string, AgentThreeSmtpTransport>();

function transportPoolKey(
  options: Parameters<AgentThreeSmtpTransportFactory>[0]
): string {
  return [options.host, String(options.port), options.secure ? "s" : "p", options.auth.user].join("|");
}

const createTransport: AgentThreeSmtpTransportFactory = (options) => {
  const key = transportPoolKey(options);
  const existing = pooledTransports.get(key);
  if (existing) return existing;
  const timeouts = resolveAgentThreeSmtpTimeouts(process.env);
  const raw = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: options.auth,
    pool: true,
    maxConnections: 1,
    maxMessages: Infinity,
    connectionTimeout: options.connectionTimeout ?? timeouts.connectionTimeout,
    greetingTimeout: options.greetingTimeout ?? timeouts.greetingTimeout,
    socketTimeout: options.socketTimeout ?? timeouts.socketTimeout,
  });
  const wrapped: AgentThreeSmtpTransport = {
    async sendMail(mail) {
      try {
        return await raw.sendMail(mail);
      } catch (error) {
        pooledTransports.delete(key);
        try {
          raw.close();
        } catch {
          // Keep the original SMTP error.
        }
        throw error;
      }
    },
    async verify() {
      try {
        return await raw.verify();
      } catch (error) {
        pooledTransports.delete(key);
        try {
          raw.close();
        } catch {
          // Keep the original SMTP error.
        }
        throw error;
      }
    },
  };
  pooledTransports.set(key, wrapped);
  return wrapped;
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
  let database: ReturnType<typeof getLocalDatabase>;
  try {
    database = getLocalDatabase();
  } catch (error) {
    return {
      status: "configuration_error",
      message:
        "Banco local indisponível — envio real bloqueado antes do SMTP. " +
        (error instanceof Error ? error.message : ""),
    };
  }
  return executeAgentThreeSendWithLease(input, {
    environment: process.env,
    createTransport,
    database,
  });
}
