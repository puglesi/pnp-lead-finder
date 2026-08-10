import {
  appendUnsubscribeFooter,
  renderEmailTemplate,
  renderFullCampaignEmail,
  stripHtmlToText,
} from "@/lib/email-templates";
import { isAutonomousProvider } from "@/lib/email-provider-utils";
import { injectEmailTracking } from "@/lib/campaign-tracking";
import { sendViaProvider } from "@/lib/email-providers";
import { useSettingsStore } from "@/store/settings-store";
import type {
  Campaign,
  CampaignBatchSendConfig,
  CampaignLeadStatus,
  CampaignSendError,
  CampaignSendingProgress,
} from "@/types/campaign";
import {
  AUTONOMOUS_BATCH_SIZE_MAX as AUTO_MAX,
  AUTONOMOUS_BATCH_SIZE_MIN as AUTO_MIN,
  BATCH_SIZE_MAX as PAID_MAX,
  BATCH_SIZE_MIN as PAID_MIN,
} from "@/types/campaign";
import type { EmailProviderCredentials, EmailProviderId } from "@/types/email-provider";
import type { Lead } from "@/types/lead";

export interface BatchSendLeadContext {
  leadId: string;
  label: string;
  email: string;
  lead: Lead | null;
}

export interface BatchSendCallbacks {
  onProgress: (progress: CampaignSendingProgress) => void;
  onCampaignPatch: (patch: Partial<Campaign>) => void;
  onLeadSent?: (lead: Lead) => void;
  isPaused: () => boolean;
  waitWhilePaused: () => Promise<void>;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    batches.push(arr.slice(i, i + size));
  }
  return batches;
}

function patchLeadStatus(
  statuses: CampaignLeadStatus[],
  leadId: string,
  patch: Partial<CampaignLeadStatus>
): CampaignLeadStatus[] {
  return statuses.map((s) =>
    s.leadId === leadId ? { ...s, ...patch } : s
  );
}

function countSent(statuses: CampaignLeadStatus[]) {
  return statuses.filter((s) =>
    ["sent", "opened", "clicked", "replied"].includes(s.status)
  ).length;
}

function countFailed(statuses: CampaignLeadStatus[]) {
  return statuses.filter((s) => s.status === "failed").length;
}

function buildProgress(
  campaignId: string,
  base: Partial<CampaignSendingProgress> & {
    currentIndex: number;
    total: number;
    phase: CampaignSendingProgress["phase"];
    provider: EmailProviderId;
    startedAt: string;
  }
): CampaignSendingProgress {
  const elapsedMs = Date.now() - new Date(base.startedAt).getTime();
  const rate = base.currentIndex > 0 ? elapsedMs / base.currentIndex : 0;
  const remaining = base.total - base.currentIndex;
  return {
    campaignId,
    currentLeadLabel: base.currentLeadLabel ?? "",
    currentBatch: base.currentBatch ?? 1,
    totalBatches: base.totalBatches ?? 1,
    batchSize: base.batchSize ?? 75,
    sentInBatch: base.sentInBatch ?? 0,
    successCount: base.successCount ?? 0,
    failedCount: base.failedCount ?? 0,
    paused: base.paused ?? false,
    nextBatchInMs: base.nextBatchInMs,
    estimatedRemainingMs: rate > 0 ? Math.round(rate * remaining) : 0,
    elapsedMs,
    ...base,
  };
}

const SYSTEMIC_BATCH_ERROR_CODES = new Set([
  "NOT_CONFIGURED",
  "AUTH",
  "EAUTH",
  "AUTHENTICATION",
  "CONFIGURATION",
  "CONNECTION",
  "ECONNECTION",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "REAL_SEND_DISABLED",
]);

function isSystemicBatchError(errorCode: string, errorMessage: string): boolean {
  const code = (errorCode || "").toUpperCase();
  const message = (errorMessage || "").toLowerCase();
  if (SYSTEMIC_BATCH_ERROR_CODES.has(code)) return true;
  if (code.includes("AUTH") || code.includes("CONFIG")) return true;
  if (
    /not[_\s-]?configured|autentica|authentication|smtp ausente|connection refused|econnrefused|timed?\s*out|envio real desativado/i.test(
      `${code} ${message}`
    )
  ) {
    return true;
  }
  return false;
}

