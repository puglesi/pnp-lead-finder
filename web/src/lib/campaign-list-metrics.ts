/**
 * Metrics used exclusively by the /campanhas list page.
 * Never trusts campaign.sentCount, failedCount, or progress fields.
 * Only counts leadStatuses with a real SMTP providerMessageId.
 */
import type { Campaign, CampaignLeadStatus } from "../types/campaign.ts";
import { getCampaignEffectiveStatus } from "./campaign-completion.ts";
import {
  isConfirmedCampaignDelivery,
  isRealDeliveryMessageId,
} from "./campaign-delivery-metrics.ts";

/** Strict SMTP-confirmed count for one campaign (ignores legacy counters). */
export function countConfirmedSmtpSends(campaign: Campaign): number {
  const statuses = campaign.leadStatuses;
  if (!Array.isArray(statuses) || statuses.length === 0) return 0;

  let count = 0;
  for (const status of statuses) {
    if (isListConfirmedSmtpDelivery(campaign, status)) count += 1;
  }
  return count;
}

/**
 * A delivery counts only when:
 * - status is sent/opened/clicked/replied
 * - providerMessageId is a real non-simulate SMTP id
 * - campaign is not a pure simulate provider
 */
export function isListConfirmedSmtpDelivery(
  campaign: Campaign,
  status: CampaignLeadStatus
): boolean {
  if (campaign.emailProvider === "simulate") return false;
  if (!isConfirmedCampaignDelivery(status)) return false;
  // Belt-and-suspenders: require real message id again at list boundary.
  return isRealDeliveryMessageId(status.providerMessageId);
}

/** Progress % = confirmed SMTP sends / lead total. Never uses failed/legacy. */
export function getCampaignListProgressPercent(campaign: Campaign): number {
  const total = Array.isArray(campaign.leadIds) ? campaign.leadIds.length : 0;
  if (total <= 0) return 0;
  const sent = countConfirmedSmtpSends(campaign);
  return Math.min(100, Math.round((sent / total) * 100));
}

/** Aggregate "Emails enviados" for /campanhas header cards. */
export function getCampaignsListTotalSent(campaigns: readonly Campaign[]): number {
  return campaigns.reduce(
    (sum, campaign) => sum + countConfirmedSmtpSends(campaign),
    0
  );
}

export function getCampaignListViewStats(campaigns: readonly Campaign[]): {
  total: number;
  active: number;
  draft: number;
  completed: number;
  totalSent: number;
  avgResponseRate: number;
} {
  let totalSent = 0;
  let totalReplied = 0;
  let active = 0;
  let draft = 0;
  let completed = 0;

  for (const campaign of campaigns) {
    const status = getCampaignEffectiveStatus(campaign);
    if (status === "active") active += 1;
    else if (status === "draft") draft += 1;
    else if (status === "completed") completed += 1;

    const sent = countConfirmedSmtpSends(campaign);
    totalSent += sent;
    if (sent > 0) {
      totalReplied += (campaign.leadStatuses ?? []).filter(
        (status) =>
          isListConfirmedSmtpDelivery(campaign, status) &&
          status.status === "replied"
      ).length;
    }
  }

  return {
    total: campaigns.length,
    active,
    draft,
    completed,
    totalSent,
    avgResponseRate:
      totalSent === 0 ? 0 : Math.round((totalReplied / totalSent) * 100),
  };
}
