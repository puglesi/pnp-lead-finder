import type { CampaignProfileId } from "../types/campaign-profile.ts";
import type { Lead } from "../types/lead.ts";
import { normalizeEmail } from "./email-validation.ts";
import { isAgentThreeItemEligible } from "./agent-three-queue.ts";
import type { EmailValidationStatus } from "../types/email-validation.ts";

export type OneClickStage =
  | "config"
  | "searching"
  | "enriching"
  | "validating"
  | "review"
  | "creating_campaign"
  | "smtp_preflight"
  | "sending"
  | "completed"
  | "interrupted"
  | "paused";

export type OneClickControl = "running" | "paused" | "stopped";

export interface OneClickConfig {
  operation: CampaignProfileId;
  sector: string;
  location: string;
  quantity: number;
  templateId: string;
  templateKind: "library";
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
}

export interface OneClickProgress {
  stage: OneClickStage;
  control: OneClickControl;
  batchId: string | null;
  campaignId: string | null;
  currentCompany: string | null;
  foundCount: number;
  withWebsiteCount: number;
  withEmailCount: number;
  eligibleCount: number;
  duplicatesRemoved: number;
  withoutEmailCount: number;
  sentCount: number;
  failedCount: number;
  remainingCount: number;
  totalRecipients: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
  stageLabel: string;
  errorMessage: string | null;
  stopReason: string | null;
  interruptedStage: OneClickStage | null;
}

export interface OneClickReport {
  batchId: string | null;
  campaignId: string | null;
  operation: CampaignProfileId;
  sector: string;
  location: string;
  templateName: string;
  subject: string;
  body: string;
  foundCount: number;
  withWebsiteCount: number;
  withEmailCount: number;
  eligibleCount: number;
  duplicatesRemoved: number;
  withoutEmailCount: number;
  sentCount: number;
  failedCount: number;
  failures: Array<{ email: string; company: string; reason: string }>;
  durationMs: number;
  completed: boolean;
  interrupted: boolean;
  interruptedStage: OneClickStage | null;
  stopReason: string | null;
}

export interface OneClickCheckpoint {
  version: 1;
  config: OneClickConfig;
  batchId: string;
  campaignId: string | null;
  stage: OneClickStage;
  leadIds: string[];
  eligibleLeadIds: string[];
  duplicatesRemoved: number;
  foundCount: number;
  withWebsiteCount: number;
  withEmailCount: number;
  withoutEmailCount: number;
  startedAt: string;
  control: OneClickControl;
  stopReason: string | null;
}

export const ONE_CLICK_CHECKPOINT_KEY = "pnp-one-click-checkpoint";

export const ONE_CLICK_STAGE_LABELS: Record<OneClickStage, string> = {
  config: "Configuração",
  searching: "Buscando empresas",
  enriching: "Enriquecendo websites e e-mails",
  validating: "Validando e-mails (sintaxe, domínio, MX)",
  review: "Revisão obrigatória de destinatários",
  creating_campaign: "Criando campanha",
  smtp_preflight: "Verificando SMTP",
  sending: "Enviando (Agente 3)",
  completed: "Concluído",
  interrupted: "Interrompido",
  paused: "Pausado",
};

export function createEmptyOneClickProgress(): OneClickProgress {
  return {
    stage: "config",
    control: "stopped",
    batchId: null,
    campaignId: null,
    currentCompany: null,
    foundCount: 0,
    withWebsiteCount: 0,
    withEmailCount: 0,
    eligibleCount: 0,
    duplicatesRemoved: 0,
    withoutEmailCount: 0,
    sentCount: 0,
    failedCount: 0,
    remainingCount: 0,
    totalRecipients: 0,
    elapsedMs: 0,
    estimatedRemainingMs: 0,
    stageLabel: ONE_CLICK_STAGE_LABELS.config,
    errorMessage: null,
    stopReason: null,
    interruptedStage: null,
  };
}

export function clampOneClickQuantity(value: number): number {
  if (!Number.isFinite(value)) return 25;
  return Math.min(200, Math.max(1, Math.floor(value)));
}

export function clampOneClickInterval(
  minSeconds: number,
  maxSeconds: number
): { minIntervalSeconds: number; maxIntervalSeconds: number } {
  const min = Math.max(0, Math.floor(Number.isFinite(minSeconds) ? minSeconds : 0));
  const max = Math.max(
    min,
    Math.floor(Number.isFinite(maxSeconds) ? maxSeconds : min)
  );
  return { minIntervalSeconds: min, maxIntervalSeconds: max };
}

export function hasUsableWebsite(website: string | null | undefined): boolean {
  const trimmed = (website ?? "").trim();
  return Boolean(trimmed && trimmed !== "—");
}

export function hasUsableEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  return Boolean(normalized);
}

export function countLeadsWithWebsite(leads: readonly Lead[]): number {
  return leads.filter((lead) => hasUsableWebsite(lead.website)).length;
}

export function countLeadsWithEmail(leads: readonly Lead[]): number {
  return leads.filter((lead) => hasUsableEmail(lead.email)).length;
}

