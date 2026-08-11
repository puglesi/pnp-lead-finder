import type { Campaign, CampaignStatus } from "../types/campaign.ts";
import { countConfirmedSmtpSends } from "./campaign-list-metrics.ts";

/**
 * True when every campaign recipient has a confirmed SMTP delivery.
 * Never trusts stale campaign.sentCount alone.
 */
export function isCampaignFullyDelivered(campaign: Campaign): boolean {
  const total = Array.isArray(campaign.leadIds) ? campaign.leadIds.length : 0;
  if (total <= 0) return false;
  const sent = countConfirmedSmtpSends(campaign);
  return sent >= total && sent > 0;
}

/**
 * Display/status source of truth: fully delivered campaigns are always "completed".
 */
export function getCampaignEffectiveStatus(
  campaign: Campaign
): CampaignStatus {
  // Archived stays archived even if deliveries were complete.
  if (campaign.status === "archived") return "archived";
  if (isCampaignFullyDelivered(campaign)) return "completed";
  return campaign.status;
}

/**
 * Apply completion status without mutating delivery evidence.
 */
export function withCampaignCompletionStatus(campaign: Campaign): Campaign {
  if (!isCampaignFullyDelivered(campaign)) return campaign;
  if (campaign.status === "completed") return campaign;
  return {
    ...campaign,
    status: "completed",
    updatedAt: campaign.updatedAt ?? new Date().toISOString(),
  };
}
