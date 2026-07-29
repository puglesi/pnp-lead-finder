import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  runBatchEmailSend,
  runEngagementSimulation,
  type BatchSendLeadContext,
} from "@/lib/campaign-batch-sender";
import { applyTrackingEventsToCampaign } from "@/lib/campaign-tracking";
import { isAutonomousProvider } from "@/lib/email-provider-utils";
import type { CampaignTrackingEvent } from "@/types/campaign-tracking";
import type { CampaignProfileId } from "@/types/campaign-profile";
import {
  DEFAULT_AUTONOMOUS_BATCH_CONFIG,
  DEFAULT_BATCH_SEND_CONFIG,
  DEFAULT_CAMPAIGN_SEND_CONFIG as SEND_DEFAULTS,
  DEFAULT_FOLLOW_UP,
  DEFAULT_SIGNATURE,
  DEFAULT_UNSUBSCRIBE_LINK,
  initLeadStatuses,
  type Campaign,
  type CampaignFollowUp,
  type CampaignSignature,
  type CampaignLeadSource,
  type CampaignLeadStatus,
  type CampaignSendingProgress,
  type CampaignStats,
  type CampaignStatus,
} from "@/types/campaign";
import type { EmailProviderId } from "@/types/email-provider";
import { useLeadStore } from "@/store/lead-store";
import { useSettingsStore } from "@/store/settings-store";

