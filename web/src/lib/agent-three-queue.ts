import type { EmailValidationStatus } from "../types/email-validation.ts";
import type { Lead } from "../types/lead.ts";
import {
  CAMPAIGN_PROFILE_IDS,
  isCampaignProfileId,
  type CampaignProfileId,
} from "../types/campaign-profile.ts";
import {
  isEmailSyntaxValid,
  normalizeEmail,
} from "./email-validation.ts";
import { isRealDeliveryMessageId } from "./campaign-delivery-metrics.ts";

export type AgentThreeQueueStatus =
  | "pending"
  | "ready"
  | "sending"
  | "sent"
  | "failed"
  | "blocked"
  | "skipped";

export type AgentThreeStatus =
  | "idle"
  | "running"
  | "paused"
  | "stopped"
  | "completed"
  | "error";

export type AgentThreeHistoryAction =
  | "campaign_selected"
  | "limit_updated"
  | "interval_updated"
  | "leads_loaded"
  | "items_prepared"
  | "started"
  | "start_blocked"
  | "paused"
  | "resumed"
  | "stopped"
  | "item_sent"
  | "item_failed"
  | "item_blocked"
  | "item_released"
  | "provider_paused"
  | "item_skipped";

export interface AgentThreeQueueItem {
  id: string;
  leadId: string;
  campaignProfileId: CampaignProfileId;
  campaignId?: string;
  companyName: string;
  originalEmail: string | null;
  normalizedEmail: string | null;
  sector: string;
  location: string;
  validationStatus: EmailValidationStatus;
  validationReason: string;
  emailDomain?: string;
  hasMxRecords?: boolean;
  exclusionReason?:
    | "no_email"
    | "invalid_syntax"
    | "domain_not_found"
    | "no_mx_records"
    | "duplicate"
    | "suppressed"
    | "invalid_request";
  queueStatus: AgentThreeQueueStatus;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  failedAt?: string;
  errorMessage?: string;
  attemptCount: number;
  providerMessageId?: string;
}

export interface AgentThreeSenderConfig {
  providerId: string | null;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
}

export interface AgentThreeSentRecord {
  queueItemId: string;
  leadId: string;
  normalizedEmail: string | null;
  campaignProfileId: CampaignProfileId;
  campaignId: string;
  sentAt: string;
  providerMessageId?: string;
}

export interface AgentThreeHistoryEntry {
  id: string;
  action: AgentThreeHistoryAction;
  occurredAt: string;
  campaignId: string | null;
  queueItemId?: string;
  detail: string;
}

export interface AgentThreeOperationState {
  profileId: CampaignProfileId;
  status: AgentThreeStatus;
  queue: AgentThreeQueueItem[];
  currentItemId: string | null;
  currentCampaignId: string | null;
  selectedLeadIds: string[];
  ignoredCount: number;
  numericLimit: number;
  untilQueueEnds: boolean;
  processedCount: number;
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
  senderConfig: AgentThreeSenderConfig;
  sentIndex: AgentThreeSentRecord[];
  history: AgentThreeHistoryEntry[];
  lastActivityAt: string | null;
  errorMessage: string | null;
}

export interface AgentThreeSnapshot {
  selectedProfileId: CampaignProfileId;
  operations: Record<CampaignProfileId, AgentThreeOperationState>;
}

export interface AgentThreeLoadResult {
  snapshot: AgentThreeSnapshot;
  addedItems: AgentThreeQueueItem[];
  addedCount: number;
  readyCount: number;
  pendingCount: number;
  blockedCount: number;
  ignoredCount: number;
  alreadySentCount: number;
}

export interface AgentThreeStartResult {
  snapshot: AgentThreeSnapshot;
  started: boolean;
  message: string | null;
}

export interface AgentThreePreparationResult {
  snapshot: AgentThreeSnapshot;
  eligibleCount: number;
  preparedCount: number;
  removedCount: number;
}

export interface ClaimedAgentThreeItem {
  snapshot: AgentThreeSnapshot;
  item: AgentThreeQueueItem | null;
}

export interface AgentThreeMetrics {
  total: number;
  sent: number;
  pending: number;
  ready: number;
  failed: number;
  blocked: number;
  skipped: number;
  numericLimit: number;
  untilQueueEnds: boolean;
  processedCount: number;
  remainingCapacity: number | null;
  removed: number;
  invalidRemoved: number;
  currentCampaignId: string | null;
  currentSector: string | null;
  lastActivityAt: string | null;
  completedLists: string[];
  pendingLists: string[];
}

export interface AgentThreeCampaignDeliverySummary {
  campaignProfileId: CampaignProfileId;
  campaignId: string;
  remaining: number;
  sent: number;
  failed: number;
}

const AGENT_STATUSES = new Set<AgentThreeStatus>([
  "idle",
  "running",
  "paused",
  "stopped",
  "completed",
  "error",
]);

const QUEUE_STATUSES = new Set<AgentThreeQueueStatus>([
  "pending",
  "ready",
  "sending",
  "sent",
  "failed",
  "blocked",
  "skipped",
]);

const EXCLUSION_REASONS = new Set<
  NonNullable<AgentThreeQueueItem["exclusionReason"]>
>([
  "no_email",
  "invalid_syntax",
  "domain_not_found",
  "no_mx_records",
  "duplicate",
  "suppressed",
  "invalid_request",
]);

const VALIDATION_STATUSES = new Set<EmailValidationStatus>([
  "pending",
  "validating",
  "valid",
  "invalid",
  "duplicate",
  "risky",
  "catch_all",
  "unknown",
  "no_email",
]);

const EMPTY_SENDER_CONFIG: AgentThreeSenderConfig = {
  providerId: null,
  fromName: null,
  fromEmail: null,
  replyTo: null,
};

export const DEFAULT_AGENT_THREE_NUMERIC_LIMIT = 50;

function createInitialOperation(
  profileId: CampaignProfileId
): AgentThreeOperationState {
  return {
    profileId,
    status: "idle",
    queue: [],
    currentItemId: null,
    currentCampaignId: null,
    selectedLeadIds: [],
    ignoredCount: 0,
    numericLimit: DEFAULT_AGENT_THREE_NUMERIC_LIMIT,
    untilQueueEnds: false,
    processedCount: 0,
    minIntervalSeconds: 0,
    maxIntervalSeconds: 0,
    senderConfig: { ...EMPTY_SENDER_CONFIG },
    sentIndex: [],
    history: [],
    lastActivityAt: null,
    errorMessage: null,
  };
}

