import type { BatchLeadStats, LeadBatch, PipelineStage } from "../types/batch.ts";
import type { Lead, SearchRecord } from "../types/lead.ts";

function slugPart(value: string, max = 24): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
  return slug || "lote";
}

function shortId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

export function createLeadBatchId(input: {
  sector: string;
  location: string;
  createdAt: string;
  foundCount: number;
}): string {
  const day = input.createdAt.slice(0, 10).replace(/-/g, "");
  return [
    "batch",
    slugPart(input.sector, 20),
    slugPart(input.location, 16),
    day,
    String(Math.max(0, Math.floor(input.foundCount))),
    shortId(),
  ].join("-");
}

export function buildLeadBatchLabel(input: {
  sector: string;
  location: string;
  foundCount: number;
  createdAt: string;
}): string {
  const day = input.createdAt.slice(0, 10);
  return `${input.sector} · ${input.location} · ${input.foundCount} leads · ${day}`;
}

export function createLeadBatch(input: {
  sector: string;
  location: string;
  foundCount: number;
  createdAt?: string;
  searchRecordId?: string;
  stage?: PipelineStage;
  /** Optional fixed id (e.g. rehydrate a batch that already stamped leads). */
  batchId?: string;
  /** Exclusive snapshot membership — never expand by sector/location. */
  leadIds?: readonly string[];
  campaignId?: string;
}): LeadBatch {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const foundCount = Math.max(0, Math.floor(input.foundCount));
  const batchId =
    input.batchId?.trim() ||
    createLeadBatchId({
      sector: input.sector,
      location: input.location,
      createdAt,
      foundCount,
    });
  const leadIds = uniqueLeadIds(input.leadIds);
  return {
    batchId,
    sector: input.sector.trim(),
    location: input.location.trim(),
    createdAt,
    foundCount: leadIds.length > 0 ? leadIds.length : foundCount,
    stage: input.stage ?? "search",
    searchRecordId: input.searchRecordId,
    campaignId: input.campaignId,
    label: buildLeadBatchLabel({
      sector: input.sector.trim(),
      location: input.location.trim(),
      foundCount: leadIds.length > 0 ? leadIds.length : foundCount,
      createdAt,
    }),
    leadIds: leadIds.length > 0 ? leadIds : undefined,
  };
}

