import type { Campaign } from "../types/campaign.ts";
import type { Lead, SearchRecord } from "../types/lead.ts";
import { isConfirmedCampaignDelivery } from "./campaign-delivery-metrics.ts";
import { normalizeEmail } from "./email-validation.ts";

/**
 * Lifetime KPIs are cumulative business totals.
 * Never use only the active batch / current UI session.
 */
export interface LifetimeStats {
  /** Empresas encontradas em buscas persistidas (histórico completo). */
  companiesFound: number;
  /** Leads encontrados/salvos (união de salvos + snapshots de histórico). */
  leadsFound: number;
  /** E-mails válidos encontrados (com endereço normalizado ou bruto). */
  validEmailsFound: number;
  /** Campanhas que já tiveram envio confirmado (histórico, não só ativas). */
  campaignsSent: number;
  /** Campanhas ainda ativas (indicador separado). */
  campaignsActive: number;
}

export interface LifetimeStatsInput {
  fullSearchHistory: readonly SearchRecord[];
  recentSearches?: readonly SearchRecord[];
  savedLeads: readonly Lead[];
  importedLeads?: readonly Lead[];
  campaigns: readonly Campaign[];
  /**
   * Optional high-water counters so totals never shrink if history is pruned.
   * Displayed value is max(derived, floor).
   */
  floors?: Partial<
    Pick<
      LifetimeStats,
      | "companiesFound"
      | "leadsFound"
      | "validEmailsFound"
      | "campaignsSent"
    >
  >;
}

function collectUniqueLeads(input: LifetimeStatsInput): Map<string, Lead> {
  const byId = new Map<string, Lead>();
  const histories = [
    ...input.fullSearchHistory,
    ...(input.recentSearches ?? []),
  ];
  for (const record of histories) {
    for (const lead of record.leads ?? []) {
      byId.set(lead.id, lead);
    }
  }
  for (const lead of input.savedLeads) {
    byId.set(lead.id, lead);
  }
  for (const lead of input.importedLeads ?? []) {
    byId.set(lead.id, lead);
  }
  return byId;
}

function hasEmailAddress(lead: Lead): boolean {
  return Boolean(normalizeEmail(lead.normalizedEmail) ?? normalizeEmail(lead.email));
}

function isCampaignEverSent(campaign: Campaign): boolean {
  if (campaign.status === "completed" || campaign.status === "active") {
    if (campaign.leadStatuses.some((status) => isConfirmedCampaignDelivery(status))) {
      return true;
    }
  }
  return campaign.leadStatuses.some((status) => isConfirmedCampaignDelivery(status));
}

export function computeLifetimeStats(input: LifetimeStatsInput): LifetimeStats {
  const histories = [
    ...input.fullSearchHistory,
    ...(input.recentSearches ?? []),
  ];
  // Prefer full history ids; avoid double-counting the same search record.
  const seenSearchIds = new Set<string>();
  let companiesFound = 0;
  for (const record of histories) {
    if (seenSearchIds.has(record.id)) continue;
    seenSearchIds.add(record.id);
    companiesFound += Math.max(0, record.resultsCount || 0);
  }

  const uniqueLeads = collectUniqueLeads(input);
  const leadsFound = uniqueLeads.size;
  let validEmailsFound = 0;
  for (const lead of uniqueLeads.values()) {
    if (hasEmailAddress(lead)) validEmailsFound += 1;
  }

  const campaignsSent = input.campaigns.filter(isCampaignEverSent).length;
  const campaignsActive = input.campaigns.filter(
    (campaign) => campaign.status === "active"
  ).length;

  const floors = input.floors ?? {};
  return {
    companiesFound: Math.max(companiesFound, floors.companiesFound ?? 0),
    leadsFound: Math.max(leadsFound, floors.leadsFound ?? 0),
    validEmailsFound: Math.max(validEmailsFound, floors.validEmailsFound ?? 0),
    campaignsSent: Math.max(campaignsSent, floors.campaignsSent ?? 0),
    campaignsActive,
  };
}

/**
 * After a completed search, bump the companies high-water mark by resultsCount.
 * Floors only increase — clearing the UI never resets them.
 */
export function raiseLifetimeFloors(
  current: Partial<LifetimeStats>,
  next: Partial<LifetimeStats>
): Pick<
  LifetimeStats,
  "companiesFound" | "leadsFound" | "validEmailsFound" | "campaignsSent"
> {
  return {
    companiesFound: Math.max(
      current.companiesFound ?? 0,
      next.companiesFound ?? 0
    ),
    leadsFound: Math.max(current.leadsFound ?? 0, next.leadsFound ?? 0),
    validEmailsFound: Math.max(
      current.validEmailsFound ?? 0,
      next.validEmailsFound ?? 0
    ),
    campaignsSent: Math.max(
      current.campaignsSent ?? 0,
      next.campaignsSent ?? 0
    ),
  };
}
