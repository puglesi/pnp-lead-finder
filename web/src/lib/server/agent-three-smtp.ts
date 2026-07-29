import "server-only";

import nodemailer from "nodemailer";
import {
  getAgentThreeSmtpAvailability,
  sendAgentThreeSmtp,
  type AgentThreeSmtpTransportFactory,
} from "./agent-three-smtp-core";

const createTransport: AgentThreeSmtpTransportFactory = (options) =>
  nodemailer.createTransport(options);

export function getServerAgentThreeSmtpAvailability(operation: unknown) {
  return getAgentThreeSmtpAvailability(operation, process.env);
}

export function sendServerAgentThreeSmtp(input: unknown) {
  return sendAgentThreeSmtp(input, {
    environment: process.env,
    createTransport,
  });
}
