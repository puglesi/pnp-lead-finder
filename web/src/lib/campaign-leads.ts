import type { CampaignLeadSource } from "@/types/campaign";
import type { Lead } from "@/types/lead";

export function resolveCampaignLeads(
  leadIds: string[],
  savedLeads: Lead[],
  recentLeads: Lead[],
  importedLeads: Lead[] = []
): Lead[] {
  const map = new Map<string, Lead>();
  for (const lead of [...savedLeads, ...recentLeads, ...importedLeads]) {
    map.set(lead.id, lead);
  }
  return leadIds.map((id) => map.get(id)).filter((l): l is Lead => Boolean(l));
}

export function inferLeadSource(
  leadIds: string[],
  savedLeads: Lead[],
  recentLeads: Lead[],
  importedLeads: Lead[] = []
): CampaignLeadSource {
  const savedSet = new Set(savedLeads.map((l) => l.id));
  const recentSet = new Set(recentLeads.map((l) => l.id));
  const importedSet = new Set(importedLeads.map((l) => l.id));
  let fromSaved = 0;
  let fromRecent = 0;
  let fromImported = 0;
  for (const id of leadIds) {
    if (savedSet.has(id)) fromSaved++;
    if (recentSet.has(id)) fromRecent++;
    if (importedSet.has(id)) fromImported++;
  }
  const sources = [fromSaved > 0, fromRecent > 0, fromImported > 0].filter(Boolean).length;
  if (sources > 1) return "mixed";
  if (fromImported > 0) return "imported";
  if (fromRecent > 0) return "recent";
  return "saved";
}