interface CampaignStore {
  campaigns: Campaign[];
  sendingCampaignId: string | null;
  sendingProgress: CampaignSendingProgress | null;
  sendPaused: boolean;
  createCampaign: (data: {
    campaignProfileId?: CampaignProfileId;
    name: string;
    subject: string;
    body: string;
    leadIds: string[];
    leadSource?: CampaignLeadSource;
    fromName?: string;
    fromEmail?: string;
    replyTo?: string;
    unsubscribeLink?: string;
    followUp?: Partial<CampaignFollowUp>;
    attachment?: Campaign["attachment"];
    signature?: Partial<CampaignSignature>;
    batchSend?: Partial<Campaign["batchSend"]>;
    emailProvider?: EmailProviderId;
  }) => Campaign;
  updateCampaign: (id: string, data: Partial<Campaign>) => void;
  duplicateCampaign: (id: string) => Campaign | null;
  deleteCampaign: (id: string) => void;
  setCampaignStatus: (id: string, status: CampaignStatus) => void;
  startBatchSend: (id: string, leadContexts: BatchSendLeadContext[]) => Promise<void>;
  pauseBatchSend: () => void;
  resumeBatchSend: () => void;
  /** @deprecated use startBatchSend */
  simulateSend: (id: string, leadContexts: BatchSendLeadContext[]) => Promise<void>;
  getCampaign: (id: string) => Campaign | undefined;
  getStats: () => CampaignStats;
  syncCampaignTracking: (id: string) => Promise<CampaignTrackingEvent[]>;
  markLeadReplied: (
    campaignId: string,
    leadId: string,
    email: string
  ) => Promise<void>;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const useCampaignStore = create<CampaignStore>()(
  persist(
    (set, get) => ({
      campaigns: [],
      sendingCampaignId: null,
      sendingProgress: null,
      sendPaused: false,

      createCampaign: (data) => {
        const settings = useSettingsStore.getState();
        const campaign: Campaign = {
          id: `camp-${Date.now()}`,
          campaignProfileId: data.campaignProfileId ?? "panek-puglesi",
          name: data.name,
          subject: data.subject,
          body: data.body,
          fromName: data.fromName ?? SEND_DEFAULTS.fromName,
          fromEmail: data.fromEmail ?? SEND_DEFAULTS.fromEmail,
          replyTo: data.replyTo ?? SEND_DEFAULTS.replyTo,
          unsubscribeLink:
            data.unsubscribeLink ?? SEND_DEFAULTS.unsubscribeLink,
          followUp: { ...DEFAULT_FOLLOW_UP, ...data.followUp },
          leadIds: data.leadIds,
          leadStatuses: initLeadStatuses(data.leadIds),
          leadSource: data.leadSource ?? "saved",
          status: "draft",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sentCount: 0,
          openedCount: 0,
          clickedCount: 0,
          repliedCount: 0,
          failedCount: 0,
          attachment: data.attachment ?? null,
          signature: { ...DEFAULT_SIGNATURE, ...data.signature },
          batchSend: { ...DEFAULT_BATCH_SEND_CONFIG, ...data.batchSend },
          sendErrors: [],
          emailProvider: data.emailProvider ?? settings.emailProvider ?? "simulate",
        };
        set((state) => ({ campaigns: [campaign, ...state.campaigns] }));
        return campaign;
      },

      updateCampaign: (id, data) =>
        set((state) => ({
          campaigns: state.campaigns.map((c) =>
            c.id === id
              ? { ...c, ...data, updatedAt: new Date().toISOString() }
              : c
          ),
        })),

      duplicateCampaign: (id) => {
        const source = get().getCampaign(id);
        if (!source) return null;

        const baseName = source.name.replace(/ \(Cópia(?: \d+)?\)$/i, "").trim();
        const existingNames = new Set(get().campaigns.map((c) => c.name));
        let copyName = `${baseName} (Cópia)`;
        let suffix = 2;
        while (existingNames.has(copyName)) {
          copyName = `${baseName} (Cópia ${suffix})`;
          suffix++;
        }

        const now = new Date().toISOString();
        const copy: Campaign = {
          id: `camp-${Date.now()}`,
          campaignProfileId: source.campaignProfileId,
          name: copyName,
          subject: source.subject,
          body: source.body,
          fromName: source.fromName,
          fromEmail: source.fromEmail,
          replyTo: source.replyTo,
          unsubscribeLink: source.unsubscribeLink,
          followUp: { ...source.followUp },
          signature: { ...source.signature },
          attachment: source.attachment ? { ...source.attachment } : null,
          batchSend: { ...source.batchSend },
          emailProvider: source.emailProvider,
          leadIds: [...source.leadIds],
          leadStatuses: initLeadStatuses(source.leadIds),
          leadSource: source.leadSource,
          status: "draft",
          createdAt: now,
          updatedAt: now,
          sentCount: 0,
          openedCount: 0,
          clickedCount: 0,
          repliedCount: 0,
          failedCount: 0,
          sendErrors: [],
        };

        set((state) => ({ campaigns: [copy, ...state.campaigns] }));
        return copy;
      },

      deleteCampaign: (id) =>
        set((state) => ({
          campaigns: state.campaigns.filter((c) => c.id !== id),
          sendingCampaignId:
            state.sendingCampaignId === id ? null : state.sendingCampaignId,
          sendingProgress:
            state.sendingProgress?.campaignId === id
              ? null
              : state.sendingProgress,
        })),

      setCampaignStatus: (id, status) =>
        set((state) => ({
          campaigns: state.campaigns.map((c) =>
            c.id === id
              ? { ...c, status, updatedAt: new Date().toISOString() }
              : c
          ),
        })),

      pauseBatchSend: () => {
        const { sendingCampaignId, sendingProgress } = get();
        if (!sendingCampaignId) return;
        set({
          sendPaused: true,
          sendingProgress: sendingProgress
            ? { ...sendingProgress, paused: true, phase: "paused" }
            : null,
          campaigns: get().campaigns.map((c) =>
            c.id === sendingCampaignId
              ? { ...c, status: "paused" as const }
              : c
          ),
        });
      },

      resumeBatchSend: () => {
        const { sendingCampaignId, sendingProgress } = get();
        if (!sendingCampaignId) return;
        set({
          sendPaused: false,
          sendingProgress: sendingProgress
            ? { ...sendingProgress, paused: false, phase: "sending" }
            : null,
          campaigns: get().campaigns.map((c) =>
            c.id === sendingCampaignId
              ? { ...c, status: "active" as const }
              : c
          ),
        });
      },

      startBatchSend: async (id, leadContexts) => {
        let campaign = get().getCampaign(id);
        if (!campaign) return;

        const settings = useSettingsStore.getState();
        const providerId =
          campaign.emailProvider ?? settings.emailProvider ?? "simulate";
        const credentials = settings.getEmailProviderCredentials();

        if (campaign.leadStatuses.length !== campaign.leadIds.length) {
          get().updateCampaign(id, {
            leadStatuses: initLeadStatuses(campaign.leadIds),
          });
          campaign = get().getCampaign(id)!;
        }

        const startedAt = new Date().toISOString();

        set({
          sendingCampaignId: id,
          sendPaused: false,
          sendingProgress: {
            campaignId: id,
            currentIndex: campaign.sentCount + campaign.failedCount,
            total: campaign.leadIds.length,
            currentLeadLabel: "Iniciando envio em lotes...",
            phase: "sending",
            currentBatch: 1,
            totalBatches: Math.ceil(
              campaign.leadIds.length / campaign.batchSend.batchSize
            ),
            batchSize: campaign.batchSend.batchSize,
            sentInBatch: 0,
            successCount: campaign.sentCount,
            failedCount: campaign.failedCount,
            paused: false,
            provider: providerId,
            startedAt,
            elapsedMs: 0,
            estimatedRemainingMs: 0,
          },
          campaigns: get().campaigns.map((c) =>
            c.id === id ? { ...c, status: "active" as const, emailProvider: providerId } : c
          ),
        });

        const batchResult = await runBatchEmailSend(
          campaign,
          leadContexts,
          credentials,
          providerId,
          {
            isPaused: () => get().sendPaused,
            waitWhilePaused: async () => {
              while (get().sendPaused && get().sendingCampaignId === id) {
                const prog = get().sendingProgress;
                if (prog) {
                  set({
                    sendingProgress: {
                      ...prog,
                      paused: true,
                      phase: "paused",
                    },
                  });
                }
                await delay(400);
              }
            },
            onProgress: (progress) => set({ sendingProgress: progress }),
            onCampaignPatch: (patch) => get().updateCampaign(id, patch),
            onLeadSent: (lead) => {
              useLeadStore.getState().saveLead(lead);
            },
          }
        );

        let statuses = batchResult.statuses;

        let finalOpened = statuses.filter((s) =>
          ["opened", "clicked", "replied"].includes(s.status)
        ).length;
        let finalClicked = statuses.filter((s) =>
          ["clicked", "replied"].includes(s.status)
        ).length;
        let finalReplied = statuses.filter((s) => s.status === "replied").length;

        if (providerId === "simulate") {
          statuses = await runEngagementSimulation(
            id,
            campaign.leadIds.length,
            statuses,
            {
              isPaused: () => get().sendPaused,
              waitWhilePaused: async () => {
                while (get().sendPaused && get().sendingCampaignId === id) {
                  await delay(400);
                }
              },
              onProgress: (progress) => set({ sendingProgress: progress }),
              onStatuses: (s, counts) => {
                statuses = s;
                get().updateCampaign(id, {
                  leadStatuses: s,
                  openedCount: counts.opened,
                  clickedCount: counts.clicked,
                  repliedCount: counts.replied,
                });
              },
            }
          );

          finalOpened = statuses.filter((s) =>
            ["opened", "clicked", "replied"].includes(s.status)
          ).length;
          finalClicked = statuses.filter((s) =>
            ["clicked", "replied"].includes(s.status)
          ).length;
          finalReplied = statuses.filter((s) => s.status === "replied").length;
        }

        const finalStatus =
          batchResult.stoppedEarly && batchResult.stopReason === "daily_limit"
            ? ("paused" as const)
            : ("completed" as const);

        set((state) => ({
          sendingCampaignId: null,
          sendingProgress: null,
          sendPaused: false,
          campaigns: state.campaigns.map((c) =>
            c.id === id
              ? {
                  ...c,
                  status: finalStatus,
                  sentCount: batchResult.sentCount,
                  failedCount: batchResult.failedCount,
                  sendErrors: batchResult.sendErrors,
                  openedCount: finalOpened,
                  clickedCount: finalClicked,
                  repliedCount: finalReplied,
                  leadStatuses: statuses,
                  updatedAt: new Date().toISOString(),
                }
              : c
          ),
        }));
      },

      simulateSend: async (id, leadContexts) => {
        return get().startBatchSend(id, leadContexts);
      },

      getCampaign: (id) => get().campaigns.find((c) => c.id === id),

      getStats: () => {
        const { campaigns } = get();
        return {
          total: campaigns.length,
          active: campaigns.filter((c) => c.status === "active").length,
          draft: campaigns.filter((c) => c.status === "draft").length,
          completed: campaigns.filter((c) => c.status === "completed").length,
          totalSent: campaigns.reduce((sum, c) => sum + c.sentCount, 0),
        };
      },

      syncCampaignTracking: async (id) => {
        const campaign = get().getCampaign(id);
        if (!campaign) return [];

        try {
          const res = await fetch(`/api/track/events?campaignId=${encodeURIComponent(id)}`);
          if (!res.ok) return [];
          const data = (await res.json()) as { events?: CampaignTrackingEvent[] };
          const events = data.events ?? [];
          const patch = applyTrackingEventsToCampaign(campaign, events);
          get().updateCampaign(id, patch);
          return events;
        } catch {
          return [];
        }
      },

      markLeadReplied: async (campaignId, leadId, email) => {
        await fetch("/api/track/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId,
            leadId,
            email,
            source: "manual",
          }),
        });
        await get().syncCampaignTracking(campaignId);
      },
    }),
    {
      name: "pnp-campaigns",
      version: 10,
      migrate: (persisted) => {
        const state = persisted as { campaigns?: Campaign[] };
        if (!state?.campaigns) return persisted;

        const isLegacySignature = (body?: string) =>
          Boolean(
            body?.includes("Business Development") ||
              body?.includes(">PP</div>") ||
              body?.includes("gradient(135deg,#1e40af")
          );

        return {
          ...state,
          sendingProgress: null,
          campaigns: state.campaigns.map((c) => {
            const signature = c.signature ?? { ...DEFAULT_SIGNATURE };
            if (isLegacySignature(signature.body)) {
              signature.body = DEFAULT_SIGNATURE.body;
            }
            return {
              ...c,
              campaignProfileId:
                c.campaignProfileId === "modeclean"
                  ? "modeclean"
                  : "panek-puglesi",
              leadSource: c.leadSource ?? "saved",
              fromName: c.fromName ?? SEND_DEFAULTS.fromName,
              fromEmail: c.fromEmail ?? SEND_DEFAULTS.fromEmail,
              replyTo: c.replyTo ?? SEND_DEFAULTS.replyTo,
              unsubscribeLink: c.unsubscribeLink ?? DEFAULT_UNSUBSCRIBE_LINK,
              followUp: c.followUp ?? { ...DEFAULT_FOLLOW_UP },
              leadStatuses:
                c.leadStatuses?.length > 0
                  ? c.leadStatuses
                  : initLeadStatuses(c.leadIds ?? []),
              clickedCount: c.clickedCount ?? 0,
              attachment: c.attachment ?? null,
              signature,
              batchSend: {
                ...(isAutonomousProvider(c.emailProvider ?? "simulate")
                  ? DEFAULT_AUTONOMOUS_BATCH_CONFIG
                  : DEFAULT_BATCH_SEND_CONFIG),
                ...c.batchSend,
                dailyLimit:
                  c.batchSend?.dailyLimit ??
                  (isAutonomousProvider(c.emailProvider ?? "simulate") ? 100 : 0),
              },
              sendErrors: c.sendErrors ?? [],
              failedCount: c.failedCount ?? 0,
              emailProvider: c.emailProvider ?? "simulate",
            };
          }),
        };
      },
    }
  )
);
