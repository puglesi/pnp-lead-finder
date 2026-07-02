import type { Campaign, CampaignStats } from "@/types/campaign";

export function getOpenRate(campaign: Campaign): number {
  if (campaign.sentCount === 0) return 0;
  return Math.round((campaign.openedCount / campaign.sentCount) * 100);
}

export function getClickRate(campaign: Campaign): number {
  if (campaign.sentCount === 0) return 0;
  return Math.round((campaign.clickedCount / campaign.sentCount) * 100);
}

export function getResponseRate(campaign: Campaign): number {
  if (campaign.sentCount === 0) return 0;
  return Math.round((campaign.repliedCount / campaign.sentCount) * 100);
}

export function getSendProgress(campaign: Campaign): number {
  if (campaign.leadIds.length === 0) return 0;
  const processed = campaign.sentCount + (campaign.failedCount ?? 0);
  return Math.round((processed / campaign.leadIds.length) * 100);
}

export function getAggregateResponseRate(campaigns: Campaign[]): number {
  const completed = campaigns.filter((c) => c.sentCount > 0);
  if (completed.length === 0) return 0;
  const totalSent = completed.reduce((s, c) => s + c.sentCount, 0);
  const totalReplied = completed.reduce((s, c) => s + c.repliedCount, 0);
  return Math.round((totalReplied / totalSent) * 100);
}

export function enrichCampaignStats(
  stats: CampaignStats,
  campaigns: Campaign[]
): CampaignStats & { avgResponseRate: number; totalReplies: number } {
  return {
    ...stats,
    avgResponseRate: getAggregateResponseRate(campaigns),
    totalReplies: campaigns.reduce((s, c) => s + c.repliedCount, 0),
  };
}