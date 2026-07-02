import type { EmailProviderId } from "@/types/email-provider";
import { DEFAULT_SIGNATURE_HTML } from "@/lib/signature-template";

export type CampaignStatus = "draft" | "active" | "paused" | "completed";
export type CampaignLeadSource = "saved" | "recent" | "mixed" | "imported";

export interface CampaignAttachment {
  name: string;
  mimeType: string;
  dataUrl: string;
  sizeBytes: number;
}

export type CampaignLeadEventStatus =
  | "pending"
  | "sent"
  | "failed"
  | "opened"
  | "clicked"
  | "replied";

export interface CampaignLeadStatus {
  leadId: string;
  status: CampaignLeadEventStatus;
  sentAt?: string;
  openedAt?: string;
  clickedAt?: string;
  repliedAt?: string;
  errorMessage?: string;
  errorCode?: string;
  providerMessageId?: string;
}

export interface CampaignBatchSendConfig {
  batchSize: number;
  delayBetweenBatchesMs: number;
  delayBetweenEmailsMs: number;
  autoSaveSentLeads: boolean;
  /** 0 = sem limite (serviços pagos). Modo autônomo: máx. por dia. */
  dailyLimit: number;
}

export interface CampaignSendError {
  id: string;
  leadId: string;
  email: string;
  company: string;
  errorCode: string;
  errorMessage: string;
  provider: string;
  occurredAt: string;
  batchNumber: number;
}

export const DEFAULT_BATCH_SEND_CONFIG: CampaignBatchSendConfig = {
  batchSize: 75,
  delayBetweenBatchesMs: 30_000,
  delayBetweenEmailsMs: 400,
  autoSaveSentLeads: true,
  dailyLimit: 0,
};

export const DEFAULT_AUTONOMOUS_BATCH_CONFIG: CampaignBatchSendConfig = {
  batchSize: 10,
  delayBetweenBatchesMs: 120_000,
  delayBetweenEmailsMs: 3_000,
  autoSaveSentLeads: true,
  dailyLimit: 100,
};

export const BATCH_SIZE_MIN = 50;
export const BATCH_SIZE_MAX = 100;
export const AUTONOMOUS_BATCH_SIZE_MIN = 5;
export const AUTONOMOUS_BATCH_SIZE_MAX = 25;
export const AUTONOMOUS_DAILY_LIMIT_MIN = 20;
export const AUTONOMOUS_DAILY_LIMIT_MAX = 500;

export interface CampaignSendConfig {
  fromName: string;
  fromEmail: string;
  replyTo: string;
  unsubscribeLink: string;
}

export interface CampaignFollowUp {
  enabled: boolean;
  delayDays: number;
  subject: string;
  body: string;
}

export interface CampaignSignature {
  enabled: boolean;
  body: string;
}

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  body: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  unsubscribeLink: string;
  followUp: CampaignFollowUp;
  leadIds: string[];
  leadStatuses: CampaignLeadStatus[];
  leadSource: CampaignLeadSource;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
  sentCount: number;
  openedCount: number;
  clickedCount: number;
  repliedCount: number;
  attachment?: CampaignAttachment | null;
  signature: CampaignSignature;
  batchSend: CampaignBatchSendConfig;
  sendErrors: CampaignSendError[];
  failedCount: number;
  emailProvider: EmailProviderId;
}

export type CampaignSendPhase =
  | "sending"
  | "batch_delay"
  | "paused"
  | "opens"
  | "clicks"
  | "replies"
  | "followup";

export interface CampaignSendingProgress {
  campaignId: string;
  currentIndex: number;
  total: number;
  currentLeadLabel: string;
  phase: CampaignSendPhase;
  currentBatch: number;
  totalBatches: number;
  batchSize: number;
  sentInBatch: number;
  successCount: number;
  failedCount: number;
  paused: boolean;
  provider: EmailProviderId;
  startedAt: string;
  elapsedMs: number;
  estimatedRemainingMs: number;
  nextBatchInMs?: number;
}

export interface CampaignStats {
  total: number;
  active: number;
  draft: number;
  completed: number;
  totalSent: number;
}

export const DEFAULT_UNSUBSCRIBE_LINK =
  "https://panekpuglesi.co.uk/unsubscribe?email={{email}}";

export const DEFAULT_FOLLOW_UP: CampaignFollowUp = {
  enabled: false,
  delayDays: 3,
  subject: "Re: {{company}} — seguindo nossa proposta",
  body: `<p>Olá <strong>{{name}}</strong>,</p>
<p>Espero que estejam bem. Escrevo para dar seguimento à nossa mensagem anterior sobre uma possível parceria com <strong>{{company}}</strong>.</p>
<p>Ainda temos interesse em conversar. Responda quando for conveniente.</p>
<p>Obrigado,<br>Equipe Panek Pugliesi</p>`,
};

export const DEFAULT_SIGNATURE_BODY = DEFAULT_SIGNATURE_HTML;

export const DEFAULT_SIGNATURE: CampaignSignature = {
  enabled: true,
  body: DEFAULT_SIGNATURE_BODY,
};

export const DEFAULT_CAMPAIGN_SEND_CONFIG: CampaignSendConfig = {
  fromName: "Panek Pugliesi",
  fromEmail: "outreach@panekpuglesi.co.uk",
  replyTo: "info@panekpuglesi.co.uk",
  unsubscribeLink: DEFAULT_UNSUBSCRIBE_LINK,
};

export function initLeadStatuses(leadIds: string[]): CampaignLeadStatus[] {
  return leadIds.map((leadId) => ({ leadId, status: "pending" }));
}