import { normalizeEmail } from "./email-validation.ts";
import { leadFromEmail, parseCsvLine } from "./import-leads.ts";
import type { Lead } from "../types/lead.ts";
import type { EmailBlocklistEntry } from "./email-blocklist.ts";
import { isEmailBlocked } from "./email-blocklist.ts";
import {
  auditGlobalEmailRecipients,
  buildGlobalEmailHistory,
  buildPermanentContactBlocks,
  type GlobalDeduplicationPreview,
  type PermanentContactBlock,
} from "./global-email-deduplication.ts";
import {
  emailBlocklistToPermanentBlocks,
  mergePermanentBlocks,
} from "./email-blocklist.ts";
import type { Campaign } from "../types/campaign.ts";
import type { CampaignProfileId } from "../types/campaign-profile.ts";
import type { AgentThreeOperationState } from "./agent-three-queue.ts";
import type { EmailContactKind } from "./global-email-deduplication.ts";

export type ListImportField =
  | "email"
  | "company"
  | "name"
  | "website"
  | "domain"
  | "phone"
  | "address"
  | "ignore";

export type ColumnMapping = Record<number, ListImportField>;

export interface DetectedColumns {
  headers: string[];
  mapping: ColumnMapping;
  emailColumn: number | null;
  needsManualMapping: boolean;
  confidence: "auto" | "partial" | "manual";
}

export interface ListImportParseResult {
  leads: Lead[];
  headers: string[];
  mapping: ColumnMapping;
  needsManualMapping: boolean;
  rawRowCount: number;
  errors: string[];
}

export interface ListImportAnalysis {
  totalImported: number;
  uniqueEmails: number;
  duplicates: number;
  blocked: number;
  alreadyExisting: number;
  readyForValidation: number;
  leads: Lead[];
  blockedLeads: Lead[];
  duplicateLeads: Lead[];
  existingLeads: Lead[];
  readyLeads: Lead[];
}

const EMAIL_ALIASES = [
  "email",
  "e-mail",
  "e mail",
  "mail",
  "correio",
  "email address",
  "e-mail address",
];
const COMPANY_ALIASES = [
  "company",
  "empresa",
  "business",
  "organização",
  "organization",
  "nome empresa",
  "firm",
];
const NAME_ALIASES = ["name", "nome", "contact", "contato", "full name"];
const WEBSITE_ALIASES = ["website", "site", "url", "web", "homepage"];
const DOMAIN_ALIASES = ["domain", "domínio", "dominio", "email domain"];
const PHONE_ALIASES = ["phone", "telefone", "tel", "mobile", "celular"];
const ADDRESS_ALIASES = [
  "address",
  "endereço",
  "endereco",
  "location",
  "localização",
  "localizacao",
];