export function createInitialAgentThreeSnapshot(): AgentThreeSnapshot {
  return {
    selectedProfileId: "panek-puglesi",
    operations: {
      "panek-puglesi": createInitialOperation("panek-puglesi"),
      modeclean: createInitialOperation("modeclean"),
    },
  };
}

export const INITIAL_AGENT_THREE_SNAPSHOT =
  createInitialAgentThreeSnapshot();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function historyEntry(
  operation: AgentThreeOperationState,
  action: AgentThreeHistoryAction,
  occurredAt: string,
  detail: string,
  queueItemId?: string
): AgentThreeHistoryEntry {
  return {
    id:
      operation.profileId +
      "-" +
      action +
      "-" +
      occurredAt +
      "-" +
      operation.history.length,
    action,
    occurredAt,
    campaignId: operation.currentCampaignId,
    queueItemId,
    detail,
  };
}

function updateOperation(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  operation: AgentThreeOperationState
): AgentThreeSnapshot {
  return {
    ...snapshot,
    operations: {
      ...snapshot.operations,
      [profileId]: operation,
    },
  };
}

function withHistory(
  operation: AgentThreeOperationState,
  action: AgentThreeHistoryAction,
  occurredAt: string,
  detail: string,
  queueItemId?: string
): AgentThreeOperationState {
  return {
    ...operation,
    history: [
      ...operation.history,
      historyEntry(operation, action, occurredAt, detail, queueItemId),
    ],
    lastActivityAt: occurredAt,
  };
}

export function selectAgentThreeProfile(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId
): AgentThreeSnapshot {
  return snapshot.selectedProfileId === profileId
    ? snapshot
    : { ...snapshot, selectedProfileId: profileId };
}

export function selectAgentThreeCampaign(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  campaignId: string | null,
  occurredAt: string
): AgentThreeSnapshot {
  const operation = snapshot.operations[profileId];
  if (operation.currentCampaignId === campaignId) return snapshot;
  const isLive =
    operation.status === "running" || operation.status === "paused";
  const next = withHistory(
    {
      ...operation,
      currentCampaignId: campaignId,
      // New selection starts a fresh execution counter unless already live.
      processedCount: isLive ? operation.processedCount : 0,
    },
    "campaign_selected",
    occurredAt,
    campaignId ? "Campanha selecionada." : "Campanha removida da seleção."
  );
  return updateOperation(snapshot, profileId, next);
}

export function configureAgentThreeLimit(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  numericLimit: number,
  untilQueueEnds: boolean,
  occurredAt: string
): AgentThreeSnapshot {
  if (!Number.isInteger(numericLimit) || numericLimit < 1) return snapshot;
  const operation = snapshot.operations[profileId];
  if (operation.status === "running" || operation.status === "paused") {
    return snapshot;
  }
  if (
    operation.numericLimit === numericLimit &&
    operation.untilQueueEnds === untilQueueEnds
  ) {
    return snapshot;
  }
  const detail = untilQueueEnds
    ? "Limite alterado para Até acabar a lista."
    : "Limite numérico alterado para " + numericLimit + ".";
  return updateOperation(
    snapshot,
    profileId,
    withHistory(
      {
        ...operation,
        numericLimit,
        untilQueueEnds,
      },
      "limit_updated",
      occurredAt,
      detail
    )
  );
}

export function getAgentThreeRemainingCapacity(
  operation: AgentThreeOperationState
): number | null {
  return operation.untilQueueEnds
    ? null
    : Math.max(0, operation.numericLimit - operation.processedCount);
}

export function hasAgentThreeExecutionCapacity(
  operation: AgentThreeOperationState
): boolean {
  const remainingCapacity = getAgentThreeRemainingCapacity(operation);
  return remainingCapacity === null || remainingCapacity > 0;
}

export function configureAgentThreeIntervals(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  minIntervalSeconds: number,
  maxIntervalSeconds: number,
  occurredAt: string
): AgentThreeSnapshot {
  if (
    !Number.isFinite(minIntervalSeconds) ||
    !Number.isFinite(maxIntervalSeconds) ||
    minIntervalSeconds < 0 ||
    maxIntervalSeconds < minIntervalSeconds
  ) {
    return snapshot;
  }
  const operation = snapshot.operations[profileId];
  if (operation.status === "running" || operation.status === "paused") {
    return snapshot;
  }
  if (
    operation.minIntervalSeconds === minIntervalSeconds &&
    operation.maxIntervalSeconds === maxIntervalSeconds
  ) {
    return snapshot;
  }
  return updateOperation(
    snapshot,
    profileId,
    withHistory(
      {
        ...operation,
        minIntervalSeconds,
        maxIntervalSeconds,
      },
      "interval_updated",
      occurredAt,
      "Intervalo alterado para " +
        minIntervalSeconds +
        "–" +
        maxIntervalSeconds +
        " segundo(s)."
    )
  );
}

function classifyLead(lead: Lead): {
  validationStatus: EmailValidationStatus;
  validationReason: string;
  queueStatus: AgentThreeQueueStatus;
  exclusionReason?: AgentThreeQueueItem["exclusionReason"];
} {
  const validationStatus = lead.emailValidationStatus ?? "pending";
  const validationReason =
    lead.emailValidationReason ??
    (lead.emailValidationStatus ? "reason_not_recorded" : "awaiting_validation");

  if (!(normalizeEmail(lead.normalizedEmail) ?? normalizeEmail(lead.email))) {
    return {
      validationStatus: "no_email",
      validationReason: "no_email",
      queueStatus: "blocked",
      exclusionReason: "no_email",
    };
  }
  if (validationStatus === "duplicate") {
    return {
      validationStatus,
      validationReason,
      queueStatus: "blocked",
      exclusionReason: "duplicate",
    };
  }
  if (
    validationReason === "invalid_syntax" ||
    validationReason === "domain_not_found" ||
    validationReason === "no_mx_records"
  ) {
    return {
      validationStatus,
      validationReason,
      queueStatus: "blocked",
      exclusionReason: validationReason,
    };
  }
  if (validationStatus === "invalid" || validationStatus === "no_email") {
    return {
      validationStatus,
      validationReason,
      queueStatus: "blocked",
      exclusionReason:
        validationStatus === "no_email" ? "no_email" : "invalid_syntax",
    };
  }
  if (validationStatus === "valid") {
    return { validationStatus, validationReason, queueStatus: "ready" };
  }
  return { validationStatus, validationReason, queueStatus: "pending" };
}

