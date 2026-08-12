import type { Campaign } from "../types/campaign.ts";
import type { CampaignProfileId } from "../types/campaign-profile.ts";
import type { Lead } from "../types/lead.ts";
import type {
  AgentThreeOperationState,
  AgentThreeQueueItem,
} from "./agent-three-queue.ts";
import {
  isConfirmedCampaignDelivery,
  isRealDeliveryMessageId,
} from "./campaign-delivery-metrics.ts";
import { normalizeEmail } from "./email-validation.ts";
import { asArray, safeObjectValues } from "./safe-object.ts";

export type EmailContactKind = "first_contact" | "follow_up";
export type PermanentContactBlockReason =
  | "unsubscribed"
  | "permanent_bounce"
  | "contact_blocked";

export interface GlobalEmailHistoryRecord {
  operation: CampaignProfileId;
  normalizedEmail: string;
  campaignId: string;
  campaignName: string;
  sentAt: string;
  providerMessageId: string;
}

export interface PermanentContactBlock {
  operation: CampaignProfileId;
  normalizedEmail: string;
  reason: PermanentContactBlockReason;
  occurredAt: string;
}

export interface GlobalDeduplicationRecipient {
  leadId: string;
  company: string;
  email: string | null | undefined;
}

export type GlobalDeduplicationDecisionCode =
  | "new_recipient"
  | "follow_up_authorized"
  | "duplicate_in_batch"
  | "same_operation_contacted"
  | "already_sent_current_campaign"
  | "permanently_blocked"
  | "invalid_email";

export interface GlobalDeduplicationDecision {
  leadId: string;
  company: string;
  originalEmail: string | null;
  normalizedEmail: string | null;
  included: boolean;
  code: GlobalDeduplicationDecisionCode;
  reason: string;
  previousContact: GlobalEmailHistoryRecord | null;
  otherOperationContact: GlobalEmailHistoryRecord | null;
}

export interface GlobalDeduplicationPreview {
  operation: CampaignProfileId;
  campaignId: string;
  contactKind: EmailContactKind;
  companiesFound: number;
  contactsWithEmail: number;
  duplicatesInBatch: number;
  alreadyContactedSameOperation: number;
  blockedContacts: number;
  otherOperationWarnings: number;
  newRecipients: number;
  authorizedFollowUps: number;
  finalSendCount: number;
  decisions: GlobalDeduplicationDecision[];
}

interface BuildEvidenceInput {
  campaigns: readonly Campaign[];
  leads: readonly Lead[];
  operations: Record<CampaignProfileId, AgentThreeOperationState>;
}

function campaignNameById(campaigns: readonly Campaign[] | null | undefined) {
  return new Map(
    asArray<Campaign>(campaigns)
      .filter((campaign) => campaign?.id)
      .map((campaign) => [campaign.id, campaign.name])
  );
}

function leadEmailById(leads: readonly Lead[] | null | undefined) {
  const map = new Map<string, string>();
  for (const lead of asArray<Lead>(leads)) {
    if (!lead?.id) continue;
    const email = normalizeEmail(lead.normalizedEmail) ?? normalizeEmail(lead.email);
    if (email) map.set(lead.id, email);
  }
  return map;
}

function historyKey(record: GlobalEmailHistoryRecord) {
  return `${record.operation}\u0000${record.normalizedEmail}\u0000${record.providerMessageId}`;
}

