import type { Campaign } from "../types/campaign.ts";
import type { Lead, SearchRecord } from "../types/lead.ts";
import type { EmailBlocklistEntry } from "./email-blocklist.ts";
import { findEmailBlock } from "./email-blocklist.ts";
import { normalizeEmail } from "./email-validation.ts";
import { isConfirmedCampaignDelivery } from "./campaign-delivery-metrics.ts";

export type GlobalHistoryHitKind =
  | "search"
  | "lead"
  | "campaign"
  | "blocked"
  | "sent";

export interface GlobalHistoryHit {
  id: string;
  kind: GlobalHistoryHitKind;
  title: string;
  subtitle: string;
  meta?: string;
  /** Extra status chips for the UI. */
  badges: string[];
}

export interface GlobalHistorySearchInput {
  query: string;
  fullSearchHistory: readonly SearchRecord[];
  recentSearches?: readonly SearchRecord[];
  savedLeads: readonly Lead[];
  importedLeads?: readonly Lead[];
  campaigns: readonly Campaign[];
  blockedEmails: readonly EmailBlocklistEntry[];
  limit?: number;
}

function domainFromEmail(email: string): string {
  const at = email.indexOf("@");
  return at >= 0 ? email.slice(at + 1) : email;
}

function leadMatches(lead: Lead, q: string, qEmail: string | null): boolean {
  if (qEmail && normalizeEmail(lead.email) === qEmail) return true;
  if (qEmail && normalizeEmail(lead.normalizedEmail) === qEmail) return true;
  const hay = [
    lead.company,
    lead.email ?? "",
    lead.website,
    lead.category,
    lead.address,
    lead.phone,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function searchMatches(record: SearchRecord, q: string): boolean {
  return (
    record.keyword.toLowerCase().includes(q) ||
    record.location.toLowerCase().includes(q) ||
    (record.batchId?.toLowerCase().includes(q) ?? false)
  );
}

function campaignMatches(campaign: Campaign, q: string): boolean {
  return (
    campaign.name.toLowerCase().includes(q) ||
    campaign.subject.toLowerCase().includes(q) ||
    campaign.id.toLowerCase().includes(q) ||
    campaign.campaignProfileId.toLowerCase().includes(q)
  );
}

/**
 * Single informational query across history, leads, campaigns and blocklist.
 * Does not start a live search.
 */
export function searchGlobalHistory(
  input: GlobalHistorySearchInput
): GlobalHistoryHit[] {
  const raw = input.query.trim();
  if (!raw) return [];
  const q = raw.toLowerCase();
  const qEmail = normalizeEmail(raw);
  const limit = input.limit ?? 40;
  const hits: GlobalHistoryHit[] = [];

  // Blocklist first when query looks like an email.
  if (qEmail) {
    const block = findEmailBlock(input.blockedEmails, qEmail);
    if (block) {
      hits.push({
        id: `blocked-${block.id}`,
        kind: "blocked",
        title: block.normalizedEmail,
        subtitle: "E-mail bloqueado — não será prospectado",
        meta: block.blockedAt,
        badges: [
          "Bloqueado",
          block.reason,
          block.operation === "both" ? "Ambas operações" : block.operation,
        ],
      });
    }
  } else {
    for (const block of input.blockedEmails) {
      if (
        block.normalizedEmail.includes(q) ||
        domainFromEmail(block.normalizedEmail).includes(q) ||
        (block.note?.toLowerCase().includes(q) ?? false)
      ) {
        hits.push({
          id: `blocked-${block.id}`,
          kind: "blocked",
          title: block.normalizedEmail,
          subtitle: "E-mail bloqueado — não será prospectado",
          meta: block.blockedAt,
          badges: ["Bloqueado", block.reason],
        });
      }
      if (hits.length >= limit) return hits.slice(0, limit);
    }
  }

  const seenSearch = new Set<string>();
  for (const record of [
    ...input.fullSearchHistory,
    ...(input.recentSearches ?? []),
  ]) {
    if (seenSearch.has(record.id)) continue;
    if (!searchMatches(record, q)) continue;
    seenSearch.add(record.id);
    hits.push({
      id: `search-${record.id}`,
      kind: "search",
      title: `${record.keyword} · ${record.location}`,
      subtitle: `Busca anterior · ${record.resultsCount} empresas`,
      meta: record.date,
      badges: ["Histórico de busca"],
    });
    if (hits.length >= limit) return hits;
  }

  const seenLeads = new Set<string>();
  const allLeads = [
    ...input.savedLeads,
    ...(input.importedLeads ?? []),
    ...input.fullSearchHistory.flatMap((r) => r.leads ?? []),
  ];
  for (const lead of allLeads) {
    if (seenLeads.has(lead.id)) continue;
    if (!leadMatches(lead, q, qEmail)) continue;
    seenLeads.add(lead.id);
    const email = normalizeEmail(lead.normalizedEmail) ?? normalizeEmail(lead.email);
    const block = email
      ? findEmailBlock(input.blockedEmails, email)
      : null;
    const badges = ["Lead"];
    if (lead.savedAt) badges.push("Salvo");
    if (email) badges.push("Com e-mail");
    if (block) badges.push("Bloqueado — não será prospectado");
    hits.push({
      id: `lead-${lead.id}`,
      kind: "lead",
      title: lead.company,
      subtitle: [email, lead.category, lead.address].filter(Boolean).join(" · "),
      meta: lead.savedAt,
      badges,
    });
    if (hits.length >= limit) return hits;
  }

  for (const campaign of input.campaigns) {
    if (!campaignMatches(campaign, q)) continue;
    const sent = campaign.leadStatuses.filter((s) =>
      isConfirmedCampaignDelivery(s)
    ).length;
    const replied = campaign.leadStatuses.filter(
      (s) => s.status === "replied"
    ).length;
    const badges: string[] = [campaign.status, campaign.campaignProfileId];
    if (sent > 0) badges.push(`${sent} enviados`);
    if (replied > 0) badges.push(`${replied} respostas`);
    hits.push({
      id: `campaign-${campaign.id}`,
      kind: "campaign",
      title: campaign.name,
      subtitle: campaign.subject,
      meta: campaign.updatedAt,
      badges,
    });
    if (hits.length >= limit) return hits;
  }

  // When looking up a specific email, also surface send evidence from campaigns.
  if (qEmail) {
    for (const campaign of input.campaigns) {
      for (const status of campaign.leadStatuses) {
        if (!isConfirmedCampaignDelivery(status)) continue;
        const lead = allLeads.find((l) => l.id === status.leadId);
        const leadEmail =
          normalizeEmail(lead?.normalizedEmail) ?? normalizeEmail(lead?.email);
        if (leadEmail !== qEmail) continue;
        const badges = ["Enviado", campaign.status];
        if (status.status === "replied") badges.push("Respondeu");
        if (status.status === "opened") badges.push("Abriu");
        hits.push({
          id: `sent-${campaign.id}-${status.leadId}`,
          kind: "sent",
          title: lead?.company ?? qEmail,
          subtitle: `Enviado na campanha ${campaign.name}`,
          meta: status.sentAt ?? campaign.updatedAt,
          badges,
        });
        if (hits.length >= limit) return hits;
      }
    }
  }

  return hits.slice(0, limit);
}