export async function runBatchEmailSend(
  campaign: Campaign,
  leadContexts: BatchSendLeadContext[],
  credentials: EmailProviderCredentials,
  providerId: EmailProviderId,
  callbacks: BatchSendCallbacks
): Promise<{
  statuses: CampaignLeadStatus[];
  sendErrors: CampaignSendError[];
  sentCount: number;
  failedCount: number;
  stoppedEarly?: boolean;
  stopReason?: "daily_limit" | "systemic_failure" | "consecutive_failures";
}> {
  const config: CampaignBatchSendConfig = campaign.batchSend;
  const autonomous = isAutonomousProvider(providerId);
  const batchSize = autonomous
    ? Math.min(AUTO_MAX, Math.max(AUTO_MIN, config.batchSize))
    : Math.min(PAID_MAX, Math.max(PAID_MIN, config.batchSize));
  const dailyLimit = autonomous ? config.dailyLimit : 0;

  let statuses = [...campaign.leadStatuses];
  const sendErrors: CampaignSendError[] = [...(campaign.sendErrors ?? [])];

  const pending = leadContexts.filter((ctx) => {
    const st = statuses.find((s) => s.leadId === ctx.leadId);
    // Never re-attempt recipients with a confirmed provider message id.
    if (st?.providerMessageId && !String(st.providerMessageId).startsWith("sim-")) {
      return false;
    }
    return !st || st.status === "pending" || st.status === "failed";
  });

  const batches = chunk(pending, batchSize);
  const total = leadContexts.length;
  const startedAt = new Date().toISOString();
  let globalIndex = countSent(statuses) + countFailed(statuses);
  let consecutiveSameCode = 0;
  let lastErrorCode: string | null = null;
  let successfulSendsThisRun = 0;

  for (let b = 0; b < batches.length; b++) {
    await callbacks.waitWhilePaused();

    const batch = batches[b];
    let sentInBatch = 0;

    for (const ctx of batch) {
      await callbacks.waitWhilePaused();

      if (dailyLimit > 0) {
        const settings = useSettingsStore.getState();
        const remaining = settings.getAutonomousDailyRemaining(dailyLimit);
        if (remaining <= 0) {
          const now = new Date().toISOString();
          callbacks.onProgress(
            buildProgress(campaign.id, {
              phase: "paused",
              currentIndex: countSent(statuses) + countFailed(statuses),
              total,
              currentLeadLabel: `Limite diário atingido (${dailyLimit}/dia)`,
              currentBatch: b + 1,
              totalBatches: batches.length,
              batchSize,
              sentInBatch,
              successCount: countSent(statuses),
              failedCount: countFailed(statuses),
              paused: true,
              provider: providerId,
              startedAt,
            })
          );
          callbacks.onCampaignPatch({
            status: "paused",
            updatedAt: now,
          });
          return {
            statuses,
            sendErrors,
            sentCount: countSent(statuses),
            failedCount: countFailed(statuses),
            stoppedEarly: true,
            stopReason: "daily_limit",
          };
        }
      }

      const baseHtml = appendUnsubscribeFooter(
        renderFullCampaignEmail(
          campaign.body,
          campaign.signature,
          ctx.lead ?? {
            company: ctx.label,
            email: ctx.email,
            phone: "—",
            website: "—",
            address: "—",
            category: "—",
          }
        ),
        campaign.unsubscribeLink,
        ctx.lead ?? {
          company: ctx.label,
          email: ctx.email,
          phone: "—",
          website: "—",
          address: "—",
          category: "—",
        }
      );

      const html = injectEmailTracking(baseHtml, {
        campaignId: campaign.id,
        leadId: ctx.leadId,
        email: ctx.email,
      });

      const leadForTemplate = ctx.lead ?? {
        company: ctx.label,
        email: ctx.email,
        phone: "—",
        website: "—",
        address: "—",
        category: "—",
      };

      const result = await sendViaProvider(providerId, credentials, {
        to: ctx.email,
        toName: ctx.label,
        from: campaign.fromEmail,
        fromName: campaign.fromName,
        replyTo: campaign.replyTo,
        subject: renderEmailTemplate(campaign.subject, leadForTemplate),
        html,
        text: stripHtmlToText(html),
        campaignId: campaign.id,
        leadId: ctx.leadId,
        attachments: campaign.attachment
          ? [
              {
                filename: campaign.attachment.name,
                mimeType: campaign.attachment.mimeType,
                content: campaign.attachment.dataUrl.split(",")[1] ?? "",
              },
            ]
          : undefined,
      });

      globalIndex++;
      const now = new Date().toISOString();

      if (result.success) {
        statuses = patchLeadStatus(statuses, ctx.leadId, {
          status: "sent",
          sentAt: now,
          providerMessageId: result.messageId,
          errorMessage: undefined,
          errorCode: undefined,
        });
        sentInBatch++;
        successfulSendsThisRun += 1;
        consecutiveSameCode = 0;
        lastErrorCode = null;

        if (autonomous && dailyLimit > 0) {
          useSettingsStore.getState().incrementAutonomousDailySent();
        }

        if (config.autoSaveSentLeads && ctx.lead) {
          callbacks.onLeadSent?.(ctx.lead);
        }
      } else {
        const err: CampaignSendError = {
          id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          leadId: ctx.leadId,
          email: ctx.email,
          company: ctx.label,
          errorCode: result.errorCode ?? "SEND_FAILED",
          errorMessage: result.errorMessage ?? "Falha desconhecida",
          provider: result.provider,
          occurredAt: now,
          batchNumber: b + 1,
        };
        sendErrors.push(err);
        statuses = patchLeadStatus(statuses, ctx.leadId, {
          status: "failed",
          errorMessage: err.errorMessage,
          errorCode: err.errorCode,
        });

        consecutiveSameCode =
          lastErrorCode === err.errorCode ? consecutiveSameCode + 1 : 1;
        lastErrorCode = err.errorCode;

        const sentCountNow = countSent(statuses);
        const failedCountNow = countFailed(statuses);
        callbacks.onProgress(
          buildProgress(campaign.id, {
            phase: callbacks.isPaused() ? "paused" : "sending",
            currentIndex: sentCountNow + failedCountNow,
            total,
            currentLeadLabel: ctx.label,
            currentBatch: b + 1,
            totalBatches: batches.length,
            batchSize,
            sentInBatch,
            successCount: sentCountNow,
            failedCount: failedCountNow,
            paused: callbacks.isPaused(),
            provider: providerId,
            startedAt,
          })
        );
        callbacks.onCampaignPatch({
          sentCount: sentCountNow,
          failedCount: failedCountNow,
          leadStatuses: statuses,
          sendErrors,
          updatedAt: now,
        });

        // Never keep hammering hundreds of recipients when the provider is down.
        if (
          isSystemicBatchError(err.errorCode, err.errorMessage) &&
          successfulSendsThisRun === 0
        ) {
          return {
            statuses,
            sendErrors,
            sentCount: sentCountNow,
            failedCount: failedCountNow,
            stoppedEarly: true,
            stopReason: "systemic_failure",
          };
        }
        if (consecutiveSameCode >= 3) {
          return {
            statuses,
            sendErrors,
            sentCount: sentCountNow,
            failedCount: failedCountNow,
            stoppedEarly: true,
            stopReason: "consecutive_failures",
          };
        }
        if (config.delayBetweenEmailsMs > 0) {
          await delay(config.delayBetweenEmailsMs);
        }
        continue;
      }

      const sentCount = countSent(statuses);
      const failedCount = countFailed(statuses);

      callbacks.onProgress(
        buildProgress(campaign.id, {
          phase: callbacks.isPaused() ? "paused" : "sending",
          currentIndex: sentCount + failedCount,
          total,
          currentLeadLabel: ctx.label,
          currentBatch: b + 1,
          totalBatches: batches.length,
          batchSize,
          sentInBatch,
          successCount: sentCount,
          failedCount,
          paused: callbacks.isPaused(),
          provider: providerId,
          startedAt,
        })
      );

      callbacks.onCampaignPatch({
        sentCount,
        failedCount,
        leadStatuses: statuses,
        sendErrors,
        updatedAt: now,
      });

      if (config.delayBetweenEmailsMs > 0) {
        await delay(config.delayBetweenEmailsMs);
      }
    }

    if (b < batches.length - 1 && config.delayBetweenBatchesMs > 0) {
      const delayMs = config.delayBetweenBatchesMs;
      const delayStart = Date.now();

      while (Date.now() - delayStart < delayMs) {
        await callbacks.waitWhilePaused();
        const remaining = delayMs - (Date.now() - delayStart);

        callbacks.onProgress(
          buildProgress(campaign.id, {
            phase: callbacks.isPaused() ? "paused" : "batch_delay",
            currentIndex: countSent(statuses) + countFailed(statuses),
            total,
            currentLeadLabel: `Aguardando próximo lote (${Math.ceil(remaining / 1000)}s)`,
            currentBatch: b + 1,
            totalBatches: batches.length,
            batchSize,
            sentInBatch: 0,
            successCount: countSent(statuses),
            failedCount: countFailed(statuses),
            paused: callbacks.isPaused(),
            provider: providerId,
            startedAt,
            nextBatchInMs: remaining,
          })
        );

        await delay(Math.min(500, remaining));
      }
    }
  }

  return {
    statuses,
    sendErrors,
    sentCount: countSent(statuses),
    failedCount: countFailed(statuses),
  };
}

