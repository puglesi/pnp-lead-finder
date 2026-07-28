import type { EmailValidationStatus } from "../types/email-validation.ts";
import type { Lead } from "../types/lead.ts";
import {
  CAMPAIGN_PROFILE_IDS,
  isCampaignProfileId,
  type CampaignProfileId,
} from "../types/campaign-profile.ts";
import { normalizeEmail } from "./email-validation.ts";

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
  | "leads_loaded"
  | "started"
  | "start_blocked"
  | "paused"
  | "resumed"
  | "stopped"
  | "item_sent"
  | "item_failed"
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
  const next = withHistory(
    { ...operation, currentCampaignId: campaignId },
    "campaign_selected",
    occurredAt,
    campaignId ? "Campanha selecionada." : "Campanha removida da seleção."
  );
  return updateOperation(snapshot, profileId, next);
}

function classifyLead(lead: Lead): {
  validationStatus: EmailValidationStatus;
  validationReason: string;
  queueStatus: AgentThreeQueueStatus;
} {
  const validationStatus = lead.emailValidationStatus ?? "pending";
  const validationReason =
    lead.emailValidationReason ??
    (lead.emailValidationStatus ? "reason_not_recorded" : "awaiting_validation");

  if (validationStatus === "valid") {
    return { validationStatus, validationReason, queueStatus: "ready" };
  }
  if (validationStatus === "pending" || validationStatus === "validating") {
    return { validationStatus, validationReason, queueStatus: "pending" };
  }
  return { validationStatus, validationReason, queueStatus: "blocked" };
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

export const NO_SENDING_PROVIDER_MESSAGE =
  "Nenhum provedor de envio configurado.";

export function startAgentThree(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  providerConfigured: boolean,
  occurredAt: string
): AgentThreeStartResult {
  const operation = snapshot.operations[profileId];
  if (!providerConfigured) {
    const blockedOperation = withHistory(
      operation,
      "start_blocked",
      occurredAt,
      NO_SENDING_PROVIDER_MESSAGE
    );
    return {
      snapshot: updateOperation(snapshot, profileId, blockedOperation),
      started: false,
      message: NO_SENDING_PROVIDER_MESSAGE,
    };
  }
  if (!operation.currentCampaignId) {
    return {
      snapshot,
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
      snapshot,
      started: false,
      message: "Não existem itens preparados nesta campanha.",
    };
  }
  const next = withHistory(
    {
      ...operation,
      status: "running",
      currentItemId: null,
      errorMessage: null,
    },
    "started",
    occurredAt,
    "Execução iniciada."
  );
  return {
    snapshot: updateOperation(snapshot, profileId, next),
    started: true,
    message: null,
  };
}

export function pauseAgentThree(
  snapshot: AgentThreeSnapshot,
  profileId: CampaignProfileId,
  occurredAt: string
): AgentThreeSnapshot {
  const operation = snapshot.operations[profileId];
  if (operation.status !== "running") return snapshot;
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
  occurredAt: string
): AgentThreeSnapshot {
  const operation = snapshot.operations[profileId];
  if (operation.status !== "running" && operation.status !== "paused") {
    return snapshot;
  }
  const next = withHistory(
    {
      ...operation,
      status: "stopped",
      currentItemId: null,
      queue: operation.queue.map((item) =>
        item.queueStatus === "sending"
          ? { ...item, queueStatus: "ready" as const, updatedAt: occurredAt }
          : item
      ),
    },
    "stopped",
    occurredAt,
    "Execução interrompida; a fila foi preservada."
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
    operation.queue.some((item) => item.queueStatus === "sending")
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
  const hasWork = operation.queue.some(
    (item) =>
      item.campaignId === operation.currentCampaignId &&
      (item.queueStatus === "ready" || item.queueStatus === "sending")
  );
  return hasWork
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
  const count = (status: AgentThreeQueueStatus) =>
    operation.queue.filter((item) => item.queueStatus === status).length;
  const lists = new Map<string, AgentThreeQueueItem[]>();
  for (const item of operation.queue) {
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
    operation.queue.find((item) => item.id === operation.currentItemId) ??
    operation.queue.find(
      (item) =>
        item.campaignId === operation.currentCampaignId &&
        (item.queueStatus === "ready" ||
          item.queueStatus === "pending" ||
          item.queueStatus === "sending")
    );
  return {
    total: operation.queue.length,
    sent: count("sent"),
    pending: count("pending"),
    ready: count("ready") + count("sending"),
    failed: count("failed"),
    blocked: count("blocked"),
    skipped: count("skipped") + operation.ignoredCount,
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
