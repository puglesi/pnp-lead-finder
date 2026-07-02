export type CampaignTrackingEventType = "open" | "click" | "reply";

export interface CampaignTrackingPayload {
  campaignId: string;
  leadId: string;
  email: string;
}

export interface CampaignTrackingEvent {
  id: string;
  campaignId: string;
  leadId: string;
  email: string;
  type: CampaignTrackingEventType;
  url?: string;
  userAgent?: string;
  source?: "pixel" | "link" | "manual" | "simulated";
  occurredAt: string;
}

export interface CampaignTrackingSummary {
  campaignId: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  clickToOpenRate: number;
  events: CampaignTrackingEvent[];
  timeline: CampaignTrackingTimelinePoint[];
}

export interface CampaignTrackingTimelinePoint {
  date: string;
  opens: number;
  clicks: number;
  replies: number;
}