function queueItemFromLead(
  lead: Lead,
  profileId: CampaignProfileId,
  campaignId: string,
  createdAt: string,
  sequence: number
): AgentThreeQueueItem {
  const normalizedEmail =
    normalizeEmail(lead.normalizedEmail) ?? normalizeEmail(lead.email);
  const classification = classifyLead(lead);
  return {
    id:
      "agent-three-" +
      profileId +
      "-" +
      campaignId +
      "-" +
      createdAt +
      "-" +
      sequence +
      "-" +
      lead.id,
    leadId: lead.id,
    campaignProfileId: profileId,
    campaignId,
    companyName: lead.company,
    originalEmail: lead.email,
    normalizedEmail,
    sector: lead.category ?? "",
    location: lead.address ?? "",
    validationStatus: classification.validationStatus,
    validationReason: classification.validationReason,
    emailDomain: lead.emailDomain,
    hasMxRecords: lead.hasMxRecords,
    exclusionReason: classification.exclusionReason,
    queueStatus: classification.queueStatus,
    createdAt,
    updatedAt: createdAt,
    attemptCount: 0,
  };
}

function campaignKey(campaignId: string, value: string): string {
  return campaignId + "\u0000" + value;
}

export function loadAgentThreeLeads(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  campaignId: string,
  leads: Lead[],
  quantity: number,
  createdAt: string
): AgentThreeLoadResult {
  const operation = snapshot.operations[profileId];
  const safeQuantity = Number.isFinite(quantity)
    ? Math.max(0, Math.floor(quantity))
    : leads.length;
  const leadKeys = new Set<string>();
  const emailKeys = new Set<string>();
  const sentLeadKeys = new Set<string>();
  const sentEmailKeys = new Set<string>();

  for (const item of operation.queue) {
    if (item.campaignId !== campaignId) continue;
    leadKeys.add(campaignKey(campaignId, item.leadId));
    if (item.normalizedEmail) {
      emailKeys.add(campaignKey(campaignId, item.normalizedEmail));
    }
  }
  for (const record of operation.sentIndex) {
    if (record.campaignId !== campaignId) continue;
    sentLeadKeys.add(campaignKey(campaignId, record.leadId));
    if (record.normalizedEmail) {
      sentEmailKeys.add(campaignKey(campaignId, record.normalizedEmail));
    }
  }

  const addedItems: AgentThreeQueueItem[] = [];
  let ignoredCount = 0;
  let alreadySentCount = 0;

  for (const lead of leads) {
    if (addedItems.length >= safeQuantity) break;
    const normalizedEmail =
      normalizeEmail(lead.normalizedEmail) ?? normalizeEmail(lead.email);
    const leadKey = campaignKey(campaignId, lead.id);
    const emailKey = normalizedEmail
      ? campaignKey(campaignId, normalizedEmail)
      : null;
    const alreadySent =
      sentLeadKeys.has(leadKey) ||
      (emailKey !== null && sentEmailKeys.has(emailKey));
    const duplicate =
      leadKeys.has(leadKey) ||
      (emailKey !== null && emailKeys.has(emailKey));

    if (alreadySent || duplicate) {
      ignoredCount += 1;
      if (alreadySent) alreadySentCount += 1;
      continue;
    }

    const item = queueItemFromLead(
      lead,
      profileId,
      campaignId,
      createdAt,
      operation.queue.length + addedItems.length
    );
    addedItems.push(item);
    leadKeys.add(leadKey);
    if (emailKey) emailKeys.add(emailKey);
  }

  if (addedItems.length === 0 && ignoredCount === 0) {
    return {
      snapshot,
      addedItems,
      addedCount: 0,
      readyCount: 0,
      pendingCount: 0,
      blockedCount: 0,
      ignoredCount,
      alreadySentCount,
    };
  }

  const selectedLeadIds = new Set(operation.selectedLeadIds);
  for (const item of addedItems) selectedLeadIds.add(item.leadId);
  const loadDetail =
    addedItems.length +
    " lead(s) adicionado(s), " +
    addedItems.filter((item) => item.queueStatus === "blocked").length +
    " bloqueado(s) e " +
    ignoredCount +
    " ignorado(s).";
  const nextOperation = withHistory(
    {
      ...operation,
      status:
        operation.status === "running" || operation.status === "paused"
          ? operation.status
          : "idle",
      queue: [...operation.queue, ...addedItems],
      currentCampaignId: campaignId,
      selectedLeadIds: [...selectedLeadIds],
      ignoredCount: operation.ignoredCount + ignoredCount,
      errorMessage: null,
    },
    "leads_loaded",
    createdAt,
    loadDetail
  );

  return {
    snapshot: updateOperation(snapshot, profileId, nextOperation),
    addedItems,
    addedCount: addedItems.length,
    readyCount: addedItems.filter((item) => item.queueStatus === "ready").length,
    pendingCount: addedItems.filter((item) => item.queueStatus === "pending")
      .length,
    blockedCount: addedItems.filter((item) => item.queueStatus === "blocked")
      .length,
    ignoredCount,
    alreadySentCount,
  };
}

function leadEvidenceForItem(
  item: AgentThreeQueueItem,
  leadsById: ReadonlyMap<string, Lead>,
  leadsByEmail: ReadonlyMap<string, Lead>
): AgentThreeQueueItem {
  const lead =
    leadsById.get(item.leadId) ??
    (item.normalizedEmail
      ? leadsByEmail.get(item.normalizedEmail)
      : undefined);
  if (!lead) return item;
  const normalizedEmail =
    normalizeEmail(lead.normalizedEmail) ??
    normalizeEmail(lead.email) ??
    item.normalizedEmail;
  const hasRecordedValidation =
    typeof lead.emailValidatedAt === "string" ||
    lead.emailValidationProvider === "local_dns";
  return {
    ...item,
    originalEmail: lead.email ?? item.originalEmail,
    normalizedEmail,
    validationStatus:
      lead.emailValidationStatus ?? item.validationStatus,
    validationReason:
      lead.emailValidationReason ?? item.validationReason,
    emailDomain: hasRecordedValidation
      ? lead.emailDomain
      : lead.emailDomain ?? item.emailDomain,
    hasMxRecords: hasRecordedValidation
      ? lead.hasMxRecords
      : lead.hasMxRecords ?? item.hasMxRecords,
  };
}

