import { normalizeEmail } from "./email-validation.ts";
import type { CampaignProfileId } from "../types/campaign-profile.ts";
import type { PermanentContactBlock } from "./global-email-deduplication.ts";

export const EMAIL_BLOCK_REASONS = [
  "respondeu",
  "nao_interessado",
  "nao_contatar",
  "unsubscribe",
  "bounce",
  "manual",
  "outro",
] as const;

export type EmailBlockReason = (typeof EMAIL_BLOCK_REASONS)[number];

export type EmailBlockOperationScope =
  | CampaignProfileId
  | "both";

export interface EmailBlocklistEntry {
  id: string;
  normalizedEmail: string;
  reason: EmailBlockReason;
  /** Operação P&P, Modeclean ou ambas. */
  operation: EmailBlockOperationScope;
  note?: string;
  blockedAt: string;
  source?: "manual" | "system";
}

export const EMAIL_BLOCK_REASON_LABELS: Record<EmailBlockReason, string> = {
  respondeu: "Respondeu",
  nao_interessado: "Não interessado",
  nao_contatar: "Não contatar",
  unsubscribe: "Unsubscribe",
  bounce: "Bounce",
  manual: "Manual",
  outro: "Outro",
};

export const EMAIL_BLOCK_OPERATION_LABELS: Record<
  EmailBlockOperationScope,
  string
> = {
  "panek-puglesi": "P&P",
  modeclean: "Modeclean",
  both: "Ambas",
};

export function isEmailBlockReason(value: unknown): value is EmailBlockReason {
  return (
    typeof value === "string" &&
    (EMAIL_BLOCK_REASONS as readonly string[]).includes(value)
  );
}

export function isEmailBlockOperationScope(
  value: unknown
): value is EmailBlockOperationScope {
  return (
    value === "panek-puglesi" || value === "modeclean" || value === "both"
  );
}

export function parseEmailListInput(raw: string): string[] {
  const parts = raw
    .split(/[\s,;]+/g)
    .map((part) => part.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    const email = normalizeEmail(part);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    result.push(email);
  }
  return result;
}

export function createEmailBlocklistEntry(input: {
  email: string;
  reason: EmailBlockReason;
  operation?: EmailBlockOperationScope;
  note?: string;
  blockedAt?: string;
  source?: "manual" | "system";
  id?: string;
}): EmailBlocklistEntry | null {
  const normalizedEmail = normalizeEmail(input.email);
  if (!normalizedEmail) return null;
  const note = input.note?.trim() || undefined;
  return {
    id: input.id ?? `block-${normalizedEmail}-${Date.now()}`,
    normalizedEmail,
    reason: input.reason,
    operation: input.operation ?? "both",
    note,
    blockedAt: input.blockedAt ?? new Date().toISOString(),
    source: input.source ?? "manual",
  };
}

export function operationMatchesBlock(
  entryOperation: EmailBlockOperationScope,
  profileId: CampaignProfileId
): boolean {
  return entryOperation === "both" || entryOperation === profileId;
}

export function findEmailBlock(
  entries: readonly EmailBlocklistEntry[] | null | undefined,
  email: string | null | undefined,
  profileId?: CampaignProfileId
): EmailBlocklistEntry | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const list = Array.isArray(entries) ? entries : [];
  return (
    list.find((entry) => {
      if (!entry || entry.normalizedEmail !== normalized) return false;
      if (!profileId) return true;
      return operationMatchesBlock(entry.operation, profileId);
    }) ?? null
  );
}

export function isEmailBlocked(
  entries: readonly EmailBlocklistEntry[] | null | undefined,
  email: string | null | undefined,
  profileId?: CampaignProfileId
): boolean {
  return findEmailBlock(entries, email, profileId) !== null;
}

/**
 * Converts the persisted blocklist into the permanent-block shape used by
 * global deduplication and Agent 3 (same suppression source of truth).
 */
export function emailBlocklistToPermanentBlocks(
  entries: readonly EmailBlocklistEntry[] | null | undefined
): PermanentContactBlock[] {
  const blocks: PermanentContactBlock[] = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry) continue;
    const reason: PermanentContactBlock["reason"] =
      entry.reason === "unsubscribe"
        ? "unsubscribed"
        : entry.reason === "bounce"
          ? "permanent_bounce"
          : "contact_blocked";
    const operations: CampaignProfileId[] =
      entry.operation === "both"
        ? ["panek-puglesi", "modeclean"]
        : [entry.operation];
    for (const operation of operations) {
      blocks.push({
        operation,
        normalizedEmail: entry.normalizedEmail,
        reason,
        occurredAt: entry.blockedAt,
      });
    }
  }
  return blocks;
}

export function mergePermanentBlocks(
  ...lists: Array<readonly PermanentContactBlock[] | undefined>
): PermanentContactBlock[] {
  const map = new Map<string, PermanentContactBlock>();
  for (const list of lists) {
    if (!list) continue;
    for (const block of list) {
      const key = `${block.operation}\u0000${block.normalizedEmail}`;
      const existing = map.get(key);
      if (!existing || block.occurredAt > existing.occurredAt) {
        map.set(key, block);
      }
    }
  }
  return [...map.values()];
}