export async function runEngagementSimulation(
  campaignId: string,
  total: number,
  statuses: CampaignLeadStatus[],
  callbacks: {
    onProgress: (p: CampaignSendingProgress) => void;
    onStatuses: (s: CampaignLeadStatus[], counts: {
      opened: number;
      clicked: number;
      replied: number;
    }) => void;
    isPaused: () => boolean;
    waitWhilePaused: () => Promise<void>;
  }
): Promise<CampaignLeadStatus[]> {
  const startedAt = new Date().toISOString();
  let current = [...statuses];

  const openTarget = Math.floor(total * randomBetween(0.5, 0.72));
  const clickTarget = Math.floor(openTarget * randomBetween(0.22, 0.42));
  const replyTarget = Math.floor(total * randomBetween(0.06, 0.15));

  const countBy = (st: CampaignLeadStatus["status"]) =>
    current.filter((s) => s.status === st).length;

  const patch = (
    leadId: string,
    patchData: Partial<CampaignLeadStatus>
  ) => {
    current = patchLeadStatus(current, leadId, patchData);
  };

  const highestStatus = (
    cur: CampaignLeadStatus["status"],
    next: CampaignLeadStatus["status"]
  ) => {
    const order = ["pending", "failed", "sent", "opened", "clicked", "replied"] as const;
    return order.indexOf(next) > order.indexOf(cur) ? next : cur;
  };

  callbacks.onProgress({
    campaignId,
    phase: "opens",
    currentIndex: total,
    total,
    currentLeadLabel: "Registrando aberturas...",
    currentBatch: 0,
    totalBatches: 0,
    batchSize: 0,
    sentInBatch: 0,
    successCount: countBy("sent") + countBy("opened") + countBy("clicked") + countBy("replied"),
    failedCount: countBy("failed"),
    paused: false,
    provider: "simulate",
    startedAt,
    elapsedMs: 0,
    estimatedRemainingMs: 0,
  });

  let opened =
    countBy("opened") + countBy("clicked") + countBy("replied");
  while (opened < openTarget) {
    await callbacks.waitWhilePaused();
    await delay(randomBetween(180, 420));
    const pending = current.filter((s) => s.status === "sent");
    if (pending.length === 0) break;
    const pick = pending[Math.floor(Math.random() * pending.length)];
    patch(pick.leadId, { status: "opened", openedAt: new Date().toISOString() });
    opened++;
    callbacks.onStatuses(current, {
      opened,
      clicked: countBy("clicked") + countBy("replied"),
      replied: countBy("replied"),
    });
  }

  callbacks.onProgress({
    campaignId,
    phase: "clicks",
    currentIndex: total,
    total,
    currentLeadLabel: "Registrando cliques...",
    currentBatch: 0,
    totalBatches: 0,
    batchSize: 0,
    sentInBatch: 0,
    successCount: opened,
    failedCount: countBy("failed"),
    paused: false,
    provider: "simulate",
    startedAt,
    elapsedMs: 0,
    estimatedRemainingMs: 0,
  });

  let clicked = countBy("clicked") + countBy("replied");
  while (clicked < clickTarget) {
    await callbacks.waitWhilePaused();
    await delay(randomBetween(220, 480));
    const openedLeads = current.filter((s) => s.status === "opened");
    if (openedLeads.length === 0) break;
    const pick = openedLeads[Math.floor(Math.random() * openedLeads.length)];
    patch(pick.leadId, { status: "clicked", clickedAt: new Date().toISOString() });
    clicked++;
    callbacks.onStatuses(current, {
      opened,
      clicked,
      replied: countBy("replied"),
    });
  }

  callbacks.onProgress({
    campaignId,
    phase: "replies",
    currentIndex: total,
    total,
    currentLeadLabel: "Registrando respostas...",
    currentBatch: 0,
    totalBatches: 0,
    batchSize: 0,
    sentInBatch: 0,
    successCount: opened,
    failedCount: countBy("failed"),
    paused: false,
    provider: "simulate",
    startedAt,
    elapsedMs: 0,
    estimatedRemainingMs: 0,
  });

  let replied = countBy("replied");
  while (replied < replyTarget) {
    await callbacks.waitWhilePaused();
    await delay(randomBetween(300, 650));
    const candidates = current.filter(
      (s) => s.status === "opened" || s.status === "clicked"
    );
    if (candidates.length === 0) break;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    patch(pick.leadId, { status: "replied", repliedAt: new Date().toISOString() });
    replied++;
    callbacks.onStatuses(current, {
      opened,
      clicked,
      replied,
    });
  }

  return current;
}