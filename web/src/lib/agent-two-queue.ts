import type { Lead } from "../types/lead.ts";
import type {
  EmailValidationResult,
  EmailValidationStatus,
  LeadEmailValidationUpdate,
} from "../types/email-validation.ts";
import { normalizeEmail } from "./email-validation.ts";

export type AgentTwoStatus =
  | "idle"
  | "running"
  | "paused"
  | "stopped"
  | "completed"
  | "error";

export interface AgentTwoQueueItem {
  id: string;
  leadId: string;
  company: string;
  email: string | null;
  normalizedEmail: string | null;
  status: EmailValidationStatus;
  reason: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  emailDomain?: string;
  hasMxRecords?: boolean;
  isRoleBasedEmail?: boolean;
  emailValidationProvider?: string;
}

export interface AgentTwoSnapshot {
  status: AgentTwoStatus;
  queue: AgentTwoQueueItem[];
  currentItemId: string | null;
  errorMessage: string | null;
}

export interface ClaimedAgentTwoItem {
  snapshot: AgentTwoSnapshot;
  item: AgentTwoQueueItem | null;
}

export interface AgentTwoStats {
  total: number;
  pending: number;
  valid: number;
  invalid: number;
  duplicate: number;
  risky: number;
  unknown: number;
  noEmail: number;
}

export interface AgentTwoQueueAppendResult {
  snapshot: AgentTwoSnapshot;
  addedItems: AgentTwoQueueItem[];
  eligibleCount: number;
  confirmed: boolean;
}

export type ConfirmAgentTwoLoad = (eligibleCount: number) => boolean;

export const INITIAL_AGENT_TWO_SNAPSHOT: AgentTwoSnapshot = {
  status: "idle",
  queue: [],
  currentItemId: null,
  errorMessage: null,
};