function normalizeHeader(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function matchAlias(header: string, aliases: string[]): boolean {
  const h = normalizeHeader(header);
  return aliases.some((alias) => h === alias || h.includes(alias));
}

export function detectColumnMapping(headers: string[]): DetectedColumns {
  const mapping: ColumnMapping = {};
  let emailColumn: number | null = null;

  headers.forEach((header, index) => {
    if (matchAlias(header, EMAIL_ALIASES)) {
      mapping[index] = "email";
      if (emailColumn === null) emailColumn = index;
      return;
    }
    if (matchAlias(header, COMPANY_ALIASES)) {
      mapping[index] = "company";
      return;
    }
    if (matchAlias(header, NAME_ALIASES)) {
      mapping[index] = "name";
      return;
    }
    if (matchAlias(header, WEBSITE_ALIASES)) {
      mapping[index] = "website";
      return;
    }
    if (matchAlias(header, DOMAIN_ALIASES)) {
      mapping[index] = "domain";
      return;
    }
    if (matchAlias(header, PHONE_ALIASES)) {
      mapping[index] = "phone";
      return;
    }
    if (matchAlias(header, ADDRESS_ALIASES)) {
      mapping[index] = "address";
      return;
    }
    mapping[index] = "ignore";
  });

  // Headerless single-column email list: first cell of first data row may look like header.
  if (emailColumn === null && headers.length === 1) {
    const maybeEmail = normalizeEmail(headers[0]);
    if (maybeEmail) {
      mapping[0] = "email";
      emailColumn = 0;
      return {
        headers,
        mapping,
        emailColumn,
        needsManualMapping: false,
        confidence: "auto",
      };
    }
  }

  // Scan for a header that literally looks like an email value (no header row).
  if (emailColumn === null) {
    const idx = headers.findIndex((h) => normalizeEmail(h));
    if (idx >= 0) {
      mapping[idx] = "email";
      emailColumn = idx;
    }
  }

  const needsManualMapping = emailColumn === null;
  const mappedUseful = Object.values(mapping).filter((v) => v !== "ignore").length;
  const confidence: DetectedColumns["confidence"] = needsManualMapping
    ? "manual"
    : mappedUseful >= 2
      ? "auto"
      : "partial";

  return {
    headers,
    mapping,
    emailColumn,
    needsManualMapping,
    confidence,
  };
}

function fieldValue(
  cells: string[],
  mapping: ColumnMapping,
  field: ListImportField
): string {
  for (const [index, mapped] of Object.entries(mapping)) {
    if (mapped === field) return (cells[Number(index)] ?? "").trim();
  }
  return "";
}

export function leadsFromMappedRows(
  rows: string[][],
  mapping: ColumnMapping,
  options?: { hasHeader?: boolean }
): ListImportParseResult {
  const hasHeader = options?.hasHeader ?? true;
  const errors: string[] = [];
  const leads: Lead[] = [];
  const seen = new Set<string>();
  const headers = hasHeader && rows[0] ? rows[0] : [];
  const dataRows = hasHeader ? rows.slice(1) : rows;

  for (const cells of dataRows) {
    if (!cells.some((c) => c?.trim())) continue;
    let email = fieldValue(cells, mapping, "email");
    const emailMatch = email.match(/<?([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>?/i);
    if (emailMatch) email = emailMatch[1];

    // Domain-only column can synthesize website, not email.
    const domain = fieldValue(cells, mapping, "domain");
    const websiteRaw =
      fieldValue(cells, mapping, "website") ||
      (domain ? (domain.startsWith("http") ? domain : `https://${domain}`) : "");
    const company =
      fieldValue(cells, mapping, "company") ||
      fieldValue(cells, mapping, "name") ||
      undefined;
    const lead = leadFromEmail(email, {
      company,
      website: websiteRaw || undefined,
      phone: fieldValue(cells, mapping, "phone") || undefined,
      address: fieldValue(cells, mapping, "address") || undefined,
      category: "Importado",
    });
    if (!lead) {
      if (email.includes("@")) errors.push(`E-mail inválido: ${email}`);
      continue;
    }
    const key = lead.email!.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    leads.push(lead);
  }

  if (leads.length === 0 && errors.length === 0) {
    errors.push("Nenhum e-mail válido encontrado no arquivo.");
  }

  return {
    leads,
    headers,
    mapping,
    needsManualMapping: !Object.values(mapping).includes("email"),
    rawRowCount: dataRows.length,
    errors,
  };
}

export function parseDelimitedText(
  text: string,
  mappingOverride?: ColumnMapping
): ListImportParseResult {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  if (!cleaned) {
    return {
      leads: [],
      headers: [],
      mapping: {},
      needsManualMapping: true,
      rawRowCount: 0,
      errors: ["Arquivo vazio."],
    };
  }

  // Plain email list (TXT): one email per line / comma / semicolon — no headers.
  const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const looksTabular =
    lines.some((line) => line.includes(",") || line.includes(";") || line.includes("\t")) &&
    lines.length > 1;

  if (!looksTabular) {
    const mapping: ColumnMapping = { 0: "email" };
    const rows = lines.map((line) => {
      const match = line.match(/<?([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>?/i);
      return [match?.[1] ?? line];
    });
    return leadsFromMappedRows(rows, mapping, { hasHeader: false });
  }

  const delimiter = cleaned.includes("\t")
    ? "\t"
    : cleaned.split("\n")[0]?.includes(";")
      ? ";"
      : ",";
  const rows = lines.map((line) =>
    delimiter === "\t"
      ? line.split("\t").map((c) => c.trim())
      : parseCsvLine(line.replace(/;/g, delimiter === ";" ? ";" : ","))
  );

  // Fix parseCsvLine for semicolon-only by re-parse if needed
  const finalRows =
    delimiter === ";"
      ? lines.map((line) => parseCsvLine(line.includes(";") ? line : line))
      : rows;

  const headers = finalRows[0] ?? [];
  const detected = detectColumnMapping(headers);
  const mapping = mappingOverride ?? detected.mapping;

  if (detected.needsManualMapping && !mappingOverride) {
    // Try treating first column as email without header
    const fallback: ColumnMapping = { 0: "email" };
    const parsed = leadsFromMappedRows(finalRows, fallback, { hasHeader: false });
    if (parsed.leads.length > 0) {
      return {
        ...parsed,
        needsManualMapping: false,
        mapping: fallback,
      };
    }
    return {
      leads: [],
      headers,
      mapping: detected.mapping,
      needsManualMapping: true,
      rawRowCount: Math.max(0, finalRows.length - 1),
      errors: [
        "Não foi possível detectar a coluna de e-mail. Mapeie manualmente.",
      ],
    };
  }

  return leadsFromMappedRows(finalRows, mapping, { hasHeader: true });
}

export function analyzeImportedList(input: {
  leads: Lead[];
  existingLeads: readonly Lead[];
  blockedEntries: readonly EmailBlocklistEntry[];
}): ListImportAnalysis {
  const existingEmails = new Set<string>();
  for (const lead of input.existingLeads) {
    const email = normalizeEmail(lead.normalizedEmail) ?? normalizeEmail(lead.email);
    if (email) existingEmails.add(email);
  }

  const seen = new Set<string>();
  let duplicates = 0;
  let blocked = 0;
  let alreadyExisting = 0;
  const readyLeads: Lead[] = [];
  const blockedLeads: Lead[] = [];
  const duplicateLeads: Lead[] = [];
  const existingLeads: Lead[] = [];

  for (const lead of input.leads) {
    const email = normalizeEmail(lead.normalizedEmail) ?? normalizeEmail(lead.email);
    if (!email) continue;
    if (seen.has(email)) {
      duplicates += 1;
      duplicateLeads.push(lead);
      continue;
    }
    seen.add(email);

    if (isEmailBlocked(input.blockedEntries, email)) {
      blocked += 1;
      blockedLeads.push(lead);
      continue;
    }
    if (existingEmails.has(email)) {
      alreadyExisting += 1;
      existingLeads.push(lead);
      // Still allow validation of existing contacts — they go to ready if revalidation desired.
      // Spec: show "já existentes" separately; ready = unique non-blocked for validation queue.
      readyLeads.push(lead);
      continue;
    }
    readyLeads.push(lead);
  }

  return {
    totalImported: input.leads.length,
    uniqueEmails: seen.size,
    duplicates,
    blocked,
    alreadyExisting,
    readyForValidation: readyLeads.filter(
      (lead) =>
        !isEmailBlocked(
          input.blockedEntries,
          normalizeEmail(lead.normalizedEmail) ?? normalizeEmail(lead.email)
        )
    ).length,
    leads: input.leads,
    blockedLeads,
    duplicateLeads,
    existingLeads,
    readyLeads: readyLeads.filter(
      (lead) =>
        !isEmailBlocked(
          input.blockedEntries,
          normalizeEmail(lead.normalizedEmail) ?? normalizeEmail(lead.email)
        )
    ),
  };
}

/**
 * Agent 3 send preview for a manually imported list — same global protections.
 */
export function previewImportedSendList(input: {
  leads: Lead[];
  operation: CampaignProfileId;
  campaignId: string;
  contactKind?: EmailContactKind;
  campaigns: readonly Campaign[];
  allKnownLeads: readonly Lead[];
  operations: Record<CampaignProfileId, AgentThreeOperationState>;
  blockedEntries: readonly EmailBlocklistEntry[];
  extraPermanentBlocks?: readonly PermanentContactBlock[];
}): {
  analysis: ListImportAnalysis;
  preview: GlobalDeduplicationPreview;
  eligibleLeads: Lead[];
} {
  const analysis = analyzeImportedList({
    leads: input.leads,
    existingLeads: input.allKnownLeads,
    blockedEntries: input.blockedEntries,
  });

  // Candidates: unique, not blocked (blocklist already applied).
  const candidates = analysis.readyLeads;
  const evidence = {
    campaigns: input.campaigns,
    leads: input.allKnownLeads,
    operations: input.operations,
  };
  const permanentBlocks = mergePermanentBlocks(
    buildPermanentContactBlocks(evidence),
    emailBlocklistToPermanentBlocks(input.blockedEntries),
    input.extraPermanentBlocks
  );
  const preview = auditGlobalEmailRecipients({
    operation: input.operation,
    campaignId: input.campaignId,
    contactKind: input.contactKind ?? "first_contact",
    companiesFound: candidates.length,
    recipients: candidates.map((lead) => ({
      leadId: lead.id,
      company: lead.company,
      email: lead.normalizedEmail ?? lead.email,
    })),
    history: buildGlobalEmailHistory(evidence),
    permanentBlocks,
  });

  const eligibleIds = new Set(
    preview.decisions.filter((d) => d.included).map((d) => d.leadId)
  );
  const eligibleLeads = candidates.filter((lead) => eligibleIds.has(lead.id));

  return { analysis, preview, eligibleLeads };
}

export function exportLeadsAsCsv(leads: Lead[], filenameHint = "leads"): string {
  const header = "email,company,website,phone,address,category,validation";
  const lines = leads.map((lead) => {
    const cells = [
      lead.email ?? "",
      lead.company,
      lead.website,
      lead.phone,
      lead.address,
      lead.category,
      lead.emailValidationStatus ?? "",
    ].map((cell) => {
      const value = String(cell ?? "");
      if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
      return value;
    });
    return cells.join(",");
  });
  return [header, ...lines].join("\n");
}

export function downloadTextFile(content: string, filename: string, mime = "text/csv") {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Re-export parseCsvLine dependency surface for tests. */
export { parseCsvLine };