function getAgentThreeExclusionReason(
  item: AgentThreeQueueItem
): AgentThreeQueueItem["exclusionReason"] {
  if (item.exclusionReason === "suppressed") return "suppressed";
  if (!item.normalizedEmail) return "no_email";
  if (!isEmailSyntaxValid(item.normalizedEmail)) return "invalid_syntax";
  if (item.validationStatus === "no_email") return "no_email";
  if (
    item.validationStatus === "duplicate" ||
    item.validationReason.startsWith("duplicate")
  ) {
    return "duplicate";
  }
  if (
    item.validationReason === "invalid_syntax" ||
    item.validationReason === "domain_not_found" ||
    item.validationReason === "no_mx_records"
  ) {
    return item.validationReason;
  }
  if (item.validationStatus === "invalid") return "invalid_syntax";
  return undefined;
}

export function isAgentThreeItemEligible(
  item: AgentThreeQueueItem
): boolean {
  if (getAgentThreeExclusionReason(item)) return false;
  if (!item.normalizedEmail || !isEmailSyntaxValid(item.normalizedEmail)) {
    return false;
  }
  if (item.validationStatus === "valid") return true;
  if (
    item.validationStatus === "unknown" &&
    item.validationReason === "mailbox_not_verified"
  ) {
    return true;
  }
  return item.hasMxRecords === true;
}

/** Failures where SMTP was never called (config/protection) may return to ready. */
export function isRecoverableConfigurationQueueFailure(
  item: AgentThreeQueueItem
): boolean {
  if (item.queueStatus !== "failed") return false;
  if (item.providerMessageId) return false;
  const message = item.errorMessage ?? "";
  return (
    /not[_\s-]?configured/i.test(message) ||
    /configura(?:ção|cao|tion)/i.test(message) ||
    /real_send_disabled/i.test(message) ||
    /envio real desativado/i.test(message)
  );
}

export function prepareAgentThreeCampaign(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  campaignId: string,
  leads: Lead[],
  occurredAt: string
): AgentThreePreparationResult {
  const operation = snapshot.operations[profileId];
  if (operation.status === "running") {
    return {
      snapshot,
      eligibleCount: operation.queue.filter(
        (item) =>
          item.campaignId === campaignId &&
          (item.queueStatus === "ready" || item.queueStatus === "sending")
      ).length,
      preparedCount: 0,
      removedCount: 0,
    };
  }
  const leadsById = new Map(leads.map((lead) => [lead.id, lead]));
  const leadsByEmail = new Map<string, Lead>();
  for (const lead of leads) {
    const normalizedEmail =
      normalizeEmail(lead.normalizedEmail) ?? normalizeEmail(lead.email);
    if (normalizedEmail) leadsByEmail.set(normalizedEmail, lead);
  }

  let preparedCount = 0;
  let removedCount = 0;
  let changed = false;
  const queue = operation.queue.map((originalItem) => {
    const unconfirmedSent =
      originalItem.campaignId === campaignId &&
      originalItem.queueStatus === "sent" &&
      !isRealDeliveryMessageId(originalItem.providerMessageId);
    if (
      originalItem.campaignId !== campaignId ||
      originalItem.queueStatus === "sending" ||
      originalItem.queueStatus === "skipped" ||
      (originalItem.queueStatus === "sent" && !unconfirmedSent) ||
      (originalItem.queueStatus === "failed" &&
        !isRecoverableConfigurationQueueFailure(originalItem))
    ) {
      return originalItem;
    }
    if (unconfirmedSent) {
      changed = true;
    }
    const item = leadEvidenceForItem(
      originalItem,
      leadsById,
      leadsByEmail
    );
    const exclusionReason = getAgentThreeExclusionReason(item);
    const queueStatus: AgentThreeQueueStatus = exclusionReason
      ? "blocked"
      : isAgentThreeItemEligible(item)
        ? "ready"
        : "pending";
    if (
      queueStatus === "ready" &&
      originalItem.queueStatus !== "ready"
    ) {
      preparedCount += 1;
    }
    if (
      queueStatus === "blocked" &&
      originalItem.queueStatus !== "blocked"
    ) {
      removedCount += 1;
    }
    if (
      queueStatus === originalItem.queueStatus &&
      item.validationStatus === originalItem.validationStatus &&
      item.validationReason === originalItem.validationReason &&
      item.normalizedEmail === originalItem.normalizedEmail &&
      item.hasMxRecords === originalItem.hasMxRecords &&
      exclusionReason === originalItem.exclusionReason &&
      item.errorMessage === originalItem.errorMessage
    ) {
      return originalItem;
    }
    changed = true;
    return {
      ...item,
      queueStatus,
      exclusionReason,
      updatedAt: occurredAt,
      sentAt:
        queueStatus === "ready" || queueStatus === "pending"
          ? undefined
          : item.sentAt,
      providerMessageId:
        queueStatus === "ready" || queueStatus === "pending"
          ? undefined
          : item.providerMessageId,
      failedAt: queueStatus === "ready" || queueStatus === "pending"
        ? undefined
        : item.failedAt,
      errorMessage:
        queueStatus === "ready" || queueStatus === "pending"
          ? undefined
          : item.errorMessage,
    };
  });
  const cleanedSentIndex = operation.sentIndex.filter((record) => {
    if (record.campaignId !== campaignId) return true;
    return isRealDeliveryMessageId(record.providerMessageId);
  });
  if (cleanedSentIndex.length !== operation.sentIndex.length) {
    changed = true;
  }
  const eligibleCount = queue.filter(
    (item) =>
      item.campaignId === campaignId && item.queueStatus === "ready"
  ).length;
  if (!changed) {
    return {
      snapshot,
      eligibleCount,
      preparedCount,
      removedCount,
    };
  }
  // prepare returns early when status is "running"; only paused keeps counters.
  const preserveProcessedCount = operation.status === "paused";
  const next = withHistory(
    {
      ...operation,
      queue,
      sentIndex: cleanedSentIndex,
      currentCampaignId: campaignId,
      errorMessage: null,
      processedCount: preserveProcessedCount ? operation.processedCount : 0,
    },
    "items_prepared",
    occurredAt,
    `${preparedCount} lead(s) preparado(s) e ${removedCount} removido(s).`
  );
  return {
    snapshot: updateOperation(snapshot, profileId, next),
    eligibleCount,
    preparedCount,
    removedCount,
  };
}

