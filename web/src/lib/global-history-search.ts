import type { Campaign, CampaignLeadStatus } from "../types/campaign.ts";
import type { Lead, SearchRecord } from "../types/lead.ts";
import type { EmailBlocklistEntry } from "./email-blocklist.ts";
import { findEmailBlock } from "./email-blocklist.ts";
import { normalizeEmail } from "./email-validation.ts";
import { isConfirmedCampaignDelivery } from "./campaign-delivery-metrics.ts";
import { asArray } from "./safe-object.ts";

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
  if (!lead || typeof lead !== "object") return false;
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
    .map((part) => (part == null ? "" : String(part)))
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function searchMatches(record: SearchRecord, q: string): boolean {
  if (!record || typeof record !== "object") return false;
  return (
    String(record.keyword ?? "")
      .toLowerCase()
      .includes(q) ||
    String(record.location ?? "")
      .toLowerCase()
      .includes(q) ||
    (record.batchId?.toLowerCase().includes(q) ?? false)
  );
}

function campaignMatches(campaign: Campaign, q: string): boolean {
  if (!campaign || typeof campaign !== "object") return false;
  return (
    (campaign.name ?? "").toLowerCase().includes(q) ||
    (campaign.subject ?? "").toLowerCase().includes(q) ||
    (campaign.id ?? "").toLowerCase().includes(q) ||
    (campaign.campaignProfileId ?? "").toLowerCase().includes(q)
  );
}

/**
 * Single informational query across history, leads, campaigns and blocklist.
 * Does not start a live search.
 */
export function searchGlobalHistory(
  input: GlobalHistorySearchInput
): GlobalHistoryHit[] {
  const raw = (input?.query ?? "").trim();
  if (!raw) return [];
  const q = raw.toLowerCase();
  const qEmail = normalizeEmail(raw);
  const limit = input.limit ?? 40;
  const hits: GlobalHistoryHit[] = [];
  const blockedEmails = asArray<EmailBlocklistEntry>(input.blockedEmails);
  const fullSearchHistory = asArray<SearchRecord>(input.fullSearchHistory);
  const recentSearches = asArray<SearchRecord>(input.recentSearches);
  const savedLeads = asArray<Lead>(input.savedLeads);
  const importedLeads = asArray<Lead>(input.importedLeads);
  const campaigns = asArray<Campaign>(input.campaigns);

  // Blocklist first when query looks like an email.
  if (qEmail) {
    const block = findEmailBlock(blockedEmails, qEmail);
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
    for (const block of blockedEmails) {
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
  for (const record of [...fullSearchHistory, ...recentSearches]) {
    if (!record?.id || seenSearch.has(record.id)) continue;
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
    ...savedLeads,
    ...importedLeads,
    ...fullSearchHistory.flatMap((r) => asArray<Lead>(r.leads)),
  ];
  for (const lead of allLeads) {
    if (!lead?.id || seenLeads.has(lead.id)) continue;
    if (!leadMatches(lead, q, qEmail)) continue;
    seenLeads.add(lead.id);
    const email = normalizeEmail(lead.normalizedEmail) ?? normalizeEmail(lead.email);
    const block = email
      ? findEmailBlock(blockedEmails, email)
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

  for (const campaign of campaigns) {
    if (!campaign?.id || !campaignMatches(campaign, q)) continue;
    const statuses = asArray<CampaignLeadStatus>(campaign.leadStatuses).filter(
      (s): s is CampaignLeadStatus => Boolean(s) && typeof s === "object"
    );
    const sent = statuses.filter((s) => isConfirmedCampaignDelivery(s)).length;
    const replied = statuses.filter((s) => s?.status === "replied").length;
    const badges: string[] = [
      campaign.status ?? "draft",
      campaign.campaignProfileId ?? "panek-puglesi",
    ];
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
    for (const campaign of campaigns) {
      if (!campaign?.id) continue;
      for (const status of asArray<CampaignLeadStatus>(campaign.leadStatuses)) {
        if (!isConfirmedCampaignDelivery(status)) continue;
        const lead = allLeads.find((l) => l.id === status.leadId);
        const leadEmail =
          normalizeEmail(lead?.normalizedEmail) ?? normalizeEmail(lead?.email);
        if (leadEmail !== qEmail) continue;
        const badges = ["Enviado", campaign.status ?? "draft"];
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
