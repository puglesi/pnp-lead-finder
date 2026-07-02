import type { EmailProviderId, EmailSendMode } from "@/types/email-provider";

export const PAID_PROVIDER_IDS = [
  "mailgun",
  "resend",
  "ses",
  "sendgrid",
  "brevo",
] as const satisfies readonly EmailProviderId[];

export const AUTONOMOUS_PROVIDER_IDS = [
  "smtp-gmail",
  "smtp-outlook",
] as const satisfies readonly EmailProviderId[];

export function isPaidProvider(id: EmailProviderId): boolean {
  return (PAID_PROVIDER_IDS as readonly string[]).includes(id);
}

export function isAutonomousProvider(id: EmailProviderId): boolean {
  return (AUTONOMOUS_PROVIDER_IDS as readonly string[]).includes(id);
}

export function getProviderSendMode(id: EmailProviderId): EmailSendMode | "simulate" {
  if (id === "simulate") return "simulate";
  if (isAutonomousProvider(id)) return "autonomous-free";
  return "paid";
}

export function defaultProviderForMode(mode: EmailSendMode): EmailProviderId {
  return mode === "autonomous-free" ? "smtp-gmail" : "resend";
}