function uniqueLeadIds(ids: readonly string[] | undefined): string[] {
  if (!ids || ids.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const trimmed = id?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function stampLeadsWithBatchId(
  leads: readonly Lead[],
  batchId: string
): Lead[] {
  return leads.map((lead) => ({ ...lead, batchId }));
}

/** Shared batchId when every lead already belongs to the same lote. */
export function getSharedLeadBatchId(
  leads: readonly Lead[]
): string | null {
  if (leads.length === 0) return null;
  const first = leads[0]?.batchId?.trim();
  if (!first) return null;
  return leads.every((lead) => lead.batchId === first) ? first : null;
}

function sameLeadIdSet(
  a: readonly Lead[] | undefined,
  b: readonly Lead[]
): boolean {
  if (!a || a.length !== b.length) return false;
  const idsB = new Set(b.map((lead) => lead.id));
  return a.every((lead) => idsB.has(lead.id));
}

/**
 * Migrates a completed search that predates batchId.
 * Membership is EXCLUSIVELY the snapshot lead IDs — never sector/location/fingerprint.
 * Does NOT re-run search, delete, or duplicate leads.
 */
export function migrateLegacySearchToBatch(input: {
  sector: string;
  location: string;
  leads: readonly Lead[];
  savedLeads?: readonly Lead[];
  recentSearches?: readonly SearchRecord[];
  fullSearchHistory?: readonly SearchRecord[];
  createdAt?: string;
  searchRecordId?: string;
}): {
  batch: LeadBatch;
  createdNewBatch: boolean;
  currentLeads: Lead[];
  savedLeads: Lead[];
  recentSearches: SearchRecord[];
  fullSearchHistory: SearchRecord[];
} {
  const sector = input.sector.trim() || "Busca";
  const location = input.location.trim() || "UK";
  const leads = input.leads;
  const leadIds = uniqueLeadIds(leads.map((lead) => lead.id));
  const foundCount = leadIds.length;
  const createdAt = input.createdAt ?? new Date().toISOString();

  const existingShared = getSharedLeadBatchId(leads);
  const batch = createLeadBatch({
    sector,
    location,
    foundCount,
    createdAt,
    searchRecordId: input.searchRecordId,
    stage: "search",
    batchId: existingShared ?? undefined,
    leadIds,
  });

  // Stamp ONLY the snapshot leads — never attach batchId by fingerprint/category.
  const currentLeads = stampLeadsWithBatchId(leads, batch.batchId);
  const memberIds = new Set(leadIds);

  // Detach this batchId from non-members in saved pool; never expand membership.
  const savedLeads = clearBatchIdFromNonMembers(
    input.savedLeads ?? [],
    batch.batchId,
    leadIds
  ).map((lead) => {
    // Exact same lead id as snapshot may keep/receive batchId; fingerprint never does.
    if (memberIds.has(lead.id)) {
      return { ...lead, batchId: batch.batchId };
    }
    return lead;
  });

  const stampSearchRecords = (records: readonly SearchRecord[]) =>
    records.map((record) => {
      // Prefer explicit SearchRecord id — never all keyword/location matches.
      if (input.searchRecordId) {
        if (record.id !== input.searchRecordId) return record;
      } else if (!sameLeadIdSet(record.leads, leads)) {
        return record;
      }
      if (record.batchId && record.batchId !== batch.batchId) return record;

      const recordLeads = stampLeadsWithBatchId(
        record.leads && record.leads.length > 0 ? record.leads : leads,
        batch.batchId
      );
      return {
        ...record,
        batchId: batch.batchId,
        leads: recordLeads,
        resultsCount: recordLeads.length,
      };
    });

  return {
    batch,
    createdNewBatch: !existingShared,
    currentLeads,
    savedLeads,
    recentSearches: stampSearchRecords(input.recentSearches ?? []),
    fullSearchHistory: stampSearchRecords(input.fullSearchHistory ?? []),
  };
}

/**
 * Remove batchId from leads that are not exclusive members of the snapshot.
 * Does not delete leads — only detaches wrong associations.
 */
export function clearBatchIdFromNonMembers(
  leads: readonly Lead[],
  batchId: string,
  memberIds: readonly string[]
): Lead[] {
  const allowed = new Set(memberIds);
  return leads.map((lead) => {
    if (lead.batchId !== batchId) return lead;
    if (allowed.has(lead.id)) return lead;
    const next = { ...lead };
    delete next.batchId;
    return next;
  });
}

export function filterLeadsByBatchId(
  leads: readonly Lead[],
  batchId: string | null | undefined
): Lead[] {
  if (!batchId) return [];
  return leads.filter((lead) => lead.batchId === batchId);
}

/**
 * Exclusive membership by snapshot IDs only.
 * NEVER falls back to lead.batchId / sector / location / fingerprint.
 * Empty memberIds → empty result (safer than expanding the lote).
 */
export function filterLeadsByMemberIds(
  leads: readonly Lead[],
  memberIds: readonly string[] | null | undefined
): Lead[] {
  const exclusiveIds = uniqueLeadIds(memberIds ?? undefined);
  if (exclusiveIds.length === 0) return [];
  const allowed = new Set(exclusiveIds);
  const byId = new Map<string, Lead>();
  for (const lead of leads) {
    if (allowed.has(lead.id) && !byId.has(lead.id)) {
      byId.set(lead.id, lead);
    }
  }
  return exclusiveIds
    .map((id) => byId.get(id))
    .filter((lead): lead is Lead => Boolean(lead));
}

/**
 * Exclusive batch membership. When leadIds are known, ONLY those IDs count.
 * Without memberIds returns [] in exclusive contexts — use filterLeadsByBatchId
 * only for legacy non-snapshot paths.
 */
export function filterLeadsForBatch(
  leads: readonly Lead[],
  batchId: string | null | undefined,
  memberIds?: readonly string[] | null
): Lead[] {
  if (!batchId) return [];
  const exclusiveIds = uniqueLeadIds(memberIds ?? undefined);
  if (exclusiveIds.length > 0) {
    return filterLeadsByMemberIds(leads, exclusiveIds);
  }
  // No snapshot membership known — do NOT expand by batchId stamp.
  return [];
}

/** Snapshot IDs from the original SearchRecord — exclusive source of truth. */
export function getSearchRecordSnapshotLeadIds(
  record: SearchRecord | null | undefined
): string[] {
  if (!record?.leads || record.leads.length === 0) return [];
  return uniqueLeadIds(record.leads.map((lead) => lead.id));
}

/**
 * Integrity: batch.leadIds.length must equal the search foundCount/resultsCount.
 */
export function validateBatchSnapshotIntegrity(
  batch: Pick<LeadBatch, "leadIds" | "foundCount">,
  expectedCount?: number
): {
  ok: boolean;
  leadCount: number;
  foundCount: number;
  expectedCount: number;
} {
  const leadCount = uniqueLeadIds(batch.leadIds).length;
  const foundCount = Math.max(0, Math.floor(batch.foundCount));
  const expected =
    typeof expectedCount === "number" && expectedCount >= 0
      ? Math.floor(expectedCount)
      : foundCount;
  return {
    ok: leadCount === expected && leadCount === foundCount && leadCount > 0,
    leadCount,
    foundCount,
    expectedCount: expected,
  };
}

/**
 * Repair batch membership from the SearchRecord snapshot.
 * Removes contaminant IDs from the batch (not from the database).
 * Does NOT use sector/location/fingerprint to grow membership.
 */
export function repairBatchFromSearchSnapshot(input: {
  batch: LeadBatch;
  searchRecord?: SearchRecord | null;
  currentLeads?: readonly Lead[];
  savedLeads?: readonly Lead[];
}): {
  batch: LeadBatch;
  currentLeads: Lead[];
  savedLeads: Lead[];
  repaired: boolean;
  removedCount: number;
  integrity: ReturnType<typeof validateBatchSnapshotIntegrity>;
} {
  const snapshotIds = getSearchRecordSnapshotLeadIds(input.searchRecord);
  const expectedFromRecord =
    input.searchRecord && typeof input.searchRecord.resultsCount === "number"
      ? Math.max(0, Math.floor(input.searchRecord.resultsCount))
      : undefined;

  // Prefer SearchRecord snapshot IDs. Never keep contaminated leadIds that
  // grew beyond the original search resultsCount.
  let nextLeadIds = snapshotIds;
  if (nextLeadIds.length === 0) {
    const existing = uniqueLeadIds(input.batch.leadIds);
    const expected = expectedFromRecord ?? input.batch.foundCount;
    // Keep existing only when integrity already holds.
    if (existing.length > 0 && existing.length === expected) {
      nextLeadIds = existing;
    }
  }

  const previousIds = uniqueLeadIds(input.batch.leadIds);
  const previousSet = new Set(previousIds);
  const nextSet = new Set(nextLeadIds);
  let removedCount = 0;
  for (const id of previousIds) {
    if (!nextSet.has(id)) removedCount += 1;
  }
  // Contaminants that only had batchId stamp (not in previous leadIds list)
  // are detached below via clearBatchIdFromNonMembers.

  const foundCount =
    nextLeadIds.length > 0
      ? nextLeadIds.length
      : expectedFromRecord ?? input.batch.foundCount;

  const batch: LeadBatch = {
    ...input.batch,
    leadIds: nextLeadIds.length > 0 ? nextLeadIds : undefined,
    foundCount,
    searchRecordId:
      input.searchRecord?.id ?? input.batch.searchRecordId,
    label: buildLeadBatchLabel({
      sector: input.batch.sector,
      location: input.batch.location,
      foundCount,
      createdAt: input.batch.createdAt,
    }),
  };

  const currentLeads = clearBatchIdFromNonMembers(
    input.currentLeads ?? [],
    batch.batchId,
    nextLeadIds
  ).map((lead) =>
    nextSet.has(lead.id) ? { ...lead, batchId: batch.batchId } : lead
  );

  const savedLeads = clearBatchIdFromNonMembers(
    input.savedLeads ?? [],
    batch.batchId,
    nextLeadIds
  ).map((lead) =>
    nextSet.has(lead.id) ? { ...lead, batchId: batch.batchId } : lead
  );

  // Count contaminants detached that were never in previous leadIds.
  for (const lead of [
    ...(input.currentLeads ?? []),
    ...(input.savedLeads ?? []),
  ]) {
    if (
      lead.batchId === batch.batchId &&
      !nextSet.has(lead.id) &&
      !previousSet.has(lead.id)
    ) {
      removedCount += 1;
    }
  }

  const integrity = validateBatchSnapshotIntegrity(
    batch,
    expectedFromRecord ?? foundCount
  );

  const repaired =
    removedCount > 0 ||
    previousIds.length !== nextLeadIds.length ||
    !integrity.ok ||
    previousIds.some((id, i) => id !== nextLeadIds[i]);

  return {
    batch,
    currentLeads,
    savedLeads,
    repaired: Boolean(repaired),
    removedCount,
    integrity,
  };
}

/** Find the SearchRecord that owns this batch (snapshot source of truth). */
export function findSearchRecordForBatch(
  batch: LeadBatch,
  records: readonly SearchRecord[]
): SearchRecord | null {
  if (batch.searchRecordId) {
    const byId = records.find((r) => r.id === batch.searchRecordId);
    if (byId) return byId;
  }
  const byBatchId = records.find((r) => r.batchId === batch.batchId);
  if (byBatchId) return byBatchId;

  // Last resort: exact sector + location + resultsCount matching foundCount.
  // Still requires a stored snapshot; never invents IDs.
  const expected = batch.foundCount;
  const candidates = records.filter(
    (r) =>
      r.keyword.trim().toLowerCase() === batch.sector.trim().toLowerCase() &&
      r.location.trim().toLowerCase() === batch.location.trim().toLowerCase() &&
      r.resultsCount === expected &&
      Array.isArray(r.leads) &&
      r.leads.length === expected
  );
  return candidates[0] ?? null;
}

export function hasWebsite(lead: Lead): boolean {
  return Boolean(lead.website?.trim());
}

export function hasEmail(lead: Lead): boolean {
  return Boolean(lead.email?.trim() || lead.normalizedEmail?.trim());
}

const HARD_INVALID_REASONS = new Set([
  "invalid_syntax",
  "domain_not_found",
  "no_mx_records",
]);

/**
 * Campaign-eligible for this product:
 * - has email
 * - not definitively invalid / duplicate / no_email
 * - local syntax+MX ok with mailbox unconfirmed (unknown) counts as eligible
 * Does NOT re-run DNS; only reads existing validation fields.
 */
export function isBatchCampaignEligible(lead: Lead): boolean {
  if (!hasEmail(lead)) return false;

  const status = lead.emailValidationStatus;
  const reason = lead.emailValidationReason ?? "";

  if (status === "no_email" || status === "duplicate") return false;
  if (status === "invalid") return false;
  if (HARD_INVALID_REASONS.has(reason)) return false;

  if (status === "valid") return true;

  // Local validation outcome: syntax+MX ok, mailbox not confirmed.
  if (
    status === "unknown" ||
    status === "risky" ||
    status === "catch_all"
  ) {
    // dns_error is recoverable unknown — not yet campaign-eligible.
    if (reason === "dns_error") return false;
    return true;
  }

  // Explicit MX already verified on the lead.
  if (lead.hasMxRecords === true) return true;

  return false;
}

export function getBatchLeadStats(leads: readonly Lead[]): BatchLeadStats {
  let withWebsite = 0;
  let withEmail = 0;
  let withoutEmail = 0;
  let approved = 0;
  let eligible = 0;
  let unknown = 0;
  let invalid = 0;
  let pendingValidation = 0;

  for (const lead of leads) {
    if (hasWebsite(lead)) withWebsite += 1;

    // Leads without email are NEVER "invalid" — only "sem e-mail".
    if (!hasEmail(lead)) {
      withoutEmail += 1;
      continue;
    }
    withEmail += 1;

    const status = lead.emailValidationStatus;
    const reason = lead.emailValidationReason ?? "";

    if (status === "duplicate") {
      // Duplicate is not campaign-eligible; track under invalid for batch UI.
      invalid += 1;
      continue;
    }

    if (status === "invalid" || HARD_INVALID_REASONS.has(reason)) {
      invalid += 1;
      continue;
    }

    // no_email status with a present email is inconsistent — still not invalid.
    if (status === "no_email") {
      withoutEmail += 1;
      withEmail -= 1;
      continue;
    }

    if (status === "valid") {
      approved += 1;
      eligible += 1;
      continue;
    }

    if (
      status === "unknown" ||
      status === "risky" ||
      status === "catch_all"
    ) {
      unknown += 1;
      if (isBatchCampaignEligible(lead)) eligible += 1;
      continue;
    }

    // pending / validating / unset
    pendingValidation += 1;
  }

  return {
    total: leads.length,
    withWebsite,
    withEmail,
    withoutEmail,
    approved,
    eligible,
    unknown,
    invalid,
    pendingValidation,
  };
}

/** Strict approved = status valid only. Prefer getBatchEligibleLeads for campaigns. */
export function getBatchApprovedLeads(leads: readonly Lead[]): Lead[] {
  return leads.filter(
    (lead) => hasEmail(lead) && lead.emailValidationStatus === "valid"
  );
}

/**
 * Campaign recipients from this lote: eligible emails only
 * (valid OR mailbox unknown after local MX — not sem e-mail, not hard invalid).
 */
export function getBatchEligibleLeads(leads: readonly Lead[]): Lead[] {
  return leads.filter(isBatchCampaignEligible);
}

/** Leads ready for Agent 2 = have email and not terminal-invalid without revalidation. */
export function getBatchValidationCandidates(leads: readonly Lead[]): Lead[] {
  return leads.filter((lead) => hasEmail(lead));
}

export function advancePipelineStage(
  current: PipelineStage,
  next: PipelineStage
): PipelineStage {
  const order: PipelineStage[] = [
    "search",
    "garimpo",
    "validation",
    "campaign",
    "send",
    "complete",
  ];
  const currentIndex = order.indexOf(current);
  const nextIndex = order.indexOf(next);
  if (currentIndex < 0) return next;
  if (nextIndex < 0) return current;
  return nextIndex >= currentIndex ? next : current;
}
