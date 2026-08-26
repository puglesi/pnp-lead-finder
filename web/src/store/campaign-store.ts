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
import type { EmailContactKind } from "@/lib/global-email-deduplication";
import {
  DEFAULT_AUTONOMOUS_BATCH_CONFIG,
  DEFAULT_BATCH_SEND_CONFIG,
  DEFAULT_CAMPAIGN_SEND_CONFIG as SEND_DEFAULTS,
  DEFAULT_FOLLOW_UP,
  DEFAULT_UNSUBSCRIBE_LINK,
  initLeadStatuses,
  type Campaign,
  type CampaignFollowUp,
  type CampaignSignature,
  type CampaignLeadSource,
  type CampaignSendingProgress,
  type CampaignStats,
  type CampaignStatus,
} from "@/types/campaign";
import type { EmailProviderId } from "@/types/email-provider";
import { useLeadStore } from "@/store/lead-store";
import { useSettingsStore } from "@/store/settings-store";
import { useBatchPipelineStore } from "@/store/batch-pipeline-store";
import { applyCampaignDeliveryReconciliation } from "@/lib/campaign-metrics";
import { normalizeCampaignPersistSlice } from "@/lib/store-rehydrate";
import { asArray } from "@/lib/safe-object";
import {
  EMPTY_OPERATION_SIGNATURE,
  ensureOperationSignaturesHydrated,
  useOperationSignatureStore,
} from "@/store/operation-signature-store";
import {
  bindSignatureToOperation,
  getOperationSignatureMismatch,
} from "@/lib/operation-signature";
import { getOperationSendAccount } from "@/lib/operation-identity";
import {
  assertLocalDataWritable,
  ensureLocalDataWritable,
} from "@/lib/local-data-client";