export const NO_SENDING_PROVIDER_MESSAGE =
  "Nenhum provedor de envio configurado.";
export const NO_ELIGIBLE_LEADS_MESSAGE =
  "Não há leads elegíveis para envio nesta campanha.";

export function startAgentThree(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  providerConfigured: boolean,
  occurredAt: string
): AgentThreeStartResult {
  const currentOperation = snapshot.operations[profileId];
  const preparation = currentOperation.currentCampaignId
    ? prepareAgentThreeCampaign(
        snapshot,
        profileId,
        currentOperation.currentCampaignId,
        [],
        occurredAt
      )
    : {
        snapshot,
        eligibleCount: 0,
        preparedCount: 0,
        removedCount: 0,
      };
  const preparedSnapshot = preparation.snapshot;
  const operation = preparedSnapshot.operations[profileId];
  if (!providerConfigured) {
    const blockedOperation = withHistory(
      operation,
      "start_blocked",
      occurredAt,
      NO_SENDING_PROVIDER_MESSAGE
    );
    return {
      snapshot: updateOperation(
        preparedSnapshot,
        profileId,
        blockedOperation
      ),
      started: false,
      message: NO_SENDING_PROVIDER_MESSAGE,
    };
  }
  if (operation.status === "running" || operation.status === "paused") {
    return {
      snapshot: preparedSnapshot,
      started: false,
      message: null,
    };
  }
  if (!operation.currentCampaignId) {
    return {
      snapshot: preparedSnapshot,
      started: false,
      message: "Selecione uma campanha antes de iniciar.",
    };
  }
  const hasReadyItem = operation.queue.some(
    (item) =>
      item.campaignId === operation.currentCampaignId &&
      item.queueStatus === "ready"
  );
  if (!hasReadyItem) {
    return {
      snapshot: preparedSnapshot,
      started: false,
      message: NO_ELIGIBLE_LEADS_MESSAGE,
    };
  }
  const next = withHistory(
    {
      ...operation,
      status: "running",
      currentItemId: null,
      processedCount: 0,
      errorMessage: null,
    },
    "started",
    occurredAt,
    "Execução iniciada."
  );
  return {
    snapshot: updateOperation(preparedSnapshot, profileId, next),
    started: true,
    message: null,
  };
}

export function pauseAgentThree(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  occurredAt: string,
  interruptWait: () => void = () => {}
): AgentThreeSnapshot {
  const operation = snapshot.operations[profileId];
  if (operation.status !== "running") return snapshot;
  interruptWait();
  return updateOperation(
    snapshot,
    profileId,
    withHistory(
      { ...operation, status: "paused" },
      "paused",
      occurredAt,
      "Execução pausada."
    )
  );
}

export function resumeAgentThree(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  providerConfigured: boolean,
  occurredAt: string
): AgentThreeStartResult {
  const operation = snapshot.operations[profileId];
  if (operation.status !== "paused" && operation.status !== "stopped") {
    return { snapshot, started: false, message: null };
  }
  if (!providerConfigured) {
    return {
      snapshot,
      started: false,
      message: NO_SENDING_PROVIDER_MESSAGE,
    };
  }
  const next = withHistory(
    {
      ...operation,
      status: "running",
      currentItemId: null,
      queue: operation.queue.map((item) =>
        item.queueStatus === "sending"
          ? { ...item, queueStatus: "ready" as const, updatedAt: occurredAt }
          : item
      ),
    },
    "resumed",
    occurredAt,
    "Execução retomada."
  );
  return {
    snapshot: updateOperation(snapshot, profileId, next),
    started: true,
    message: null,
  };
}

export function stopAgentThree(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  occurredAt: string,
  interruptWait: () => void = () => {}
): AgentThreeSnapshot {
  const operation = snapshot.operations[profileId];
  if (operation.status !== "running" && operation.status !== "paused") {
    return snapshot;
  }
  interruptWait();
  const next = withHistory(
    {
      ...operation,
      status: "stopped",
      currentItemId: null,
    },
    "stopped",
    occurredAt,
    "Execução interrompida; a fila foi preservada."
  );
  return updateOperation(snapshot, profileId, next);
}

export function releaseAgentThreeSendingItem(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  itemId: string,
  occurredAt: string,
  options: {
    pause: boolean;
    consumeAttempt: boolean;
    message: string;
  }
): AgentThreeSnapshot {
  const operation = snapshot.operations[profileId];
  const item = operation.queue.find(
    (candidate) =>
      candidate.id === itemId && candidate.queueStatus === "sending"
  );
  if (!item) return snapshot;
  const releasedItem: AgentThreeQueueItem = {
    ...item,
    queueStatus: "ready",
    updatedAt: occurredAt,
    attemptCount: options.consumeAttempt
      ? item.attemptCount
      : Math.max(0, item.attemptCount - 1),
    failedAt: undefined,
    errorMessage: undefined,
  };
  const next = withHistory(
    {
      ...operation,
      status: options.pause ? "paused" : operation.status,
      currentItemId:
        operation.currentItemId === itemId ? null : operation.currentItemId,
      processedCount: options.consumeAttempt
        ? operation.processedCount
        : Math.max(0, operation.processedCount - 1),
      queue: operation.queue.map((candidate) =>
        candidate.id === itemId ? releasedItem : candidate
      ),
      errorMessage: options.pause ? options.message : operation.errorMessage,
    },
    options.pause ? "provider_paused" : "item_released",
    occurredAt,
    options.message,
    itemId
  );
  return updateOperation(snapshot, profileId, next);
}

export function blockAgentThreeSendingItem(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  itemId: string,
  message: string,
  occurredAt: string,
  exclusionReason: "suppressed" | "invalid_request"
): AgentThreeSnapshot {
  const operation = snapshot.operations[profileId];
  const item = operation.queue.find(
    (candidate) =>
      candidate.id === itemId && candidate.queueStatus === "sending"
  );
  if (!item) return snapshot;
  const blockedItem: AgentThreeQueueItem = {
    ...item,
    queueStatus: "blocked",
    updatedAt: occurredAt,
    attemptCount: Math.max(0, item.attemptCount - 1),
    failedAt: undefined,
    errorMessage: message,
    exclusionReason,
  };
  const next = withHistory(
    {
      ...operation,
      currentItemId:
        operation.currentItemId === itemId ? null : operation.currentItemId,
      processedCount: Math.max(0, operation.processedCount - 1),
      queue: operation.queue.map((candidate) =>
        candidate.id === itemId ? blockedItem : candidate
      ),
    },
    "item_blocked",
    occurredAt,
    message,
    itemId
  );
  return updateOperation(snapshot, profileId, next);
}