export function buildGlobalEmailHistory(
  input: BuildEvidenceInput
): GlobalEmailHistoryRecord[] {
  const names = campaignNameById(input.campaigns);
  const emails = leadEmailById(input.leads);
  const records = new Map<string, GlobalEmailHistoryRecord>();

  for (const operation of safeObjectValues<AgentThreeOperationState>(
    input.operations
  )) {
    if (!operation) continue;
    for (const sent of asArray<{
      normalizedEmail?: string;
      providerMessageId?: string;
      campaignId: string;
      sentAt: string;
    }>(operation.sentIndex)) {
      const email = normalizeEmail(sent.normalizedEmail);
      if (!email || !isRealDeliveryMessageId(sent.providerMessageId)) continue;
      const record: GlobalEmailHistoryRecord = {
        operation: operation.profileId,
        normalizedEmail: email,
        campaignId: sent.campaignId,
        campaignName: names.get(sent.campaignId) ?? sent.campaignId,
        sentAt: sent.sentAt,
        providerMessageId: sent.providerMessageId!,
      };
      records.set(historyKey(record), record);
    }
  }

  for (const campaign of asArray<Campaign>(input.campaigns)) {
    if (!campaign) continue;
    for (const status of asArray<import("../types/campaign.ts").CampaignLeadStatus>(
      campaign.leadStatuses
    )) {
      const email = emails.get(status.leadId);
      if (!email || !isConfirmedCampaignDelivery(status)) continue;
      const record: GlobalEmailHistoryRecord = {
        operation: campaign.campaignProfileId,
        normalizedEmail: email,
        campaignId: campaign.id,
        campaignName: campaign.name,
        sentAt: status.sentAt ?? campaign.updatedAt,
        providerMessageId: status.providerMessageId!,
      };
      records.set(historyKey(record), record);
    }
  }

  return [...records.values()].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

export function classifyPermanentContactBlock(
  value: string | null | undefined
): PermanentContactBlockReason | null {
  const text = (value ?? "").toLowerCase();
  if (/unsubscribe|unsubscribed|descadastr|opt[ -]?out/.test(text)) {
    return "unsubscribed";
  }
  if (/hard bounce|permanent bounce|mailbox (?:does not exist|unavailable)|user unknown/.test(text)) {
    return "permanent_bounce";
  }
  if (/suppression|suppressed|contact blocked|contato bloqueado/.test(text)) {
    return "contact_blocked";
  }
  return null;
}

function queueBlockReason(item: AgentThreeQueueItem) {
  if (item.exclusionReason === "unsubscribed") return "unsubscribed";
  if (item.exclusionReason === "permanent_bounce") return "permanent_bounce";
  if (
    item.exclusionReason === "contact_blocked" ||
    item.exclusionReason === "suppressed"
  ) {
    return classifyPermanentContactBlock(item.errorMessage) ?? "contact_blocked";
  }
  return classifyPermanentContactBlock(item.errorMessage);
}

export function buildPermanentContactBlocks(
  input: BuildEvidenceInput
): PermanentContactBlock[] {
  const emails = leadEmailById(input.leads);
  const blocks = new Map<string, PermanentContactBlock>();

  for (const operation of safeObjectValues<AgentThreeOperationState>(
    input.operations
  )) {
    if (!operation) continue;
    for (const item of asArray<AgentThreeQueueItem>(operation.queue)) {
      const reason = queueBlockReason(item);
      const email = normalizeEmail(item.normalizedEmail ?? item.originalEmail);
      if (!reason || !email) continue;
      blocks.set(`${operation.profileId}\u0000${email}`, {
        operation: operation.profileId,
        normalizedEmail: email,
        reason,
        occurredAt: item.updatedAt,
      });
    }
  }

  for (const campaign of asArray<Campaign>(input.campaigns)) {
    if (!campaign) continue;
    for (const error of asArray<import("../types/campaign.ts").CampaignSendError>(
      campaign.sendErrors
    )) {
      const reason = classifyPermanentContactBlock(
        `${error.errorCode} ${error.errorMessage}`
      );
      const email = normalizeEmail(error.email) ?? emails.get(error.leadId);
      if (!reason || !email) continue;
      blocks.set(`${campaign.campaignProfileId}\u0000${email}`, {
        operation: campaign.campaignProfileId,
        normalizedEmail: email,
        reason,
        occurredAt: error.occurredAt,
      });
    }
  }
  return [...blocks.values()];
}

function formatContactDate(value: string) {
  const date = value.slice(0, 10).split("-");
  return date.length === 3 ? `${date[2]}/${date[1]}/${date[0]}` : value;
}

export function permanentBlockLabel(reason: PermanentContactBlockReason) {
  if (reason === "unsubscribed") return "Descadastrado";
  if (reason === "permanent_bounce") return "Bounce permanente";
  return "Contato bloqueado";
}

export function auditGlobalEmailRecipients(input: {
  operation: CampaignProfileId;
  campaignId: string;
  contactKind: EmailContactKind;
  companiesFound: number;
  recipients: readonly GlobalDeduplicationRecipient[];
  history: readonly GlobalEmailHistoryRecord[];
  permanentBlocks?: readonly PermanentContactBlock[];
}): GlobalDeduplicationPreview {
  const seen = new Set<string>();
  const blocks = input.permanentBlocks ?? [];
  const decisions: GlobalDeduplicationDecision[] = [];

  for (const recipient of input.recipients) {
    const email = normalizeEmail(recipient.email);
    const base = {
      leadId: recipient.leadId,
      company: recipient.company,
      originalEmail: recipient.email ?? null,
      normalizedEmail: email,
    };
    if (!email) {
      decisions.push({
        ...base,
        included: false,
        code: "invalid_email",
        reason: "E-mail inválido",
        previousContact: null,
        otherOperationContact: null,
      });
      continue;
    }
    if (seen.has(email)) {
      decisions.push({
        ...base,
        included: false,
        code: "duplicate_in_batch",
        reason: "Duplicado dentro deste lote",
        previousContact: null,
        otherOperationContact: null,
      });
      continue;
    }
    seen.add(email);

    const block = blocks.find(
      (item) =>
        item.operation === input.operation && item.normalizedEmail === email
    );
    const sameOperation = input.history.find(
      (item) => item.operation === input.operation && item.normalizedEmail === email
    );
    const otherOperation = input.history.find(
      (item) => item.operation !== input.operation && item.normalizedEmail === email
    );

    if (block) {
      decisions.push({
        ...base,
        included: false,
        code: "permanently_blocked",
        reason: permanentBlockLabel(block.reason),
        previousContact: sameOperation ?? null,
        otherOperationContact: otherOperation ?? null,
      });
      continue;
    }
    if (sameOperation?.campaignId === input.campaignId) {
      decisions.push({
        ...base,
        included: false,
        code: "already_sent_current_campaign",
        reason: `Já contatado em ${formatContactDate(sameOperation.sentAt)} — campanha ${sameOperation.campaignName}`,
        previousContact: sameOperation,
        otherOperationContact: otherOperation ?? null,
      });
      continue;
    }
    if (sameOperation && input.contactKind !== "follow_up") {
      decisions.push({
        ...base,
        included: false,
        code: "same_operation_contacted",
        reason: `Já contatado em ${formatContactDate(sameOperation.sentAt)} — campanha ${sameOperation.campaignName}`,
        previousContact: sameOperation,
        otherOperationContact: otherOperation ?? null,
      });
      continue;
    }

    decisions.push({
      ...base,
      included: true,
      code: sameOperation ? "follow_up_authorized" : "new_recipient",
      reason: sameOperation
        ? `Follow-up autorizado após contato em ${formatContactDate(sameOperation.sentAt)} — campanha ${sameOperation.campaignName}`
        : "Destinatário realmente novo",
      previousContact: sameOperation ?? null,
      otherOperationContact: otherOperation ?? null,
    });
  }

  const count = (code: GlobalDeduplicationDecisionCode) =>
    decisions.filter((item) => item.code === code).length;
  return {
    operation: input.operation,
    campaignId: input.campaignId,
    contactKind: input.contactKind,
    companiesFound: input.companiesFound,
    contactsWithEmail: decisions.filter((item) => item.normalizedEmail).length,
    duplicatesInBatch: count("duplicate_in_batch"),
    alreadyContactedSameOperation:
      count("same_operation_contacted") + count("already_sent_current_campaign"),
    blockedContacts: count("permanently_blocked"),
    otherOperationWarnings: decisions.filter((item) => item.otherOperationContact).length,
    newRecipients: count("new_recipient"),
    authorizedFollowUps: count("follow_up_authorized"),
    finalSendCount: decisions.filter((item) => item.included).length,
    decisions,
  };
}

interface LockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memoryLocks = new Map<string, string>();

export function acquireGlobalEmailSendLock(input: {
  operation: CampaignProfileId;
  email: string | null | undefined;
  owner: string;
  nowMs?: number;
  leaseMs?: number;
  storage?: LockStorage | null;
}): { acquired: boolean; release: () => void } {
  const email = normalizeEmail(input.email);
  if (!email) return { acquired: false, release: () => {} };
  const key = `pnp-email-send-lock:${input.operation}:${email}`;
  const now = input.nowMs ?? Date.now();
  const leaseMs = input.leaseMs ?? 120_000;
  const token = `${input.owner}:${now}:${Math.random().toString(36).slice(2)}`;
  const storage =
    input.storage === undefined
      ? typeof window !== "undefined"
        ? window.localStorage
        : null
      : input.storage;

  if (storage) {
    try {
      const currentRaw = storage.getItem(key);
      const current = currentRaw
        ? (JSON.parse(currentRaw) as { token?: string; expiresAt?: number })
        : null;
      if (current?.token && (current.expiresAt ?? 0) > now) {
        return { acquired: false, release: () => {} };
      }
      storage.setItem(key, JSON.stringify({ token, expiresAt: now + leaseMs }));
      const verified = JSON.parse(storage.getItem(key) ?? "null") as {
        token?: string;
      } | null;
      if (verified?.token !== token) {
        return { acquired: false, release: () => {} };
      }
      return {
        acquired: true,
        release: () => {
          try {
            const latest = JSON.parse(storage.getItem(key) ?? "null") as {
              token?: string;
            } | null;
            if (latest?.token === token) storage.removeItem(key);
          } catch {
            // A confirmed history check still prevents a later duplicate.
          }
        },
      };
    } catch {
      // Fall through to the in-memory lock when storage is unavailable.
    }
  }

  if (memoryLocks.has(key)) return { acquired: false, release: () => {} };
  memoryLocks.set(key, token);
  return {
    acquired: true,
    release: () => {
      if (memoryLocks.get(key) === token) memoryLocks.delete(key);
    },
  };
}
