/**
 * Per-upload import batch isolation + closed-form import accounting.
 * Each CSV/XLSX/TXT creates one importBatchId; campaign membership uses that batch only.
 */
import type { Lead } from "../types/lead.ts";
import { hasValidEmail } from "./email-templates.ts";
import { normalizeEmail } from "./email-validation.ts";

export interface ImportBatchStats {
  importBatchId: string;
  filename?: string;
  /** Physical lines / tokens considered (excluding empty). */
  totalLines: number;
  /** Tokens that looked like emails or had @. */
  emailsFound: number;
  /** Syntax-valid unique emails in this file. */
  validEmails: number;
  /** Duplicates within the same file. */
  duplicatesInFile: number;
  /** Already present in system (importedLeads or savedLeads by email). */
  alreadyInSystem: number;
  /** Matched blocklist (optional, counted when provided). */
  blocked: number;
  /** Invalid / no email / garbage. */
  invalid: number;
  /** Newly accepted into this batch (and typically store). */
  newlyAdded: number;
  /** Final usable members of this batch (newly added + already in system but re-selected for this file). */
  batchFinalCount: number;
  leadIds: string[];
  leads: Lead[];
}

export function createImportBatchId(): string {
  return `impbatch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Closed-form check:
 * emailsFound ≈ validEmails + invalid (approx)
 * validEmails = newlyAdded + alreadyInSystem + blocked (+ file dups handled separately)
 * batchFinalCount should equal leadIds.length
 */
export function importStatsBalance(stats: ImportBatchStats): {
  ok: boolean;
  expectedBatch: number;
  actualBatch: number;
} {
  const actualBatch = stats.leadIds.length;
  const expectedBatch = stats.batchFinalCount;
  return {
    ok: actualBatch === expectedBatch && expectedBatch === stats.leads.length,
    expectedBatch,
    actualBatch,
  };
}

/**
 * Stamp leads with a batch id (new id if missing).
 */
export function stampLeadsWithImportBatch(
  leads: Lead[],
  importBatchId: string
): Lead[] {
  return leads.map((lead) => ({
    ...lead,
    importBatchId,
    id: lead.id?.startsWith("import-")
      ? lead.id
      : `import-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  }));
}

/**
 * Build batch membership from parsed valid leads + system email set.
 * - All valid unique emails from the file enter the batch (as leads).
 * - newlyAdded = not already in system
 * - alreadyInSystem still join the batch with existing store lead if found, else new id
 */
export function buildImportBatchMembership(input: {
  importBatchId: string;
  filename?: string;
  totalLines: number;
  /** Parsed unique valid leads from file (parser already de-duped). */
  parsedLeads: Lead[];
  /** Invalid + in-file dups from parser. */
  skippedInvalidOrDup: number;
  invalidCount?: number;
  duplicatesInFile?: number;
  systemEmails: ReadonlySet<string>;
  /** Existing leads in store keyed by normalized email (optional reuse of id). */
  existingByEmail?: Map<string, Lead>;
  blockedEmails?: ReadonlySet<string>;
}): ImportBatchStats {
  const blockedSet = input.blockedEmails ?? new Set<string>();
  const existingByEmail = input.existingByEmail ?? new Map<string, Lead>();

  let alreadyInSystem = 0;
  let blocked = 0;
  let newlyAdded = 0;
  const batchLeads: Lead[] = [];
  const leadIds: string[] = [];

  for (const parsed of input.parsedLeads) {
    const email = normalizeEmail(parsed.email) ?? parsed.email?.toLowerCase();
    if (!email || !hasValidEmail(email)) continue;

    if (blockedSet.has(email)) {
      blocked += 1;
      continue;
    }

    const existing = existingByEmail.get(email);
    if (existing) {
      alreadyInSystem += 1;
      const stamped = {
        ...existing,
        importBatchId: input.importBatchId,
      };
      batchLeads.push(stamped);
      leadIds.push(stamped.id);
    } else {
      newlyAdded += 1;
      const stamped = {
        ...parsed,
        email,
        normalizedEmail: email,
        importBatchId: input.importBatchId,
      };
      batchLeads.push(stamped);
      leadIds.push(stamped.id);
    }
  }

  const invalid =
    input.invalidCount ??
    Math.max(
      0,
      input.skippedInvalidOrDup - (input.duplicatesInFile ?? 0)
    );
  const duplicatesInFile = input.duplicatesInFile ?? 0;

  return {
    importBatchId: input.importBatchId,
    filename: input.filename,
    totalLines: input.totalLines,
    emailsFound:
      input.parsedLeads.length + duplicatesInFile + invalid,
    validEmails: input.parsedLeads.length,
    duplicatesInFile,
    alreadyInSystem,
    blocked,
    invalid,
    newlyAdded,
    batchFinalCount: batchLeads.length,
    leadIds,
    leads: batchLeads,
  };
}

export function filterLeadsByImportBatch(
  leads: readonly Lead[],
  importBatchId: string | null | undefined
): Lead[] {
  if (!importBatchId) return [];
  return leads.filter((l) => l.importBatchId === importBatchId);
}