/**
 * Deduplicate by normalized email (case-insensitive). Leads without email are kept.
 * First occurrence wins. Returns unique leads + removed count.
 */
export function dedupeLeadsByEmail(leads: readonly Lead[]): {
  leads: Lead[];
  duplicatesRemoved: number;
} {
  const seen = new Set<string>();
  const unique: Lead[] = [];
  let duplicatesRemoved = 0;
  for (const lead of leads) {
    const email = normalizeEmail(lead.email);
    if (!email) {
      unique.push(lead);
      continue;
    }
    if (seen.has(email)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(email);
    unique.push(lead);
  }
  return { leads: unique, duplicatesRemoved };
}

/** Eligibility mirror of Agent 3: valid or unknown+mailbox_not_verified or MX present. */
export function isOneClickEligibleLead(lead: Lead): boolean {
  const item = {
    id: lead.id,
    leadId: lead.id,
    campaignProfileId: "panek-puglesi" as const,
    companyName: lead.company,
    originalEmail: lead.email,
    normalizedEmail: normalizeEmail(lead.normalizedEmail) ?? normalizeEmail(lead.email),
    sector: lead.category ?? "",
    location: lead.address ?? "",
    validationStatus: (lead.emailValidationStatus ??
      "pending") as EmailValidationStatus,
    validationReason: lead.emailValidationReason ?? "",
    emailDomain: lead.emailDomain,
    hasMxRecords: lead.hasMxRecords,
    queueStatus: "pending" as const,
    createdAt: "",
    updatedAt: "",
    attemptCount: 0,
    synthetic: lead.synthetic === true,
    emailIsGuessed: lead.emailIsGuessed === true,
    emailSourceUrl: lead.emailSourceUrl ?? null,
  };
  return isAgentThreeItemEligible(item);
}

export function selectOneClickEligibleLeads(leads: readonly Lead[]): Lead[] {
  return leads.filter(isOneClickEligibleLead);
}

export function buildOneClickCampaignName(
  sector: string,
  location: string
): string {
  return `${sector.trim()} · ${location.trim()}`;
}

export function buildOneClickReport(input: {
  config: OneClickConfig;
  progress: OneClickProgress;
  failures?: Array<{ email: string; company: string; reason: string }>;
  template?: { name: string; subject: string; body: string };
}): OneClickReport {
  const { config, progress, failures = [], template } = input;
  return {
    batchId: progress.batchId,
    campaignId: progress.campaignId,
    operation: config.operation,
    sector: config.sector,
    location: config.location,
    templateName: template?.name ?? "",
    subject: template?.subject ?? "",
    body: template?.body ?? "",
    foundCount: progress.foundCount,
    withWebsiteCount: progress.withWebsiteCount,
    withEmailCount: progress.withEmailCount,
    eligibleCount: progress.eligibleCount,
    duplicatesRemoved: progress.duplicatesRemoved,
    withoutEmailCount: progress.withoutEmailCount,
    sentCount: progress.sentCount,
    failedCount: progress.failedCount,
    failures,
    durationMs: progress.elapsedMs,
    completed: progress.stage === "completed",
    interrupted:
      progress.stage === "interrupted" || Boolean(progress.stopReason),
    interruptedStage: progress.interruptedStage,
    stopReason: progress.stopReason,
  };
}

export function estimateRemainingMs(input: {
  sentCount: number;
  failedCount: number;
  totalRecipients: number;
  elapsedMs: number;
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
}): number {
  const processed = input.sentCount + input.failedCount;
  const remaining = Math.max(0, input.totalRecipients - processed);
  if (remaining === 0) return 0;
  if (processed > 0 && input.elapsedMs > 0) {
    return Math.round((input.elapsedMs / processed) * remaining);
  }
  const avgInterval =
    ((input.minIntervalSeconds + input.maxIntervalSeconds) / 2) * 1000;
  return Math.round(remaining * Math.max(avgInterval, 500));
}

export function serializeOneClickCheckpoint(
  checkpoint: OneClickCheckpoint
): string {
  return JSON.stringify(checkpoint);
}

export function parseOneClickCheckpoint(
  raw: string | null | undefined
): OneClickCheckpoint | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (
      typeof value !== "object" ||
      value === null ||
      (value as OneClickCheckpoint).version !== 1
    ) {
      return null;
    }
    const c = value as OneClickCheckpoint;
    if (
      typeof c.batchId !== "string" ||
      typeof c.config?.sector !== "string" ||
      typeof c.config?.location !== "string"
    ) {
      return null;
    }
    return c;
  } catch {
    return null;
  }
}

/**
 * True when a campaign already has confirmed deliveries for every remaining queue
 * item — resume must not re-send providerMessageId-confirmed recipients.
 */
export function shouldSkipResendForConfirmedDelivery(
  providerMessageId: string | undefined | null
): boolean {
  if (!providerMessageId) return false;
  const id = String(providerMessageId).trim();
  if (!id) return false;
  if (id.startsWith("sim-")) return false;
  return true;
}
