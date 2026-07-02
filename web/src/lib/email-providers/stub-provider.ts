import type {
  EmailProvider,
  EmailProviderCredentials,
  EmailSendPayload,
  EmailSendResult,
} from "@/types/email-provider";

export function createStubProvider(
  id: EmailProvider["id"],
  name: string,
  configKeys: (keyof EmailProviderCredentials)[]
): EmailProvider {
  return {
    id,
    name,

    isConfigured(credentials) {
      return configKeys.every((k) => Boolean(credentials[k]?.trim()));
    },

    async send(payload: EmailSendPayload): Promise<EmailSendResult> {
      return {
        success: false,
        provider: id,
        errorCode: "NOT_CONFIGURED",
        errorMessage: `${name} não configurado. Adicione credenciais em Configurações → Email.`,
      };
    },
  };
}

export const mailgunProvider = createStubProvider("mailgun", "Mailgun", [
  "mailgunApiKey",
  "mailgunDomain",
]);

export const resendProvider = createStubProvider("resend", "Resend", [
  "resendApiKey",
]);

export const sesProvider = createStubProvider("ses", "Amazon SES", [
  "sesAccessKey",
  "sesSecretKey",
  "sesRegion",
]);

export const sendgridProvider = createStubProvider("sendgrid", "SendGrid", [
  "sendgridApiKey",
]);

export const brevoProvider = createStubProvider("brevo", "Brevo", ["brevoApiKey"]);

export const smtpGmailProvider = createStubProvider("smtp-gmail", "Gmail SMTP", [
  "smtpEmail",
  "smtpPassword",
]);

export const smtpOutlookProvider = createStubProvider("smtp-outlook", "Outlook SMTP", [
  "smtpEmail",
  "smtpPassword",
]);