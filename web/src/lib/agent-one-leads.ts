import type { Lead } from "../types/lead";

export interface SaveAgentOneLeadsInput {
  results: Lead[];
  existingSavedLeads: Lead[];
  targetLeadCount: number;
  source: string;
  saveLead: (lead: Lead) => boolean;
}

export interface SaveAgentOneLeadsResult {
  savedLeadCount: number;
  savedLeads: Lead[];
}

interface NormalizedWebsite {
  value: string;
  key: string;
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function normalizeWebsite(value: string): NormalizedWebsite | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const hasProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed);
    const url = new URL(hasProtocol ? trimmed : "https://" + trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!hostname) return null;

    const pathname = url.pathname.replace(/\/+$/, "");
    const key = hostname + pathname.toLowerCase();
    url.hash = "";

    return {
      value: url.toString().replace(/\/$/, ""),
      key,
    };
  } catch {
    return null;
  }
}

function normalizedLeadFingerprint(lead: Lead): string | null {
  const company = normalizeText(lead.company).toLowerCase();
  const website = normalizeWebsite(lead.website);
  if (!company || !website) return null;
  return company + "|" + website.key;
}

export function isArtificialAgentOneResult(
  source: string,
  lead?: Pick<Lead, "id">
): boolean {
  const normalizedSource = source.toLowerCase();
  const artificialSource =
    normalizedSource.includes("mock") ||
    normalizedSource.includes("error-fallback") ||
    normalizedSource.includes("offline-fallback");
  const artificialSupplement = lead?.id.startsWith("auto-sup-") ?? false;
  return artificialSource || artificialSupplement;
}

export function normalizeAgentOneLead(lead: Lead): Lead | null {
  const company = normalizeText(lead.company);
  const website = normalizeWebsite(lead.website);
  if (!company || !website) return null;

  return {
    ...lead,
    company,
    website: website.value,
    email: lead.email ? normalizeText(lead.email).toLowerCase() : null,
    phone: normalizeText(lead.phone),
    address: normalizeText(lead.address),
    category: normalizeText(lead.category),
  };
}

export function selectAgentOneLeadCandidates(
  results: Lead[],
  existingSavedLeads: Lead[],
  source: string
): Lead[] {
  if (isArtificialAgentOneResult(source)) return [];

  const existingFingerprints = new Set(
    existingSavedLeads
      .map(normalizedLeadFingerprint)
      .filter((fingerprint): fingerprint is string => fingerprint !== null)
  );
  const responseFingerprints = new Set<string>();
  const candidates: Lead[] = [];

  for (const result of results) {
    if (isArtificialAgentOneResult(source, result)) continue;

    const normalized = normalizeAgentOneLead(result);
    if (!normalized) continue;

    const fingerprint = normalizedLeadFingerprint(normalized);
    if (
      !fingerprint ||
      existingFingerprints.has(fingerprint) ||
      responseFingerprints.has(fingerprint)
    ) {
      continue;
    }

    responseFingerprints.add(fingerprint);
    candidates.push(normalized);
  }

  return candidates;
}

export function saveAgentOneLeads({
  results,
  existingSavedLeads,
  targetLeadCount,
  source,
  saveLead,
}: SaveAgentOneLeadsInput): SaveAgentOneLeadsResult {
  const target = Math.max(0, Math.floor(targetLeadCount));
  const candidates = selectAgentOneLeadCandidates(
    results,
    existingSavedLeads,
    source
  );
  const savedLeads: Lead[] = [];

  for (const candidate of candidates) {
    if (savedLeads.length >= target) break;
    if (saveLead(candidate)) savedLeads.push(candidate);
  }

  return {
    savedLeadCount: savedLeads.length,
    savedLeads,
  };
}
