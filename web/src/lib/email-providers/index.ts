import type {
  EmailProvider,
  EmailProviderCredentials,
  EmailProviderId,
  EmailProviderInfo,
  EmailSendMode,
  EmailSendPayload,
  EmailSendResult,
} from "@/types/email-provider";
import { simulateEmailProvider } from "./simulate-provider";
import {
  brevoProvider,
  mailgunProvider,
  resendProvider,
  sendgridProvider,
  sesProvider,
  smtpGmailProvider,
  smtpOutlookProvider,
} from "./stub-provider";

const PROVIDERS: Record<EmailProviderId, EmailProvider> = {
  simulate: simulateEmailProvider,
  mailgun: mailgunProvider,
  resend: resendProvider,
  ses: sesProvider,
  sendgrid: sendgridProvider,
  brevo: brevoProvider,
  "smtp-gmail": smtpGmailProvider,
  "smtp-outlook": smtpOutlookProvider,
};

export const EMAIL_PROVIDER_CATALOG: Omit<EmailProviderInfo, "configured">[] = [
  {
    id: "simulate",
    name: "Simulação",
    description: "Envio simulado para testes",
    docsUrl: "",
    sendMode: "simulate",
  },
  {
    id: "mailgun",
    name: "Mailgun",
    description: "Alta entrega em escala",
    docsUrl: "https://documentation.mailgun.com/",
    sendMode: "paid",
  },
  {
    id: "resend",
    name: "Resend",
    description: "API moderna para transactional email",
    docsUrl: "https://resend.com/docs",
    sendMode: "paid",
  },
  {
    id: "ses",
    name: "Amazon SES",
    description: "Simple Email Service da AWS",
    docsUrl: "https://docs.aws.amazon.com/ses/",
    sendMode: "paid",
  },
  {
    id: "brevo",
    name: "Brevo",
    description: "Envio em massa com boa entregabilidade",
    docsUrl: "https://developers.brevo.com/",
    sendMode: "paid",
  },
  {
    id: "sendgrid",
    name: "SendGrid",
    description: "Twilio SendGrid para outreach",
    docsUrl: "https://docs.sendgrid.com/",
    sendMode: "paid",
  },
  {
    id: "smtp-gmail",
    name: "Gmail",
    description: "Seu Gmail via SMTP (senha de app)",
    docsUrl: "https://support.google.com/accounts/answer/185833",
    sendMode: "autonomous-free",
  },
  {
    id: "smtp-outlook",
    name: "Outlook",
    description: "Seu Outlook/Hotmail via SMTP",
    docsUrl: "https://support.microsoft.com/account-billing/",
    sendMode: "autonomous-free",
  },
];

export function getEmailProvider(id: EmailProviderId): EmailProvider {
  return PROVIDERS[id] ?? simulateEmailProvider;
}

export function listEmailProviders(
  credentials: EmailProviderCredentials,
  mode?: EmailSendMode
): EmailProviderInfo[] {
  return EMAIL_PROVIDER_CATALOG.filter(
    (p) =>
      p.id === "simulate" ||
      !mode ||
      p.sendMode === mode
  ).map((p) => ({
    ...p,
    configured:
      p.id === "simulate" || getEmailProvider(p.id).isConfigured(credentials),
  }));
}

export async function sendViaProvider(
  providerId: EmailProviderId,
  credentials: EmailProviderCredentials,
  payload: EmailSendPayload
): Promise<EmailSendResult> {
  const provider = getEmailProvider(providerId);

  if (providerId === "simulate") {
    return provider.send(payload);
  }

  if (!provider.isConfigured(credentials)) {
    return {
      success: false,
      provider: providerId,
      errorCode: "NOT_CONFIGURED",
      errorMessage: `Provedor ${provider.name} não configurado`,
    };
  }

  const res = await fetch("/api/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerId, credentials, payload }),
  });

  const data = (await res.json().catch(() => ({}))) as EmailSendResult & {
    errorMessage?: string;
    errorCode?: string;
  };

  if (!res.ok && !data.provider) {
    return {
      success: false,
      provider: providerId,
      errorCode: data.errorCode ?? `HTTP_${res.status}`,
      errorMessage: data.errorMessage ?? "Falha na API de envio",
    };
  }

  return data;
}

export {
  simulateEmailProvider,
  mailgunProvider,
  resendProvider,
  sesProvider,
  sendgridProvider,
  brevoProvider,
  smtpGmailProvider,
  smtpOutlookProvider,
};