interface CampaignStore {
  campaigns: Campaign[];
  sendingCampaignId: string | null;
  sendingProgress: CampaignSendingProgress | null;
  sendPaused: boolean;
  createCampaign: (data: {
    campaignProfileId?: CampaignProfileId;
    emailTemplateId?: string;
    contactKind?: EmailContactKind;
    name: string;
    subject: string;
    body: string;
    leadIds: string[];
    leadSource?: CampaignLeadSource;
    batchId?: string;
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
  /** Rewrite persisted delivery counters from real SMTP evidence only. */
  normalizeLegacyDeliveryMetrics: () => void;
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
        assertLocalDataWritable();
        const settings = useSettingsStore.getState();
        const campaignProfileId =
          data.campaignProfileId ?? "panek-puglesi";
        const campaign: Campaign = {
          id: `camp-${Date.now()}`,
          campaignProfileId,
          emailTemplateId: data.emailTemplateId,
          contactKind: data.contactKind ?? "first_contact",
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
          batchId: data.batchId,
          status: "draft",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sentCount: 0,
          openedCount: 0,
          clickedCount: 0,
          repliedCount: 0,
          failedCount: 0,
          attachment: data.attachment ?? null,
          signature: bindSignatureToOperation(
            campaignProfileId,
            data.signature
              ? {
                  enabled:
                    data.signature.enabled ??
                    Boolean(data.signature.body?.trim()),
                  body: data.signature.body ?? "",
                }
              : EMPTY_OPERATION_SIGNATURE
          ),
          batchSend: { ...DEFAULT_BATCH_SEND_CONFIG, ...data.batchSend },
          sendErrors: [],
          emailProvider: data.emailProvider ?? settings.emailProvider ?? "simulate",
        };
        set((state) => ({ campaigns: [campaign, ...state.campaigns] }));
        return campaign;
      },

      updateCampaign: (id, data) =>
        (assertLocalDataWritable(), set((state) => ({
          campaigns: state.campaigns.map((c) =>
            c.id === id
              ? { ...c, ...data, updatedAt: new Date().toISOString() }
              : c
          ),
        }))),

      duplicateCampaign: (id) => {
        assertLocalDataWritable();
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
          emailTemplateId: source.emailTemplateId,
          contactKind: source.contactKind ?? "first_contact",
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
        (assertLocalDataWritable(), set((state) => ({
          campaigns: state.campaigns.filter((c) => c.id !== id),
          sendingCampaignId:
            state.sendingCampaignId === id ? null : state.sendingCampaignId,
          sendingProgress:
            state.sendingProgress?.campaignId === id
              ? null
              : state.sendingProgress,
        }))),

      setCampaignStatus: (id, status) =>
        (assertLocalDataWritable(), set((state) => ({
          campaigns: state.campaigns.map((c) =>
            c.id === id
              ? { ...c, status, updatedAt: new Date().toISOString() }
              : c
          ),
        }))),

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
        await ensureLocalDataWritable();
        let campaign = get().getCampaign(id);
        if (!campaign) return;

        await ensureOperationSignaturesHydrated();
        const operation = campaign.campaignProfileId;
        const officialSignature = bindSignatureToOperation(
          operation,
          useOperationSignatureStore.getState().getSignature(operation)
        );
        const signatureBlock = getOperationSignatureMismatch(
          operation,
          officialSignature,
          { requireOperationId: true }
        );
        if (signatureBlock) throw new Error(signatureBlock);
        const account = getOperationSendAccount(operation);
        get().updateCampaign(id, {
          fromName: account.fromName,
          fromEmail: account.fromEmail,
          replyTo: account.replyTo,
          signature: officialSignature,
        });
        campaign = get().getCampaign(id)!;

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

        const updatedCampaign = {
          ...campaign,
          status:
            batchResult.stoppedEarly && batchResult.stopReason === "daily_limit"
              ? ("paused" as const)
              : ("completed" as const),
          sentCount: batchResult.sentCount,
          failedCount: batchResult.failedCount,
          sendErrors: batchResult.sendErrors,
          openedCount: finalOpened,
          clickedCount: finalClicked,
          repliedCount: finalReplied,
          leadStatuses: statuses,
          updatedAt: new Date().toISOString(),
        };
        const reconciled = applyCampaignDeliveryReconciliation(updatedCampaign);

        set((state) => ({
          sendingCampaignId: null,
          sendingProgress: null,
          sendPaused: false,
          campaigns: state.campaigns.map((c) =>
            c.id === id ? reconciled : c
          ),
        }));

        if (
          reconciled.status === "completed" &&
          reconciled.batchId
        ) {
          useBatchPipelineStore
            .getState()
            .updateBatchStage(reconciled.batchId, "complete");
        }
      },

      simulateSend: async (id, leadContexts) => {
        return get().startBatchSend(id, leadContexts);
      },

      getCampaign: (id) => get().campaigns.find((c) => c.id === id),

      getStats: () => {
        const campaigns = Array.isArray(get().campaigns) ? get().campaigns : [];
        return {
          total: campaigns.length,
          active: campaigns.filter((c) => c.status === "active").length,
          draft: campaigns.filter((c) => c.status === "draft").length,
          completed: campaigns.filter((c) => c.status === "completed").length,
          totalSent: campaigns.reduce((sum, c) => {
            try {
              return sum + applyCampaignDeliveryReconciliation(c).sentCount;
            } catch {
              return sum;
            }
          }, 0),
        };
      },

      normalizeLegacyDeliveryMetrics: () => {
        set((state) => ({
          campaigns: (Array.isArray(state.campaigns) ? state.campaigns : [])
            .map((campaign) => {
              try {
                return applyCampaignDeliveryReconciliation({
                  ...campaign,
                  leadIds: Array.isArray(campaign.leadIds)
                    ? campaign.leadIds
                    : [],
                  leadStatuses: Array.isArray(campaign.leadStatuses)
                    ? campaign.leadStatuses
                    : initLeadStatuses(
                        Array.isArray(campaign.leadIds) ? campaign.leadIds : []
                      ),
                  sendErrors: Array.isArray(campaign.sendErrors)
                    ? campaign.sendErrors
                    : [],
                });
              } catch {
                return campaign;
              }
            })
            .filter(Boolean),
          sendingProgress: null,
          sendingCampaignId: null,
          sendPaused: false,
        }));
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
      // v14: safe arrays + new statuses (saved/archived) without wiping data.
      version: 14,
      migrate: (persisted, fromVersion) => {
        const state = persisted as { campaigns?: Campaign[] } | null;
        if (!state || typeof state !== "object") {
          return {
            campaigns: [],
            sendingProgress: null,
            sendingCampaignId: null,
            sendPaused: false,
          };
        }
        if (!Array.isArray(state.campaigns)) {
          return {
            ...state,
            campaigns: [],
            sendingProgress: null,
            sendingCampaignId: null,
            sendPaused: false,
          };
        }

        const isLegacySignature = (body?: string) =>
          Boolean(
            body?.includes("Business Development") ||
              body?.includes(">PP</div>") ||
              body?.includes("gradient(135deg,#1e40af")
          );

        void fromVersion;

        return {
          ...state,
          sendingProgress: null,
          sendingCampaignId: null,
          sendPaused: false,
          campaigns: state.campaigns.map((c) => {
            const campaignProfileId =
              c.campaignProfileId === "modeclean"
                ? "modeclean"
                : "panek-puglesi";
            let signature = bindSignatureToOperation(
              campaignProfileId,
              c.signature ?? EMPTY_OPERATION_SIGNATURE
            );
            if (isLegacySignature(signature.body)) {
              signature = bindSignatureToOperation(
                campaignProfileId,
                EMPTY_OPERATION_SIGNATURE
              );
            }
            const base: Campaign = {
              ...c,
              campaignProfileId,
              emailTemplateId: c.emailTemplateId,
              contactKind: c.contactKind ?? "first_contact",
              leadSource: c.leadSource ?? "saved",
              fromName: c.fromName ?? SEND_DEFAULTS.fromName,
              fromEmail: c.fromEmail ?? SEND_DEFAULTS.fromEmail,
              replyTo: c.replyTo ?? SEND_DEFAULTS.replyTo,
              unsubscribeLink: c.unsubscribeLink ?? DEFAULT_UNSUBSCRIBE_LINK,
              followUp: c.followUp ?? { ...DEFAULT_FOLLOW_UP },
              status: normalizeCampaignStatus(c.status),
              leadIds: Array.isArray(c.leadIds) ? c.leadIds : [],
              leadStatuses: Array.isArray(c.leadStatuses)
                ? c.leadStatuses
                : initLeadStatuses(
                    Array.isArray(c.leadIds) ? c.leadIds : []
                  ),
              clickedCount: c.clickedCount ?? 0,
              attachment: c.attachment ?? null,
              signature,
              batchSend: {
                ...(isAutonomousProvider(c.emailProvider ?? "simulate")
                  ? DEFAULT_AUTONOMOUS_BATCH_CONFIG
                  : DEFAULT_BATCH_SEND_CONFIG),
                ...(c.batchSend && typeof c.batchSend === "object"
                  ? c.batchSend
                  : {}),
                dailyLimit:
                  c.batchSend?.dailyLimit ??
                  (isAutonomousProvider(c.emailProvider ?? "simulate") ? 100 : 0),
              },
              sendErrors: Array.isArray(c.sendErrors) ? c.sendErrors : [],
              failedCount: c.failedCount ?? 0,
              sentCount: c.sentCount ?? 0,
              openedCount: c.openedCount ?? 0,
              repliedCount: c.repliedCount ?? 0,
              emailProvider: c.emailProvider ?? "simulate",
            };
            try {
              return applyCampaignDeliveryReconciliation(base);
            } catch {
              return base;
            }
          }),
        };
      },
      merge: (persisted, current) => {
        // Exact field repair first: campaigns / leadIds / leadStatuses / sendErrors
        // must never reach UI as null (legacy Object.values / .map crashes).
        const normalized = normalizeCampaignPersistSlice(persisted);
        const campaigns = asArray<Campaign>(normalized.campaigns)
          .map((campaign) => {
            if (!campaign || typeof campaign !== "object") return null;
            try {
              return applyCampaignDeliveryReconciliation({
                ...campaign,
                status: normalizeCampaignStatus(campaign.status),
                leadIds: asArray<string>(campaign.leadIds),
                leadStatuses: asArray(campaign.leadStatuses).length
                  ? asArray(campaign.leadStatuses)
                  : initLeadStatuses(asArray<string>(campaign.leadIds)),
                sendErrors: asArray(campaign.sendErrors),
                failedCount: campaign.failedCount ?? 0,
                sentCount: campaign.sentCount ?? 0,
                openedCount: campaign.openedCount ?? 0,
                clickedCount: campaign.clickedCount ?? 0,
                repliedCount: campaign.repliedCount ?? 0,
                emailProvider: campaign.emailProvider ?? "simulate",
              } as Campaign);
            } catch {
              return null;
            }
          })
          .filter((c): c is Campaign => Boolean(c));
        return {
          ...current,
          campaigns: campaigns.length > 0 || Array.isArray(
            (persisted as { campaigns?: unknown } | null)?.campaigns
          )
            ? campaigns
            : current.campaigns,
          sendingProgress: null,
          sendingCampaignId: null,
          sendPaused: false,
        };
      },
    }
  )
);

function normalizeCampaignStatus(
  status: unknown
): import("@/types/campaign").CampaignStatus {
  if (
    status === "draft" ||
    status === "saved" ||
    status === "active" ||
    status === "paused" ||
    status === "completed" ||
    status === "archived"
  ) {
    return status;
  }
  return "draft";
}