export function claimNextAgentThreeItem(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  startedAt: string
): ClaimedAgentThreeItem {
  const operation = snapshot.operations[profileId];
  if (
    operation.status !== "running" ||
    operation.currentItemId !== null ||
    operation.queue.some((item) => item.queueStatus === "sending") ||
    !hasAgentThreeExecutionCapacity(operation)
  ) {
    return { snapshot, item: null };
  }
  const nextItem = operation.queue.find(
    (item) =>
      item.campaignId === operation.currentCampaignId &&
      item.queueStatus === "ready"
  );
  if (!nextItem) return { snapshot, item: null };
  const claimed: AgentThreeQueueItem = {
    ...nextItem,
    queueStatus: "sending",
    attemptCount: nextItem.attemptCount + 1,
    updatedAt: startedAt,
    failedAt: undefined,
    errorMessage: undefined,
  };
  return {
    snapshot: updateOperation(snapshot, profileId, {
      ...operation,
      currentItemId: claimed.id,
      processedCount: operation.processedCount + 1,
      lastActivityAt: startedAt,
      queue: operation.queue.map((item) =>
        item.id === claimed.id ? claimed : item
      ),
    }),
    item: claimed,
  };
}

export function completeAgentThreeItem(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  itemId: string,
  sentAt: string,
  providerMessageId?: string
): AgentThreeSnapshot {
  const operation = snapshot.operations[profileId];
  const item = operation.queue.find(
    (candidate) =>
      candidate.id === itemId && candidate.queueStatus === "sending"
  );
  if (!item?.campaignId) return snapshot;
  const sentItem: AgentThreeQueueItem = {
    ...item,
    queueStatus: "sent",
    sentAt,
    updatedAt: sentAt,
    providerMessageId,
    failedAt: undefined,
    errorMessage: undefined,
  };
  const record: AgentThreeSentRecord = {
    queueItemId: item.id,
    leadId: item.leadId,
    normalizedEmail: item.normalizedEmail,
    campaignProfileId: profileId,
    campaignId: item.campaignId,
    sentAt,
    providerMessageId,
  };
  const next = withHistory(
    {
      ...operation,
      currentItemId:
        operation.currentItemId === itemId ? null : operation.currentItemId,
      queue: operation.queue.map((candidate) =>
        candidate.id === itemId ? sentItem : candidate
      ),
      sentIndex: [
        ...operation.sentIndex.filter(
          (existing) => existing.queueItemId !== itemId
        ),
        record,
      ],
    },
    "item_sent",
    sentAt,
    "Item enviado.",
    itemId
  );
  return updateOperation(snapshot, profileId, next);
}

export function failAgentThreeItem(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  itemId: string,
  errorMessage: string,
  failedAt: string
): AgentThreeSnapshot {
  const operation = snapshot.operations[profileId];
  const item = operation.queue.find(
    (candidate) =>
      candidate.id === itemId && candidate.queueStatus === "sending"
  );
  if (!item) return snapshot;
  const failedItem: AgentThreeQueueItem = {
    ...item,
    queueStatus: "failed",
    failedAt,
    updatedAt: failedAt,
    errorMessage,
    sentAt: undefined,
    providerMessageId: undefined,
  };
  const next = withHistory(
    {
      ...operation,
      currentItemId:
        operation.currentItemId === itemId ? null : operation.currentItemId,
      queue: operation.queue.map((candidate) =>
        candidate.id === itemId ? failedItem : candidate
      ),
    },
    "item_failed",
    failedAt,
    errorMessage,
    itemId
  );
  return updateOperation(snapshot, profileId, next);
}

export function retryAgentThreeItem(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  itemId: string,
  occurredAt: string
): AgentThreeSnapshot {
  const operation = snapshot.operations[profileId];
  if (operation.status === "running") return snapshot;
  let retried = false;
  const queue = operation.queue.map((item) => {
    if (item.id !== itemId || item.queueStatus !== "failed") return item;
    retried = true;
    return {
      ...item,
      queueStatus: "ready" as const,
      failedAt: undefined,
      errorMessage: undefined,
      updatedAt: occurredAt,
    };
  });
  return retried
    ? updateOperation(snapshot, profileId, {
        ...operation,
        status: "idle",
        queue,
        lastActivityAt: occurredAt,
      })
    : snapshot;
}

export function skipAgentThreeItem(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  itemId: string,
  occurredAt: string
): AgentThreeSnapshot {
  const operation = snapshot.operations[profileId];
  const item = operation.queue.find(
    (candidate) =>
      candidate.id === itemId &&
      candidate.queueStatus !== "sent" &&
      candidate.queueStatus !== "sending"
  );
  if (!item) return snapshot;
  const next = withHistory(
    {
      ...operation,
      queue: operation.queue.map((candidate) =>
        candidate.id === itemId
          ? {
              ...candidate,
              queueStatus: "skipped" as const,
              updatedAt: occurredAt,
            }
          : candidate
      ),
    },
    "item_skipped",
    occurredAt,
    "Item ignorado.",
    itemId
  );
  return updateOperation(snapshot, profileId, next);
}

export function finishAgentThree(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  occurredAt: string
): AgentThreeSnapshot {
  const operation = snapshot.operations[profileId];
  if (operation.status !== "running") return snapshot;
  const hasSending = operation.queue.some(
    (item) =>
      item.campaignId === operation.currentCampaignId &&
      item.queueStatus === "sending"
  );
  const hasReady = operation.queue.some(
    (item) =>
      item.campaignId === operation.currentCampaignId &&
      item.queueStatus === "ready"
  );
  return hasSending ||
    (hasReady && hasAgentThreeExecutionCapacity(operation))
    ? snapshot
    : updateOperation(snapshot, profileId, {
        ...operation,
        status: "completed",
        currentItemId: null,
        lastActivityAt: occurredAt,
      });
}

export function hasLeadReceivedCampaign(
  operation: AgentThreeOperationState,
  campaignId: string,
  leadId: string
): boolean {
  return operation.sentIndex.some(
    (record) =>
      record.campaignId === campaignId && record.leadId === leadId
  );
}

