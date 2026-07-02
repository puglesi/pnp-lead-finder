export type EmailSendMode = "paid" | "autonomous-free";

export type EmailProviderId =
  | "simulate"
  | "mailgun"
  | "resend"
  | "ses"
  | "sendgrid"
  | "brevo"
  | "smtp-gmail"
  | "smtp-outlook";

export interface EmailProviderInfo {
  id: EmailProviderId;
  name: string;
  description: string;
  docsUrl: string;
  configured: boolean;
  sendMode: EmailSendMode | "simulate";
}

export interface EmailAttachmentPayload {
  filename: string;
  mimeType: string;
  content: string;
}

export interface EmailSendPayload {
  to: string;
  toName?: string;
  from: string;
  fromName: string;
  replyTo: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachmentPayload[];
  tags?: string[];
  campaignId?: string;
  leadId?: string;
}

export interface EmailSendResult {
  success: boolean;
  provider: EmailProviderId;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
  durationMs?: number;
}

export interface EmailProviderCredentials {
  mailgunApiKey?: string;
  mailgunDomain?: string;
  resendApiKey?: string;
  sesAccessKey?: string;
  sesSecretKey?: string;
  sesRegion?: string;
  sendgridApiKey?: string;
  brevoApiKey?: string;
  smtpEmail?: string;
  smtpPassword?: string;
}

export interface EmailProvider {
  id: EmailProviderId;
  name: string;
  send(payload: EmailSendPayload): Promise<EmailSendResult>;
  isConfigured(credentials: EmailProviderCredentials): boolean;
}