const AGENT_STATUSES = new Set<AgentTwoStatus>([
  "idle",
  "running",
  "paused",
  "stopped",
  "completed",
  "error",
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

const TERMINAL_STATUSES = new Set<EmailValidationStatus>([
  "valid",
  "invalid",
  "duplicate",
  "risky",
  "catch_all",
  "unknown",
  "no_email",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isQueueItem(value: unknown): value is AgentTwoQueueItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.leadId === "string" &&
    typeof value.company === "string" &&
    (typeof value.email === "string" || value.email === null) &&
    (typeof value.normalizedEmail === "string" ||
      value.normalizedEmail === null) &&
    typeof value.status === "string" &&
    VALIDATION_STATUSES.has(value.status as EmailValidationStatus) &&
    typeof value.reason === "string" &&
    typeof value.createdAt === "string" &&
    isOptionalString(value.startedAt) &&
    isOptionalString(value.completedAt) &&
    isOptionalString(value.errorMessage)
  );
}

function hasCompletedValidation(lead: Lead): boolean {
  return (
    lead.emailValidationStatus !== undefined &&
    TERMINAL_STATUSES.has(lead.emailValidationStatus)
  );
}

export function buildAgentTwoQueue(
  leads: Lead[],
  createdAt: string,
  revalidate = false
): AgentTwoQueueItem[] {
  const firstLeadByEmail = new Map<string, string>();
  const queue: AgentTwoQueueItem[] = [];

  leads.forEach((lead, index) => {
    const normalizedEmail = normalizeEmail(lead.email);
    const duplicateOf = normalizedEmail
      ? firstLeadByEmail.get(normalizedEmail)
      : undefined;
    if (normalizedEmail && !duplicateOf) {
      firstLeadByEmail.set(normalizedEmail, lead.id);
    }

    if (!revalidate && hasCompletedValidation(lead)) return;

    let status: EmailValidationStatus = "pending";
    let reason = "pending";
    let completedAt: string | undefined;
    if (!normalizedEmail) {
      status = "no_email";
      reason = "no_email";
      completedAt = createdAt;
    } else if (duplicateOf) {
      status = "duplicate";
      reason = "duplicate_of:" + duplicateOf;
      completedAt = createdAt;
    }

    queue.push({
      id: "agent-two-" + createdAt + "-" + index + "-" + lead.id,
      leadId: lead.id,
      company: lead.company,
      email: lead.email,
      normalizedEmail,
      status,
      reason,
      createdAt,
      completedAt,
      isRoleBasedEmail: false,
      emailValidationProvider: "local_dns",
    });
  });

  return queue;
}

function collectAgentTwoEligibleLeads(
  leads: Lead[],
  existingQueue: AgentTwoQueueItem[],
  limit: number,
  createdAt: string
): { items: AgentTwoQueueItem[]; eligibleCount: number } {
  const existingLeadIds = new Set(existingQueue.map((item) => item.leadId));
  const firstLeadByEmail = new Map<string, string>();
  for (const item of existingQueue) {
    if (item.normalizedEmail && !firstLeadByEmail.has(item.normalizedEmail)) {
      firstLeadByEmail.set(item.normalizedEmail, item.leadId);
    }
  }

  const eligible: Array<{
    lead: Lead;
    index: number;
    normalizedEmail: string;
    duplicateOf?: string;
  }> = [];

  leads.forEach((lead, index) => {
    const normalizedEmail = normalizeEmail(lead.email);
    const duplicateOf = normalizedEmail
      ? firstLeadByEmail.get(normalizedEmail)
      : undefined;
    if (normalizedEmail && !duplicateOf) {
      firstLeadByEmail.set(normalizedEmail, lead.id);
    }
    if (
      !normalizedEmail ||
      hasCompletedValidation(lead) ||
      existingLeadIds.has(lead.id)
    ) {
      return;
    }
    eligible.push({ lead, index, normalizedEmail, duplicateOf });
  });

  const safeLimit = Number.isFinite(limit)
    ? Math.max(0, Math.floor(limit))
    : eligible.length;
  const items = eligible.slice(0, safeLimit).map(
    ({ lead, index, normalizedEmail, duplicateOf }): AgentTwoQueueItem => ({
      id:
        "agent-two-" +
        createdAt +
        "-" +
        (existingQueue.length + index) +
        "-" +
        lead.id,
      leadId: lead.id,
      company: lead.company,
      email: lead.email,
      normalizedEmail,
      status: duplicateOf ? "duplicate" : "pending",
      reason: duplicateOf ? "duplicate_of:" + duplicateOf : "pending",
      createdAt,
      completedAt: duplicateOf ? createdAt : undefined,
      isRoleBasedEmail: false,
      emailValidationProvider: "local_dns",
    })
  );

  return { items, eligibleCount: eligible.length };
}

export function getAgentTwoEligibleLeadCount(
  leads: Lead[],
  existingQueue: AgentTwoQueueItem[]
): number {
  return collectAgentTwoEligibleLeads(
    leads,
    existingQueue,
    Number.POSITIVE_INFINITY,
    "count"
  ).eligibleCount;
}

export function appendAgentTwoQueue(
  snapshot: AgentTwoSnapshot,
  leads: Lead[],
  limit: number,
  createdAt: string
): AgentTwoQueueAppendResult {
  const { items, eligibleCount } = collectAgentTwoEligibleLeads(
    leads,
    snapshot.queue,
    limit,
    createdAt
  );
  const canResetStatus =
    snapshot.status !== "running" && snapshot.status !== "paused";
  return {
    snapshot:
      items.length === 0
        ? snapshot
        : {
            ...snapshot,
            status: canResetStatus ? "idle" : snapshot.status,
            queue: [...snapshot.queue, ...items],
            errorMessage: null,
          },
    addedItems: items,
    eligibleCount,
    confirmed: true,
  };
}

export function appendAllAgentTwoQueue(
  snapshot: AgentTwoSnapshot,
  leads: Lead[],
  createdAt: string,
  confirmLoad: ConfirmAgentTwoLoad
): AgentTwoQueueAppendResult {
  const eligibleCount = getAgentTwoEligibleLeadCount(leads, snapshot.queue);
  if (eligibleCount === 0 || !confirmLoad(eligibleCount)) {
    return {
      snapshot,
      addedItems: [],
      eligibleCount,
      confirmed: false,
    };
  }
  return appendAgentTwoQueue(snapshot, leads, eligibleCount, createdAt);
}

export function parseAgentTwoLoadQuantity(
  value: string,
  maximum: number
): { quantity: number | null; error: string | null } {
  const trimmed = value.trim();
  const quantity = Number(trimmed);
  if (!trimmed || !Number.isInteger(quantity) || quantity < 1) {
    return {
      quantity: null,
      error: "Informe uma quantidade inteira maior ou igual a 1.",
    };
  }
  if (quantity > maximum) {
    return {
      quantity: null,
      error: "A quantidade não pode superar os e-mails pendentes disponíveis.",
    };
  }
  return { quantity, error: null };
}

export function startAgentTwo(snapshot: AgentTwoSnapshot): AgentTwoSnapshot {
  const hasWork = snapshot.queue.some((item) => item.status === "pending");
  if (!hasWork) return snapshot;
  return {
    ...snapshot,
    status: "running",
    currentItemId: null,
    errorMessage: null,
    queue: snapshot.queue.map((item) =>
      item.status === "validating"
        ? { ...item, status: "pending", reason: "pending" }
        : item
    ),
  };
}

export function pauseAgentTwo(snapshot: AgentTwoSnapshot): AgentTwoSnapshot {
  return snapshot.status === "running"
    ? { ...snapshot, status: "paused" }
    : snapshot;
}

export function resumeAgentTwo(
  snapshot: AgentTwoSnapshot,
  currentValidationIsActive = false
): AgentTwoSnapshot {
  if (snapshot.status !== "paused") return snapshot;
  if (currentValidationIsActive && snapshot.currentItemId) {
    return { ...snapshot, status: "running" };
  }
  return {
    ...snapshot,
    status: "running",
    currentItemId: null,
    queue: snapshot.queue.map((item) =>
      item.status === "validating"
        ? { ...item, status: "pending", reason: "pending" }
        : item
    ),
  };
}

export function stopAgentTwo(snapshot: AgentTwoSnapshot): AgentTwoSnapshot {
  if (snapshot.status !== "running" && snapshot.status !== "paused") {
    return snapshot;
  }
  return {
    ...snapshot,
    status: "stopped",
    currentItemId: null,
    queue: snapshot.queue.map((item) =>
      item.status === "validating"
        ? { ...item, status: "pending", reason: "pending" }
        : item
    ),
  };
}

export function claimNextAgentTwoItem(
  snapshot: AgentTwoSnapshot,
  startedAt: string
): ClaimedAgentTwoItem {
  if (
    snapshot.status !== "running" ||
    snapshot.currentItemId !== null ||
    snapshot.queue.some((item) => item.status === "validating")
  ) {
    return { snapshot, item: null };
  }
  const next = snapshot.queue.find((item) => item.status === "pending");
  if (!next) return { snapshot, item: null };
  const claimed: AgentTwoQueueItem = {
    ...next,
    status: "validating",
    reason: "validating",
    startedAt: next.startedAt ?? startedAt,
    errorMessage: undefined,
  };
  return {
    snapshot: {
      ...snapshot,
      currentItemId: claimed.id,
      queue: snapshot.queue.map((item) =>
        item.id === claimed.id ? claimed : item
      ),
    },
    item: claimed,
  };
}

export function completeAgentTwoItem(
  snapshot: AgentTwoSnapshot,
  id: string,
  result: EmailValidationResult
): AgentTwoSnapshot {
  return {
    ...snapshot,
    currentItemId: snapshot.currentItemId === id ? null : snapshot.currentItemId,
    queue: snapshot.queue.map((item) =>
      item.id === id
        ? {
            ...item,
            normalizedEmail: result.normalizedEmail,
            status: result.status,
            reason: result.reason,
            completedAt: result.validatedAt,
            errorMessage: undefined,
            emailDomain: result.domain ?? undefined,
            hasMxRecords: result.hasMxRecords ?? undefined,
            isRoleBasedEmail: result.isRoleBasedEmail,
            emailValidationProvider: result.provider,
          }
        : item
    ),
  };
}

export function failAgentTwoItem(
  snapshot: AgentTwoSnapshot,
  id: string,
  errorMessage: string,
  completedAt: string
): AgentTwoSnapshot {
  return {
    ...snapshot,
    currentItemId: snapshot.currentItemId === id ? null : snapshot.currentItemId,
    queue: snapshot.queue.map((item) =>
      item.id === id
        ? {
            ...item,
            status: "unknown",
            reason: "validation_error",
            errorMessage,
            completedAt,
          }
        : item
    ),
  };
}

export function finishAgentTwo(snapshot: AgentTwoSnapshot): AgentTwoSnapshot {
  if (snapshot.status !== "running") return snapshot;
  const hasWork = snapshot.queue.some(
    (item) => item.status === "pending" || item.status === "validating"
  );
  return hasWork
    ? snapshot
    : { ...snapshot, status: "completed", currentItemId: null };
}

export function failAgentTwo(
  snapshot: AgentTwoSnapshot,
  errorMessage: string
): AgentTwoSnapshot {
  return {
    ...snapshot,
    status: "error",
    currentItemId: null,
    errorMessage,
    queue: snapshot.queue.map((item) =>
      item.status === "validating"
        ? { ...item, status: "pending", reason: "pending" }
        : item
    ),
  };
}

export function selectPersistedAgentTwoSnapshot(
  snapshot: AgentTwoSnapshot
): AgentTwoSnapshot {
  return {
    status: snapshot.status,
    queue: snapshot.queue,
    currentItemId: snapshot.currentItemId,
    errorMessage: snapshot.errorMessage,
  };
}

export function normalizeAgentTwoSnapshot(persisted: unknown): AgentTwoSnapshot {
  if (!isRecord(persisted)) return INITIAL_AGENT_TWO_SNAPSHOT;
  const queue = Array.isArray(persisted.queue)
    ? persisted.queue.filter(isQueueItem)
    : [];
  const persistedStatus =
    typeof persisted.status === "string" &&
    AGENT_STATUSES.has(persisted.status as AgentTwoStatus)
      ? (persisted.status as AgentTwoStatus)
      : "idle";
  const interrupted = persistedStatus === "running";
  const normalizedQueue = queue.map((item) =>
    interrupted && item.status === "validating"
      ? { ...item, status: "pending" as const, reason: "pending" }
      : item
  );
  const currentItemId =
    !interrupted &&
    typeof persisted.currentItemId === "string" &&
    normalizedQueue.some((item) => item.id === persisted.currentItemId)
      ? persisted.currentItemId
      : null;
  return {
    status: interrupted ? "paused" : persistedStatus,
    queue: normalizedQueue,
    currentItemId,
    errorMessage:
      typeof persisted.errorMessage === "string"
        ? persisted.errorMessage
        : null,
  };
}

export function queueItemToLeadUpdate(
  item: AgentTwoQueueItem
): LeadEmailValidationUpdate | null {
  if (!TERMINAL_STATUSES.has(item.status) || !item.completedAt) return null;
  return {
    emailValidationStatus: item.status,
    emailValidationReason: item.reason,
    normalizedEmail: item.normalizedEmail ?? undefined,
    emailValidatedAt: item.completedAt,
    emailValidationProvider: "local_dns",
    emailDomain: item.emailDomain,
    hasMxRecords: item.hasMxRecords,
    isRoleBasedEmail: item.isRoleBasedEmail ?? false,
  };
}

export function emailResultToLeadUpdate(
  result: EmailValidationResult
): LeadEmailValidationUpdate {
  return {
    emailValidationStatus: result.status,
    emailValidationReason: result.reason,
    normalizedEmail: result.normalizedEmail ?? undefined,
    emailValidatedAt: result.validatedAt,
    emailValidationProvider: result.provider,
    emailDomain: result.domain ?? undefined,
    hasMxRecords: result.hasMxRecords ?? undefined,
    isRoleBasedEmail: result.isRoleBasedEmail,
  };
}

export function getAgentTwoStats(queue: AgentTwoQueueItem[]): AgentTwoStats {
  const count = (status: EmailValidationStatus) =>
    queue.filter((item) => item.status === status).length;
  return {
    total: queue.length,
    pending: count("pending") + count("validating"),
    valid: count("valid"),
    invalid: count("invalid"),
    duplicate: count("duplicate"),
    risky: count("risky") + count("catch_all"),
    unknown: count("unknown"),
    noEmail: count("no_email"),
  };
}