export function hasEmailReceivedCampaign(
  operation: AgentThreeOperationState,
  campaignId: string,
  email: string | null | undefined
): boolean {
  const normalizedEmail = normalizeEmail(email);
  return normalizedEmail
    ? operation.sentIndex.some(
        (record) =>
          record.campaignId === campaignId &&
          record.normalizedEmail === normalizedEmail
      )
    : false;
}

export function getAgentThreeCampaignDeliverySummary(
  operation: AgentThreeOperationState,
  campaignId: string
): AgentThreeCampaignDeliverySummary {
  const queue = operation.queue.filter(
    (item) => item.campaignId === campaignId
  );
  return {
    campaignProfileId: operation.profileId,
    campaignId,
    remaining: queue.filter(
      (item) =>
        item.queueStatus !== "sent" && item.queueStatus !== "skipped"
    ).length,
    sent: queue.filter((item) => item.queueStatus === "sent").length,
    failed: queue.filter((item) => item.queueStatus === "failed").length,
  };
}

function listLabel(item: AgentThreeQueueItem): string {
  return item.sector.trim() || "Sem setor";
}

export function getAgentThreeMetrics(
  operation: AgentThreeOperationState
): AgentThreeMetrics {
  const campaignId = operation.currentCampaignId;
  const queue = campaignId
    ? operation.queue.filter((item) => item.campaignId === campaignId)
    : operation.queue;
  const count = (status: AgentThreeQueueStatus) =>
    queue.filter((item) => item.queueStatus === status).length;
  const lists = new Map<string, AgentThreeQueueItem[]>();
  for (const item of queue) {
    const label = listLabel(item);
    lists.set(label, [...(lists.get(label) ?? []), item]);
  }
  const completedLists: string[] = [];
  const pendingLists: string[] = [];
  for (const [label, items] of lists) {
    const completed = items.every(
      (item) =>
        item.queueStatus === "sent" ||
        item.queueStatus === "failed" ||
        item.queueStatus === "blocked" ||
        item.queueStatus === "skipped"
    );
    (completed ? completedLists : pendingLists).push(label);
  }
  const currentItem =
    queue.find((item) => item.id === operation.currentItemId) ??
    queue.find(
      (item) =>
        item.queueStatus === "ready" ||
        item.queueStatus === "pending" ||
        item.queueStatus === "sending"
    );
  const blockedItems = queue.filter(
    (item) => item.queueStatus === "blocked"
  );
  const invalidRemoved = blockedItems.filter(
    (item) =>
      item.validationStatus === "invalid" ||
      item.validationStatus === "duplicate" ||
      item.validationStatus === "no_email"
  ).length;
  const otherRemoved = blockedItems.length - invalidRemoved;
  return {
    total: queue.length,
    sent: count("sent"),
    pending: count("pending"),
    ready: count("ready") + count("sending"),
    failed: count("failed"),
    blocked: count("blocked"),
    skipped: count("skipped"),
    numericLimit: operation.numericLimit,
    untilQueueEnds: operation.untilQueueEnds,
    processedCount: operation.processedCount,
    remainingCapacity: getAgentThreeRemainingCapacity(operation),
    removed: count("skipped") + otherRemoved,
    invalidRemoved,
    currentCampaignId: operation.currentCampaignId,
    currentSector: currentItem?.sector || null,
    lastActivityAt: operation.lastActivityAt,
    completedLists: completedLists.sort(),
    pendingLists: pendingLists.sort(),
  };
}

function normalizeQueueItem(
  value: unknown,
  profileId: CampaignProfileId
): AgentThreeQueueItem | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.leadId !== "string" ||
    typeof value.companyName !== "string" ||
    typeof value.createdAt !== "string"
  ) {
    return null;
  }
  const queueStatus =
    typeof value.queueStatus === "string" &&
    QUEUE_STATUSES.has(value.queueStatus as AgentThreeQueueStatus)
      ? (value.queueStatus as AgentThreeQueueStatus)
      : "pending";
  const validationStatus =
    typeof value.validationStatus === "string" &&
    VALIDATION_STATUSES.has(value.validationStatus as EmailValidationStatus)
      ? (value.validationStatus as EmailValidationStatus)
      : "pending";
  return {
    id: value.id,
    leadId: value.leadId,
    campaignProfileId: profileId,
    campaignId: optionalString(value.campaignId),
    companyName: value.companyName,
    originalEmail: nullableString(value.originalEmail),
    normalizedEmail: nullableString(value.normalizedEmail),
    sector: typeof value.sector === "string" ? value.sector : "",
    location: typeof value.location === "string" ? value.location : "",
    validationStatus,
    validationReason:
      typeof value.validationReason === "string"
        ? value.validationReason
        : "legacy_not_recorded",
    emailDomain: optionalString(value.emailDomain),
    hasMxRecords:
      typeof value.hasMxRecords === "boolean"
        ? value.hasMxRecords
        : undefined,
    exclusionReason:
      typeof value.exclusionReason === "string" &&
      EXCLUSION_REASONS.has(
        value.exclusionReason as NonNullable<
          AgentThreeQueueItem["exclusionReason"]
        >
      )
        ? (value.exclusionReason as NonNullable<
            AgentThreeQueueItem["exclusionReason"]
          >)
        : undefined,
    queueStatus,
    createdAt: value.createdAt,
    updatedAt:
      typeof value.updatedAt === "string" ? value.updatedAt : value.createdAt,
    sentAt: optionalString(value.sentAt),
    failedAt: optionalString(value.failedAt),
    errorMessage: optionalString(value.errorMessage),
    attemptCount:
      typeof value.attemptCount === "number" &&
      Number.isFinite(value.attemptCount) &&
      value.attemptCount >= 0
        ? Math.floor(value.attemptCount)
        : 0,
    providerMessageId: optionalString(value.providerMessageId),
  };
}

function normalizeHistoryEntry(value: unknown): AgentThreeHistoryEntry | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.action !== "string" ||
    typeof value.occurredAt !== "string" ||
    typeof value.detail !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    action: value.action as AgentThreeHistoryAction,
    occurredAt: value.occurredAt,
    campaignId: nullableString(value.campaignId),
    queueItemId: optionalString(value.queueItemId),
    detail: value.detail,
  };
}

