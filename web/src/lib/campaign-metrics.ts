import type { Campaign, CampaignStats } from "../types/campaign.ts";
import { reconcileCampaignDelivery } from "./campaign-delivery-metrics.ts";

/**
 * Prefer counters after reconciling legacy pseudo-sends.
 * Never trust a stale campaign.sentCount / failedCount field.
 */
export function getCampaignDeliverySnapshot(campaign: Campaign): {
  sentCount: number;
  failedCount: number;
  openedCount: number;
  clickedCount: number;
  repliedCount: number;
} {
  const reconciled = reconcileCampaignDelivery(campaign);
  return {
    sentCount: reconciled.sentCount,
    failedCount: reconciled.failedCount,
    openedCount: reconciled.openedCount,
    clickedCount: reconciled.clickedCount,
    repliedCount: reconciled.repliedCount,
  };
}

export function getOpenRate(campaign: Campaign): number {
  const { sentCount, openedCount } = getCampaignDeliverySnapshot(campaign);
  if (sentCount === 0) return 0;
  return Math.round((openedCount / sentCount) * 100);
}

export function getClickRate(campaign: Campaign): number {
  const { sentCount, clickedCount } = getCampaignDeliverySnapshot(campaign);
  if (sentCount === 0) return 0;
  return Math.round((clickedCount / sentCount) * 100);
}

export function getResponseRate(campaign: Campaign): number {
  const { sentCount, repliedCount } = getCampaignDeliverySnapshot(campaign);
  if (sentCount === 0) return 0;
  return Math.round((repliedCount / sentCount) * 100);
}

/** Progress = confirmed SMTP sends only (never legacy failed/simulate). */
export function getSendProgress(campaign: Campaign): number {
  if (campaign.leadIds.length === 0) return 0;
  const { sentCount } = getCampaignDeliverySnapshot(campaign);
  return Math.round((sentCount / campaign.leadIds.length) * 100);
}

export function getAggregateResponseRate(campaigns: Campaign[]): number {
  let totalSent = 0;
  let totalReplied = 0;
  for (const campaign of campaigns) {
    const snapshot = getCampaignDeliverySnapshot(campaign);
    if (snapshot.sentCount === 0) continue;
    totalSent += snapshot.sentCount;
    totalReplied += snapshot.repliedCount;
  }
  if (totalSent === 0) return 0;
  return Math.round((totalReplied / totalSent) * 100);
}

export function enrichCampaignStats(
  stats: CampaignStats,
  campaigns: Campaign[]
): CampaignStats & { avgResponseRate: number; totalReplies: number } {
  const totalSent = campaigns.reduce(
    (sum, campaign) => sum + getCampaignDeliverySnapshot(campaign).sentCount,
    0
  );
  const totalReplies = campaigns.reduce(
    (sum, campaign) => sum + getCampaignDeliverySnapshot(campaign).repliedCount,
    0
  );
  return {
    ...stats,
    totalSent,
    avgResponseRate: getAggregateResponseRate(campaigns),
    totalReplies,
  };
}

export function applyCampaignDeliveryReconciliation(
  campaign: Campaign
): Campaign {
  const reconciled = reconcileCampaignDelivery(campaign);
  // Always rewrite counters so stale sentCount/progress never survives rehydrate.
  return {
    ...campaign,
    leadStatuses: reconciled.leadStatuses,
    sentCount: reconciled.sentCount,
    failedCount: reconciled.failedCount,
    openedCount: reconciled.openedCount,
    clickedCount: reconciled.clickedCount,
    repliedCount: reconciled.repliedCount,
    sendErrors: reconciled.sendErrors,
  };
}