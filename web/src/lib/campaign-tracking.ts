import type {
  CampaignTrackingEvent,
  CampaignTrackingPayload,
  CampaignTrackingSummary,
  CampaignTrackingTimelinePoint,
} from "@/types/campaign-tracking";
import type { Campaign, CampaignLeadStatus } from "@/types/campaign";
import {
  decodeUtf8Base64Url,
  encodeUtf8Base64Url,
} from "./base64-url.ts";

const STATUS_RANK: Record<CampaignLeadStatus["status"], number> = {
  pending: 0,
  failed: 0,
  sent: 1,
  opened: 2,
  clicked: 3,
  replied: 4,
};

export function getTrackingBaseUrl(): string {
  const env =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_APP_URL
      : undefined;
  if (env) return env.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3000";
}

export function encodeTrackingToken(payload: CampaignTrackingPayload): string {
  return encodeUtf8Base64Url(JSON.stringify(payload));
}

export function decodeTrackingToken(token: string): CampaignTrackingPayload | null {
  try {
    const json = decodeUtf8Base64Url(token);
    if (json === null) return null;
    const data = JSON.parse(json) as CampaignTrackingPayload;
    if (!data.campaignId || !data.leadId || !data.email) return null;
    return data;
  } catch {
    return null;
  }
}

export function buildOpenTrackingUrl(payload: CampaignTrackingPayload): string {
  const base = getTrackingBaseUrl();
  const token = encodeTrackingToken(payload);
  return `${base}/api/track/open?t=${token}`;
}

export function buildClickTrackingUrl(
  payload: CampaignTrackingPayload,
  targetUrl: string
): string {
  const base = getTrackingBaseUrl();
  const token = encodeTrackingToken(payload);
  return `${base}/api/track/click?t=${token}&url=${encodeURIComponent(targetUrl)}`;
}

const SKIP_LINK_PATTERNS = [
  /^mailto:/i,
  /^tel:/i,
  /^#/,
  /\/api\/track\//,
  /unsubscribe/i,
];

function shouldSkipLink(href: string): boolean {
  return SKIP_LINK_PATTERNS.some((p) => p.test(href));
}

export function injectEmailTracking(
  html: string,
  payload: CampaignTrackingPayload
): string {
  const token = encodeTrackingToken(payload);
  const base = getTrackingBaseUrl();
  const withLinks = html.replace(
    /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
    (match, pre, href, post) => {
      if (shouldSkipLink(href)) return match;
      const tracked = `${base}/api/track/click?t=${token}&url=${encodeURIComponent(href)}`;
      return `<a ${pre}href="${tracked}"${post}>`;
    }
  );

  const pixel = `<img src="${buildOpenTrackingUrl(payload)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;margin:0;padding:0;opacity:0;" />`;
  return `${withLinks}${pixel}`;
}

export function highestLeadStatus(
  current: CampaignLeadStatus["status"],
  next: CampaignLeadStatus["status"]
): CampaignLeadStatus["status"] {
  return STATUS_RANK[next] > STATUS_RANK[current] ? next : current;
}

export function applyTrackingEventsToCampaign(
  campaign: Campaign,
  events: CampaignTrackingEvent[]
): Pick<Campaign, "leadStatuses" | "openedCount" | "clickedCount" | "repliedCount"> {
  const statusMap = new Map(
    campaign.leadStatuses.map((s) => [s.leadId, { ...s }])
  );

  const campaignEvents = events.filter((e) => e.campaignId === campaign.id);
  const sorted = [...campaignEvents].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
  );

  for (const event of sorted) {
    const existing =
      statusMap.get(event.leadId) ??
      ({ leadId: event.leadId, status: "pending" as const } satisfies CampaignLeadStatus);

    if (existing.status === "pending" || existing.status === "failed") {
      if (event.type !== "reply") continue;
    }

    const eventStatus: CampaignLeadStatus["status"] =
      event.type === "open"
        ? "opened"
        : event.type === "click"
          ? "clicked"
          : "replied";

    const status = highestLeadStatus(
      existing.status === "failed" ? "sent" : existing.status,
      eventStatus
    );

    statusMap.set(event.leadId, {
      ...existing,
      status,
      ...(event.type === "open" && !existing.openedAt
        ? { openedAt: event.occurredAt }
        : {}),
      ...(event.type === "click" && !existing.clickedAt
        ? { clickedAt: event.occurredAt }
        : {}),
      ...(event.type === "reply" && !existing.repliedAt
        ? { repliedAt: event.occurredAt }
        : {}),
    });
  }

  const leadStatuses = campaign.leadIds.map(
    (id) =>
      statusMap.get(id) ?? {
        leadId: id,
        status: "pending" as const,
      }
  );

  const openedCount = leadStatuses.filter((s) =>
    ["opened", "clicked", "replied"].includes(s.status)
  ).length;
  const clickedCount = leadStatuses.filter((s) =>
    ["clicked", "replied"].includes(s.status)
  ).length;
  const repliedCount = leadStatuses.filter((s) => s.status === "replied").length;

  return { leadStatuses, openedCount, clickedCount, repliedCount };
}

export function buildTrackingTimeline(
  events: CampaignTrackingEvent[]
): CampaignTrackingTimelinePoint[] {
  const byDate = new Map<string, CampaignTrackingTimelinePoint>();

  for (const event of events) {
    const date = event.occurredAt.slice(0, 10);
    const point = byDate.get(date) ?? {
      date,
      opens: 0,
      clicks: 0,
      replies: 0,
    };
    if (event.type === "open") point.opens++;
    if (event.type === "click") point.clicks++;
    if (event.type === "reply") point.replies++;
    byDate.set(date, point);
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function buildTrackingSummary(
  campaign: Campaign,
  events: CampaignTrackingEvent[]
): CampaignTrackingSummary {
  const campaignEvents = events.filter((e) => e.campaignId === campaign.id);
  const sent = campaign.sentCount;
  const opened = campaignEvents.filter((e) => e.type === "open").length;
  const clicked = campaignEvents.filter((e) => e.type === "click").length;
  const replied = campaignEvents.filter((e) => e.type === "reply").length;

  const uniqueOpens = new Set(
    campaignEvents.filter((e) => e.type === "open").map((e) => e.leadId)
  ).size;
  const uniqueClicks = new Set(
    campaignEvents.filter((e) => e.type === "click").map((e) => e.leadId)
  ).size;
  const uniqueReplies = new Set(
    campaignEvents.filter((e) => e.type === "reply").map((e) => e.leadId)
  ).size;

  return {
    campaignId: campaign.id,
    sent,
    opened: uniqueOpens,
    clicked: uniqueClicks,
    replied: uniqueReplies,
    openRate: sent > 0 ? Math.round((uniqueOpens / sent) * 100) : 0,
    clickRate: sent > 0 ? Math.round((uniqueClicks / sent) * 100) : 0,
    replyRate: sent > 0 ? Math.round((uniqueReplies / sent) * 100) : 0,
    clickToOpenRate:
      uniqueOpens > 0 ? Math.round((uniqueClicks / uniqueOpens) * 100) : 0,
    events: campaignEvents,
    timeline: buildTrackingTimeline(campaignEvents),
  };
}