function normalizeSentRecord(
  value: unknown,
  profileId: CampaignProfileId
): AgentThreeSentRecord | null {
  if (
    !isRecord(value) ||
    typeof value.queueItemId !== "string" ||
    typeof value.leadId !== "string" ||
    typeof value.campaignId !== "string" ||
    typeof value.sentAt !== "string"
  ) {
    return null;
  }
  return {
    queueItemId: value.queueItemId,
    leadId: value.leadId,
    normalizedEmail: nullableString(value.normalizedEmail),
    campaignProfileId: profileId,
    campaignId: value.campaignId,
    sentAt: value.sentAt,
    providerMessageId: optionalString(value.providerMessageId),
  };
}

function normalizeOperation(
  value: unknown,
  profileId: CampaignProfileId
): AgentThreeOperationState {
  const initial = createInitialOperation(profileId);
  if (!isRecord(value)) return initial;
  const senderConfig = isRecord(value.senderConfig)
    ? value.senderConfig
    : {};
  const queue = Array.isArray(value.queue)
    ? value.queue
        .map((item) => normalizeQueueItem(item, profileId))
        .filter((item): item is AgentThreeQueueItem => item !== null)
    : [];
  const interrupted =
    value.status === "running" ||
    queue.some((item) => item.queueStatus === "sending");
  const normalizedQueue = queue.map((item) =>
    item.queueStatus === "sending"
      ? {
          ...item,
          queueStatus: "ready" as const,
          updatedAt: item.updatedAt || item.createdAt,
        }
      : item
  );
  const persistedSentIndex = Array.isArray(value.sentIndex)
    ? value.sentIndex
        .map((record) => normalizeSentRecord(record, profileId))
        .filter((record): record is AgentThreeSentRecord => record !== null)
    : [];
  const sentByItemId = new Map(
    persistedSentIndex.map((record) => [record.queueItemId, record])
  );
  for (const item of normalizedQueue) {
    if (
      item.queueStatus !== "sent" ||
      !item.campaignId ||
      sentByItemId.has(item.id)
    ) {
      continue;
    }
    sentByItemId.set(item.id, {
      queueItemId: item.id,
      leadId: item.leadId,
      normalizedEmail: item.normalizedEmail,
      campaignProfileId: profileId,
      campaignId: item.campaignId,
      sentAt: item.sentAt ?? item.updatedAt,
      providerMessageId: item.providerMessageId,
    });
  }
  const persistedStatus =
    typeof value.status === "string" &&
    AGENT_STATUSES.has(value.status as AgentThreeStatus)
      ? (value.status as AgentThreeStatus)
      : "idle";
  const history = Array.isArray(value.history)
    ? value.history
        .map(normalizeHistoryEntry)
        .filter((entry): entry is AgentThreeHistoryEntry => entry !== null)
    : [];
  return {
    profileId,
    status: interrupted ? "paused" : persistedStatus,
    queue: normalizedQueue,
    currentItemId: interrupted ? null : nullableString(value.currentItemId),
    currentCampaignId: nullableString(value.currentCampaignId),
    selectedLeadIds: Array.isArray(value.selectedLeadIds)
      ? value.selectedLeadIds.filter(
          (leadId): leadId is string => typeof leadId === "string"
        )
      : [...new Set(normalizedQueue.map((item) => item.leadId))],
    ignoredCount:
      typeof value.ignoredCount === "number" &&
      Number.isFinite(value.ignoredCount) &&
      value.ignoredCount >= 0
        ? Math.floor(value.ignoredCount)
        : 0,
    numericLimit:
      typeof value.numericLimit === "number" &&
      Number.isInteger(value.numericLimit) &&
      value.numericLimit >= 1
        ? value.numericLimit
        : DEFAULT_AGENT_THREE_NUMERIC_LIMIT,
    untilQueueEnds: value.untilQueueEnds === true,
    processedCount:
      typeof value.processedCount === "number" &&
      Number.isFinite(value.processedCount) &&
      value.processedCount >= 0
        ? Math.floor(value.processedCount)
        : 0,
    minIntervalSeconds:
      typeof value.minIntervalSeconds === "number" &&
      Number.isFinite(value.minIntervalSeconds) &&
      value.minIntervalSeconds >= 0
        ? value.minIntervalSeconds
        : 0,
    maxIntervalSeconds:
      typeof value.maxIntervalSeconds === "number" &&
      Number.isFinite(value.maxIntervalSeconds) &&
      value.maxIntervalSeconds >= 0 &&
      value.maxIntervalSeconds >=
        (typeof value.minIntervalSeconds === "number" &&
        Number.isFinite(value.minIntervalSeconds) &&
        value.minIntervalSeconds >= 0
          ? value.minIntervalSeconds
          : 0)
        ? value.maxIntervalSeconds
        : typeof value.minIntervalSeconds === "number" &&
            Number.isFinite(value.minIntervalSeconds) &&
            value.minIntervalSeconds >= 0
          ? value.minIntervalSeconds
          : 0,
    senderConfig: {
      providerId: nullableString(senderConfig.providerId),
      fromName: nullableString(senderConfig.fromName),
      fromEmail: nullableString(senderConfig.fromEmail),
      replyTo: nullableString(senderConfig.replyTo),
    },
    sentIndex: [...sentByItemId.values()],
    history,
    lastActivityAt: nullableString(value.lastActivityAt),
    errorMessage: nullableString(value.errorMessage),
  };
}

export function normalizeAgentThreeSnapshot(
  persisted: unknown
): AgentThreeSnapshot {
  if (!isRecord(persisted)) return createInitialAgentThreeSnapshot();
  const operations = isRecord(persisted.operations)
    ? persisted.operations
    : {};
  return {
    selectedProfileId: isCampaignProfileId(persisted.selectedProfileId)
      ? persisted.selectedProfileId
      : "panek-puglesi",
    operations: {
      "panek-puglesi": normalizeOperation(
        operations["panek-puglesi"],
        "panek-puglesi"
      ),
      modeclean: normalizeOperation(operations.modeclean, "modeclean"),
    },
  };
}

export function selectPersistedAgentThreeSnapshot(
  snapshot: AgentThreeSnapshot
): AgentThreeSnapshot {
  return {
    selectedProfileId: snapshot.selectedProfileId,
    operations: Object.fromEntries(
      CAMPAIGN_PROFILE_IDS.map((profileId) => [
        profileId,
        snapshot.operations[profileId],
      ])
    ) as Record<CampaignProfileId, AgentThreeOperationState>,
  };
}
