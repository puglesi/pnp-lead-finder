import type { Lead } from "../types/lead";

export const AGENT_ONE_ENRICHMENT_BATCH_SIZE = 8;

export interface AgentOneContactUpdate {
  id: string;
  email: string | null;
  phone: string | null;
}

export interface AgentOneEnrichmentProgress {
  processedCount: number;
  totalCount: number;
  emailFoundCount: number;
}

interface EnrichmentRequestOptions {
  onBatch?: (updates: AgentOneContactUpdate[]) => void;
  onProgress?: (progress: AgentOneEnrichmentProgress) => void;
}

function hasUsableEmail(email: string | null | undefined): boolean {
  return Boolean(
    email &&
      email !== "—" &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  );
}

function hasUsablePhone(phone: string | null | undefined): boolean {
  return Boolean(phone && phone.trim() && phone.trim() !== "—");
}

function hasEnrichableWebsite(website: string): boolean {
  const trimmed = website.trim();
  if (!trimmed || trimmed === "—") return false;

  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`
    );
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    return Boolean(
      hostname &&
        !hostname.includes("google.com") &&
        !hostname.includes("example.com")
    );
  } catch {
    return false;
  }
}

export function selectAgentOneEmailEnrichmentCandidates(
  leads: Lead[]
): Lead[] {
  return leads.filter(
    (lead) =>
      !hasUsableEmail(lead.email) && hasEnrichableWebsite(lead.website)
  );
}

export function mergeAgentOneContactUpdates(
  leads: Lead[],
  updates: AgentOneContactUpdate[]
): Lead[] {
  if (updates.length === 0) return leads;
  const byId = new Map(updates.map((update) => [update.id, update]));

  return leads.map((lead) => {
    const update = byId.get(lead.id);
    if (!update) return lead;

    const email =
      hasUsableEmail(lead.email) || !update.email ? lead.email : update.email;
    const phone =
      hasUsablePhone(lead.phone) || !update.phone ? lead.phone : update.phone;

    if (email === lead.email && phone === lead.phone) return lead;
    if (email !== lead.email) {
      return {
        ...lead,
        email,
        phone,
        emailValidationStatus: undefined,
        emailValidationReason: undefined,
        normalizedEmail: undefined,
        emailValidatedAt: undefined,
        emailValidationProvider: undefined,
        emailDomain: undefined,
        hasMxRecords: undefined,
        isRoleBasedEmail: undefined,
      };
    }
    return { ...lead, phone };
  });
}

export function chunkAgentOneEnrichmentCandidates(
  leads: Lead[],
  batchSize = AGENT_ONE_ENRICHMENT_BATCH_SIZE
): Lead[][] {
  const size = Math.max(1, Math.floor(batchSize));
  const chunks: Lead[][] = [];
  for (let index = 0; index < leads.length; index += size) {
    chunks.push(leads.slice(index, index + size));
  }
  return chunks;
}

function isContactUpdate(value: unknown): value is AgentOneContactUpdate {
  if (!value || typeof value !== "object") return false;
  const update = value as Record<string, unknown>;
  return (
    typeof update.id === "string" &&
    (typeof update.email === "string" || update.email === null) &&
    (typeof update.phone === "string" || update.phone === null)
  );
}

export async function requestAgentOneEmailEnrichment(
  leads: Lead[],
  options: EnrichmentRequestOptions = {}
): Promise<AgentOneContactUpdate[]> {
  const candidates = selectAgentOneEmailEnrichmentCandidates(leads);
  const batches = chunkAgentOneEnrichmentCandidates(candidates);
  const allUpdates: AgentOneContactUpdate[] = [];
  let processedCount = 0;
  let emailFoundCount = 0;

  options.onProgress?.({
    processedCount,
    totalCount: candidates.length,
    emailFoundCount,
  });

  for (const batch of batches) {
    const response = await fetch("/api/agent-1/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leads: batch.map(({ id, website }) => ({ id, website })),
      }),
    });

    if (!response.ok) {
      let message = "Falha no enriquecimento server-side";
      try {
        const errorBody = (await response.json()) as { error?: unknown };
        if (typeof errorBody.error === "string") message = errorBody.error;
      } catch {
        // Mantém a mensagem padrão quando a resposta não contém JSON.
      }
      throw new Error(message);
    }

    const body = (await response.json()) as { results?: unknown };
    const updates = Array.isArray(body.results)
      ? body.results.filter(isContactUpdate)
      : [];

    allUpdates.push(...updates);
    processedCount += batch.length;
    emailFoundCount += updates.filter((update) => update.email).length;
    options.onBatch?.(updates);
    options.onProgress?.({
      processedCount,
      totalCount: candidates.length,
      emailFoundCount,
    });
  }

  return allUpdates;
}
