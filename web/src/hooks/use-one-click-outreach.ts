"use client";

import { useCallback, useRef, useState } from "react";
import toast from "react-hot-toast";
import { requestAgentOneEmailEnrichment } from "@/lib/agent-one-enrichment";
import {
  checkAgentThreeSmtpAvailability,
} from "@/lib/agent-three-api";
import {
  AGENT_THREE_DNS_INCOMPLETE_MESSAGE,
  validateAgentThreeCampaignLeads,
} from "@/lib/agent-three-auto-validation";
import {
  isAgentThreeConfirmedDelivery,
  recoverNotConfiguredCampaignLeadStatuses,
} from "@/lib/agent-three-campaign-load";
import { localEmailValidationProvider } from "@/lib/client-email-validation";
import {
  getSharedLeadBatchId,
  stampLeadsWithBatchId,
} from "@/lib/lead-batch";
import {
  buildOneClickCampaignName,
  buildOneClickReport,
  clampOneClickInterval,
  clampOneClickQuantity,
  countLeadsWithEmail,
  countLeadsWithWebsite,
  createEmptyOneClickProgress,
  dedupeLeadsByEmail,
  estimateRemainingMs,
  ONE_CLICK_CHECKPOINT_KEY,
  ONE_CLICK_STAGE_LABELS,
  parseOneClickCheckpoint,
  selectOneClickEligibleLeads,
  serializeOneClickCheckpoint,
  type OneClickCheckpoint,
  type OneClickConfig,
  type OneClickControl,
  type OneClickProgress,
  type OneClickReport,
  type OneClickStage,
} from "@/lib/one-click-outreach";
import {
  DEFAULT_FOLLOW_UP,
  DEFAULT_UNSUBSCRIBE_LINK,
} from "@/types/campaign";
import { useAgentThreeStore } from "@/store/agent-three-store";
import { useBatchPipelineStore } from "@/store/batch-pipeline-store";
import { useCampaignStore } from "@/store/campaign-store";
import { useLeadStore } from "@/store/lead-store";
import type { Campaign } from "@/types/campaign";
import type { CampaignProfileId } from "@/types/campaign-profile";
import type { Lead } from "@/types/lead";
import type { GlobalDeduplicationPreview } from "@/lib/global-email-deduplication";
import { useAgentThreeRunner } from "@/hooks/use-agent-three-runner";
import { getAgentThreeMetrics } from "@/lib/agent-three-queue";
import { isCampaignFullyDelivered } from "@/lib/campaign-completion";
import type { EmailTemplate } from "@/lib/email-template-library";
import { useEmailTemplateStore } from "@/store/email-template-store";
import {
  ensureOperationSignaturesHydrated,
  useOperationSignatureStore,
} from "@/store/operation-signature-store";
import { getOperationSendAccount } from "@/lib/operation-identity";
import {
  bindSignatureToOperation,
  getOperationSignatureMismatch,
  removeLegacyEmbeddedOneClickSignatures,
} from "@/lib/operation-signature";

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Interrompido", "AbortError"));
      return;
    }
    const timeout = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Interrompido", "AbortError"));
      },
      { once: true }
    );
  });
}

function readCheckpoint(): OneClickCheckpoint | null {
  if (typeof window === "undefined") return null;
  try {
    return parseOneClickCheckpoint(
      window.sessionStorage.getItem(ONE_CLICK_CHECKPOINT_KEY)
    );
  } catch {
    return null;
  }
}

function writeCheckpoint(checkpoint: OneClickCheckpoint | null) {
  if (typeof window === "undefined") return;
  try {
    if (!checkpoint) {
      window.sessionStorage.removeItem(ONE_CLICK_CHECKPOINT_KEY);
      return;
    }
    window.sessionStorage.setItem(
      ONE_CLICK_CHECKPOINT_KEY,
      serializeOneClickCheckpoint(checkpoint)
    );
  } catch {
    // ignore quota errors
  }
}

function resolveTemplate(
  config: OneClickConfig,
  templates: EmailTemplate[]
): {
  name: string;
  subject: string;
  body: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  unsubscribeLink: string;
  contactKind: EmailTemplate["contactKind"];
} | null {
  const template = templates.find(
    (item) =>
      item.id === config.templateId && item.operation === config.operation
  );
  if (!template) return null;
  const account = getOperationSendAccount(config.operation);
  const preparedBody = removeLegacyEmbeddedOneClickSignatures(template.body);
  return {
    name: template.name,
    subject: template.subject,
    body: preparedBody.body,
    fromName: account.fromName,
    fromEmail: account.fromEmail,
    replyTo: account.replyTo,
    unsubscribeLink: DEFAULT_UNSUBSCRIBE_LINK,
    contactKind: template.contactKind,
  };
}

function collectFailures(campaign: Campaign | null): OneClickReport["failures"] {
  if (!campaign) return [];
  const fromStatuses = campaign.leadStatuses
    .filter((s) => s.status === "failed" && s.errorMessage)
    .map((s) => ({
      email: "",
      company: s.leadId,
      reason: s.errorMessage ?? "Falha",
    }));
  const fromErrors = (campaign.sendErrors ?? []).map((e) => ({
    email: e.email,
    company: e.company,
    reason: e.errorMessage,
  }));
  return [...fromErrors, ...fromStatuses].slice(0, 50);
}

export function useOneClickOutreach() {
  const agentThree = useAgentThreeRunner();
  const [progress, setProgress] = useState<OneClickProgress>(
    createEmptyOneClickProgress
  );
  const [report, setReport] = useState<OneClickReport | null>(null);
  const [checkpoint, setCheckpoint] = useState<OneClickCheckpoint | null>(() =>
    readCheckpoint()
  );
  const [deduplicationPreview, setDeduplicationPreview] =
    useState<GlobalDeduplicationPreview | null>(null);

  const controlRef = useRef<OneClickControl>("stopped");
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const startedAtRef = useRef<number>(0);
  const configRef = useRef<OneClickConfig | null>(null);
  const reviewResolverRef = useRef<((approved: boolean) => void) | null>(null);

  const patchProgress = useCallback((patch: Partial<OneClickProgress>) => {
    setProgress((prev) => {
      const next: OneClickProgress = {
        ...prev,
        ...patch,
        stageLabel:
          patch.stageLabel ??
          (patch.stage ? ONE_CLICK_STAGE_LABELS[patch.stage] : prev.stageLabel),
        elapsedMs: startedAtRef.current
          ? Date.now() - startedAtRef.current
          : prev.elapsedMs,
      };
      if (
        next.totalRecipients > 0 &&
        configRef.current &&
        (patch.sentCount !== undefined ||
          patch.failedCount !== undefined ||
          patch.totalRecipients !== undefined)
      ) {
        next.estimatedRemainingMs = estimateRemainingMs({
          sentCount: next.sentCount,
          failedCount: next.failedCount,
          totalRecipients: next.totalRecipients,
          elapsedMs: next.elapsedMs,
          minIntervalSeconds: configRef.current.minIntervalSeconds,
          maxIntervalSeconds: configRef.current.maxIntervalSeconds,
        });
        next.remainingCount = Math.max(
          0,
          next.totalRecipients - next.sentCount - next.failedCount
        );
      }
      return next;
    });
  }, []);

  const assertRunning = useCallback(async () => {
    while (controlRef.current === "paused") {
      await delay(200, abortRef.current?.signal);
    }
    if (controlRef.current === "stopped") {
      throw new DOMException("Parado pelo usuário", "AbortError");
    }
    if (abortRef.current?.signal.aborted) {
      throw new DOMException("Interrompido", "AbortError");
    }
  }, []);

  const saveCheckpointState = useCallback(
    (partial: Partial<OneClickCheckpoint> & { config: OneClickConfig }) => {
      const prev = readCheckpoint();
      const next: OneClickCheckpoint = {
        version: 1,
        config: partial.config,
        batchId: partial.batchId ?? prev?.batchId ?? "",
        campaignId:
          partial.campaignId !== undefined
            ? partial.campaignId
            : (prev?.campaignId ?? null),
        stage: partial.stage ?? prev?.stage ?? "config",
        leadIds: partial.leadIds ?? prev?.leadIds ?? [],
        eligibleLeadIds: partial.eligibleLeadIds ?? prev?.eligibleLeadIds ?? [],
        duplicatesRemoved:
          partial.duplicatesRemoved ?? prev?.duplicatesRemoved ?? 0,
        foundCount: partial.foundCount ?? prev?.foundCount ?? 0,
        withWebsiteCount:
          partial.withWebsiteCount ?? prev?.withWebsiteCount ?? 0,
        withEmailCount: partial.withEmailCount ?? prev?.withEmailCount ?? 0,
        withoutEmailCount:
          partial.withoutEmailCount ?? prev?.withoutEmailCount ?? 0,
        startedAt: partial.startedAt ?? prev?.startedAt ?? new Date().toISOString(),
        control: partial.control ?? controlRef.current,
        stopReason:
          partial.stopReason !== undefined
            ? partial.stopReason
            : (prev?.stopReason ?? null),
      };
      writeCheckpoint(next);
      setCheckpoint(next);
      return next;
    },
    []
  );

  const finalize = useCallback(
    (
      config: OneClickConfig,
      stage: OneClickStage,
      extras: Partial<OneClickProgress> = {}
    ) => {
      setProgress((prev) => {
        const next: OneClickProgress = {
          ...prev,
          ...extras,
          stage,
          stageLabel: ONE_CLICK_STAGE_LABELS[stage],
          control: stage === "paused" ? "paused" : "stopped",
          elapsedMs: startedAtRef.current
            ? Date.now() - startedAtRef.current
            : prev.elapsedMs,
        };
        const campaign = next.campaignId
          ? (useCampaignStore.getState().getCampaign(next.campaignId) ?? null)
          : null;
        const template = useEmailTemplateStore
          .getState()
          .templates.find(
            (item) =>
              item.id === config.templateId &&
              item.operation === config.operation
          );
        const built = buildOneClickReport({
          config,
          progress: next,
          failures: collectFailures(campaign),
          template: template
            ? {
                name: template.name,
                subject: campaign?.subject ?? template.subject,
                body: campaign?.body ?? template.body,
              }
            : campaign
              ? {
                  name: "Modelo da campanha",
                  subject: campaign.subject,
                  body: campaign.body,
                }
              : undefined,
        });
        setReport(built);
        return next;
      });
    },
    []
  );

  const waitForAgentThreeIdle = useCallback(
    async (profileId: CampaignProfileId, runId: number) => {
      while (runIdRef.current === runId) {
        await assertRunning();
        const operation = useAgentThreeStore.getState().operations[profileId];
        const metrics = getAgentThreeMetrics(operation);
        const campaign = operation.currentCampaignId
          ? useCampaignStore.getState().getCampaign(operation.currentCampaignId)
          : null;

        const sentCount = campaign
          ? campaign.leadStatuses.filter(isAgentThreeConfirmedDelivery).length
          : metrics.sent;
        const failedCount = campaign?.failedCount ?? metrics.failed;

        patchProgress({
          stage: "sending",
          sentCount,
          failedCount,
          totalRecipients: campaign?.leadIds.length ?? metrics.total,
          currentCompany:
            operation.queue.find((q) => q.id === operation.currentItemId)
              ?.companyName ?? null,
          stopReason: operation.stopReason,
        });

        if (operation.status === "completed") {
          return { ok: true as const, stopReason: null };
        }
        if (operation.status === "paused" || operation.status === "stopped") {
          return {
            ok: false as const,
            stopReason:
              operation.stopReason ||
              operation.errorMessage ||
              (operation.status === "stopped"
                ? "Execução interrompida."
                : "Envio pausado."),
          };
        }
        if (operation.status === "error") {
          return {
            ok: false as const,
            stopReason: operation.errorMessage || "Erro no Agente 3.",
          };
        }
        if (
          operation.status === "idle" &&
          metrics.ready === 0 &&
          metrics.sent + metrics.failed + metrics.blocked + metrics.skipped >=
            metrics.total &&
          metrics.total > 0
        ) {
          return { ok: true as const, stopReason: null };
        }
        await delay(400, abortRef.current?.signal);
      }
      return { ok: false as const, stopReason: "Execução substituída." };
    },
    [assertRunning, patchProgress]
  );

  const runPipeline = useCallback(
    async (
      configInput: OneClickConfig,
      options: { resumeFromCheckpoint?: boolean } = {}
    ) => {
      const intervals = clampOneClickInterval(
        configInput.minIntervalSeconds,
        configInput.maxIntervalSeconds
      );
      const config: OneClickConfig = {
        ...configInput,
        sector: configInput.sector.trim(),
        location: configInput.location.trim(),
        quantity: clampOneClickQuantity(configInput.quantity),
        ...intervals,
      };
      configRef.current = config;

      const runId = ++runIdRef.current;
      controlRef.current = "running";
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      startedAtRef.current = Date.now();
      setReport(null);

      const existing = options.resumeFromCheckpoint ? readCheckpoint() : null;
      if (!options.resumeFromCheckpoint) {
        writeCheckpoint(null);
        setCheckpoint(null);
        setDeduplicationPreview(null);
      }
      const resumeSendOnly =
        Boolean(existing?.campaignId) &&
        existing?.batchId &&
        (existing.stage === "sending" ||
          existing.stage === "smtp_preflight" ||
          existing.stage === "paused" ||
          existing.stage === "interrupted");

      patchProgress({
        ...createEmptyOneClickProgress(),
        stage: resumeSendOnly ? "smtp_preflight" : "searching",
        control: "running",
        batchId: existing?.batchId ?? null,
        campaignId: existing?.campaignId ?? null,
        foundCount: existing?.foundCount ?? 0,
        withWebsiteCount: existing?.withWebsiteCount ?? 0,
        withEmailCount: existing?.withEmailCount ?? 0,
        eligibleCount: existing?.eligibleLeadIds.length ?? 0,
        duplicatesRemoved: existing?.duplicatesRemoved ?? 0,
        withoutEmailCount: existing?.withoutEmailCount ?? 0,
      });

      try {
        // Fail closed before search/credits: sending identity must be loaded
        // from the durable IndexedDB source of truth first.
        await ensureOperationSignaturesHydrated();
        let batchId = existing?.batchId ?? "";
        let campaignId = existing?.campaignId ?? null;
        let eligibleLeads: Lead[] = [];
        let duplicatesRemoved = existing?.duplicatesRemoved ?? 0;
        let foundCount = existing?.foundCount ?? 0;
        let withWebsiteCount = existing?.withWebsiteCount ?? 0;
        let withEmailCount = existing?.withEmailCount ?? 0;
        let withoutEmailCount = existing?.withoutEmailCount ?? 0;

        if (!resumeSendOnly) {
          await assertRunning();
          patchProgress({ stage: "searching", currentCompany: null });

          // 1) Search companies. The shared search service creates the batch
          // only after a live provider has returned real companies.
          await useLeadStore.getState().performBulkSearch(
            config.sector,
            config.location,
            {
              allowArtificialResults: false,
              autoSaveResults: false,
              requireLiveResults: true,
              maxResultsOverride: config.quantity,
            }
          );
          await assertRunning();

          let leads = useLeadStore
            .getState()
            .currentLeads.slice(0, config.quantity);

          batchId = getSharedLeadBatchId(leads) ?? "";
          if (!batchId) {
            throw new Error("Busca real indisponível — nenhum envio iniciado.");
          }
          useBatchPipelineStore.getState().setActiveBatch(batchId);

          saveCheckpointState({
            config,
            batchId,
            campaignId: null,
            stage: "searching",
            leadIds: leads.map((lead) => lead.id),
            eligibleLeadIds: [],
            startedAt: new Date().toISOString(),
            control: "running",
          });

          // 2) Stamp + isolate batch
          leads = stampLeadsWithBatchId(leads, batchId);
          foundCount = leads.length;
          withWebsiteCount = countLeadsWithWebsite(leads);

          // Save only this batch's results
          for (const lead of leads) {
            useLeadStore.getState().saveLead(lead);
          }
          useLeadStore.setState({ currentLeads: leads });
          useBatchPipelineStore.getState().updateBatchStage(batchId, "garimpo");

          patchProgress({
            stage: "enriching",
            batchId,
            foundCount,
            withWebsiteCount,
            withEmailCount: countLeadsWithEmail(leads),
          });

          saveCheckpointState({
            config,
            batchId,
            stage: "enriching",
            leadIds: leads.map((l) => l.id),
            foundCount,
            withWebsiteCount,
            withEmailCount: countLeadsWithEmail(leads),
            control: "running",
          });

          // 4) Enrich websites / emails
          if (leads.length > 0) {
            try {
              await requestAgentOneEmailEnrichment(leads, {
                onBatch: (updates) => {
                  useLeadStore.getState().applyAgentOneContactUpdates(updates);
                  const refreshed = useLeadStore
                    .getState()
                    .currentLeads.filter((l) => l.batchId === batchId);
                  patchProgress({
                    withEmailCount: countLeadsWithEmail(refreshed),
                    currentCompany: refreshed[0]?.company ?? null,
                  });
                },
                onProgress: (p) => {
                  patchProgress({
                    currentCompany: `Enriquecendo ${p.processedCount}/${p.totalCount}`,
                  });
                },
              });
            } catch {
              toast.error("Enriquecimento parcial — seguindo com o que foi obtido.");
            }
          }
          await assertRunning();

          leads = useLeadStore
            .getState()
            .currentLeads.filter((l) => l.batchId === batchId);
          // Also pull from saved if enrichment wrote there
          const savedInBatch = useLeadStore
            .getState()
            .savedLeads.filter((l) => l.batchId === batchId);
          const byId = new Map<string, Lead>();
          for (const lead of [...leads, ...savedInBatch]) {
            byId.set(lead.id, lead);
          }
          leads = [...byId.values()];

          // 5) Deduplicate
          const deduped = dedupeLeadsByEmail(leads);
          duplicatesRemoved = deduped.duplicatesRemoved;
          // Keep every batch contact until the central mandatory preview so it
          // can identify each excluded duplicate and show its precise reason.
          withEmailCount = countLeadsWithEmail(leads);
          withoutEmailCount = leads.length - withEmailCount;
          withWebsiteCount = countLeadsWithWebsite(leads);

          patchProgress({
            stage: "validating",
            duplicatesRemoved,
            withEmailCount,
            withoutEmailCount,
            withWebsiteCount,
          });
          useBatchPipelineStore.getState().updateBatchStage(batchId, "validation");

          // 6) Validate syntax, domain, MX
          const validation = await validateAgentThreeCampaignLeads(
            leads,
            (email) => localEmailValidationProvider.validate(email)
          );
          leads = validation.leads;
          for (const update of validation.updates) {
            useLeadStore
              .getState()
              .updateLeadEmailValidation(update.leadId, update.validation);
          }
          await assertRunning();

          if (validation.dnsErrorCount > 0 && leads.every((l) => !l.email)) {
            throw new Error(AGENT_THREE_DNS_INCOMPLETE_MESSAGE);
          }

          // 7) Eligible = valid + unknown mailbox
          eligibleLeads = selectOneClickEligibleLeads(leads);
          for (const lead of leads) {
            useLeadStore.getState().saveLead(lead);
          }

          patchProgress({
            stage: "creating_campaign",
            eligibleCount: eligibleLeads.length,
            withEmailCount: countLeadsWithEmail(leads),
            withoutEmailCount: leads.length - countLeadsWithEmail(leads),
          });

          if (eligibleLeads.length === 0) {
            finalize(config, "interrupted", {
              batchId,
              eligibleCount: 0,
              stopReason: "Nenhum e-mail elegível após validação.",
              interruptedStage: "validating",
              foundCount,
              withWebsiteCount,
              withEmailCount,
              duplicatesRemoved,
              withoutEmailCount,
            });
            saveCheckpointState({
              config,
              batchId,
              stage: "interrupted",
              leadIds: leads.map((l) => l.id),
              eligibleLeadIds: [],
              stopReason: "Nenhum e-mail elegível após validação.",
              control: "stopped",
              foundCount,
              withWebsiteCount,
              withEmailCount,
              withoutEmailCount,
              duplicatesRemoved,
            });
            toast.error("Nenhum e-mail elegível para envio.");
            return;
          }

          // 8–9) Create campaign with operation, template, reply-to
          const template = resolveTemplate(
            config,
            useEmailTemplateStore.getState().templates
          );
          if (!template) {
            throw new Error("Template de e-mail inválido.");
          }

          const campaign = useCampaignStore.getState().createCampaign({
            campaignProfileId: config.operation,
            emailTemplateId: config.templateId,
            contactKind: template.contactKind,
            name: buildOneClickCampaignName(config.sector, config.location),
            subject: template.subject,
            body: template.body,
            leadIds: eligibleLeads.map((l) => l.id),
            leadSource: "recent",
            batchId,
            fromName: template.fromName,
            fromEmail: template.fromEmail,
            replyTo: template.replyTo,
            unsubscribeLink: template.unsubscribeLink,
            followUp: { ...DEFAULT_FOLLOW_UP },
            signature: bindSignatureToOperation(
              config.operation,
              useOperationSignatureStore
                .getState()
                .getSignature(config.operation)
            ),
          });
          campaignId = campaign.id;
          useBatchPipelineStore
            .getState()
            .attachCampaign(batchId, campaign.id);
          useBatchPipelineStore.getState().updateBatchStage(batchId, "campaign");
          useBatchPipelineStore.getState().updateBatchStage(batchId, "send");

          saveCheckpointState({
            config,
            batchId,
            campaignId,
            stage: "smtp_preflight",
            leadIds: leads.map((l) => l.id),
            eligibleLeadIds: eligibleLeads.map((l) => l.id),
            foundCount,
            withWebsiteCount,
            withEmailCount,
            withoutEmailCount,
            duplicatesRemoved,
            control: "running",
          });

          patchProgress({
            stage: "smtp_preflight",
            campaignId,
            eligibleCount: eligibleLeads.length,
            totalRecipients: eligibleLeads.length,
            remainingCount: eligibleLeads.length,
          });
        } else {
          // Resume from checkpoint without re-searching
          batchId = existing!.batchId;
          campaignId = existing!.campaignId;
          foundCount = existing!.foundCount;
          withWebsiteCount = existing!.withWebsiteCount;
          withEmailCount = existing!.withEmailCount;
          withoutEmailCount = existing!.withoutEmailCount;
          duplicatesRemoved = existing!.duplicatesRemoved;
          useBatchPipelineStore.getState().setActiveBatch(batchId);

          const allLeads = [
            ...useLeadStore.getState().savedLeads,
            ...useLeadStore.getState().currentLeads,
          ];
          const byId = new Map(allLeads.map((l) => [l.id, l]));
          eligibleLeads = (existing!.eligibleLeadIds
            .map((id) => byId.get(id))
            .filter(Boolean) as Lead[]);

          if (eligibleLeads.length === 0 && campaignId) {
            const camp = useCampaignStore.getState().getCampaign(campaignId);
            if (camp) {
              eligibleLeads = camp.leadIds
                .map((id) => byId.get(id))
                .filter(Boolean) as Lead[];
            }
          }

          patchProgress({
            stage: "smtp_preflight",
            batchId,
            campaignId,
            foundCount,
            withWebsiteCount,
            withEmailCount,
            withoutEmailCount,
            duplicatesRemoved,
            eligibleCount: eligibleLeads.length,
            totalRecipients: eligibleLeads.length,
          });
        }

        if (!campaignId) {
          throw new Error("Campanha não encontrada para envio.");
        }

        // Rebind on every run, including checkpoint resume, so a One-Click
        // campaign always uses the latest official signature for its SMTP op.
        const campaignForIdentity = useCampaignStore
          .getState()
          .getCampaign(campaignId);
        if (!campaignForIdentity) {
          throw new Error("Campanha não encontrada para validar a identidade.");
        }
        if (campaignForIdentity.campaignProfileId !== config.operation) {
          throw new Error(
            "Configuração bloqueada: a campanha não pertence à operação SMTP selecionada."
          );
        }
        const operationAccount = getOperationSendAccount(config.operation);
        const officialSignature = bindSignatureToOperation(
          config.operation,
          useOperationSignatureStore.getState().getSignature(config.operation)
        );
        const signatureMismatch = getOperationSignatureMismatch(
          config.operation,
          officialSignature,
          { requireOperationId: true }
        );
        if (signatureMismatch) throw new Error(signatureMismatch);
        const preparedCampaignBody = removeLegacyEmbeddedOneClickSignatures(
          campaignForIdentity.body
        ).body;
        useCampaignStore.getState().updateCampaign(campaignId, {
          body: preparedCampaignBody,
          fromName: operationAccount.fromName,
          fromEmail: operationAccount.fromEmail,
          replyTo: operationAccount.replyTo,
          signature: officialSignature,
        });

        // Recover recoverable config failures so Agent 3 can retry
        const campaignBefore = useCampaignStore.getState().getCampaign(campaignId);
        if (campaignBefore) {
          const recovered =
            recoverNotConfiguredCampaignLeadStatuses(campaignBefore);
          if (recovered.changed) {
            useCampaignStore.getState().updateCampaign(campaignId, {
              leadStatuses: recovered.leadStatuses,
              failedCount: recovered.failedCount,
              sentCount: recovered.sentCount,
              sendErrors: recovered.sendErrors,
            });
          }
        }

        // Configure Agent 3 (only authorized sender)
        const profileId = config.operation;
        useAgentThreeStore.getState().selectProfile(profileId);
        useAgentThreeStore.getState().selectCampaign(profileId, campaignId);
        useAgentThreeStore
          .getState()
          .configureIntervals(
            profileId,
            config.minIntervalSeconds,
            config.maxIntervalSeconds
          );
        useAgentThreeStore
          .getState()
          .configureLimit(profileId, Math.max(eligibleLeads.length, 1), true);

        // Load + prepare
        const preparation = await agentThree.loadCampaign(profileId, campaignId);
        await assertRunning();

        if (!preparation.deduplicationPreview) {
          throw new Error("Não foi possível gerar a prévia global obrigatória.");
        }
        const mandatoryPreview: GlobalDeduplicationPreview = {
          ...preparation.deduplicationPreview,
          companiesFound: foundCount,
          contactsWithEmail: withEmailCount,
        };
        setDeduplicationPreview(mandatoryPreview);
        patchProgress({
          stage: "review",
          eligibleCount: mandatoryPreview.finalSendCount,
          totalRecipients: mandatoryPreview.finalSendCount,
          remainingCount: mandatoryPreview.finalSendCount,
        });
        saveCheckpointState({
          config,
          batchId,
          campaignId,
          stage: "review",
          control: "running",
          eligibleLeadIds: eligibleLeads.map((lead) => lead.id),
          leadIds: existing?.leadIds ?? eligibleLeads.map((lead) => lead.id),
          foundCount,
          withWebsiteCount,
          withEmailCount,
          withoutEmailCount,
          duplicatesRemoved,
        });
        const reviewApproved = await new Promise<boolean>((resolve) => {
          reviewResolverRef.current = resolve;
        });
        reviewResolverRef.current = null;
        if (!reviewApproved) {
          throw new DOMException("Prévia não confirmada.", "AbortError");
        }
        await assertRunning();

        // 10) SMTP preflight with live verify — before any send
        patchProgress({ stage: "smtp_preflight" });
        const availability = await checkAgentThreeSmtpAvailability(profileId, {
          verify: true,
        });
        if (availability.status !== "connected") {
          const reason =
            availability.message ||
            "SMTP indisponível ou mal configurado. Nenhum e-mail foi enviado.";
          finalize(config, "interrupted", {
            batchId,
            campaignId,
            stopReason: reason,
            interruptedStage: "smtp_preflight",
            foundCount,
            withWebsiteCount,
            withEmailCount,
            withoutEmailCount,
            duplicatesRemoved,
            eligibleCount: eligibleLeads.length,
            sentCount: 0,
            failedCount: 0,
          });
          saveCheckpointState({
            config,
            batchId,
            campaignId,
            stage: "interrupted",
            stopReason: reason,
            control: "stopped",
            eligibleLeadIds: eligibleLeads.map((l) => l.id),
            leadIds: existing?.leadIds ?? eligibleLeads.map((l) => l.id),
            foundCount,
            withWebsiteCount,
            withEmailCount,
            withoutEmailCount,
            duplicatesRemoved,
          });
          toast.error(reason);
          return;
        }

        // Skip start if campaign already fully delivered
        const freshCampaign = useCampaignStore.getState().getCampaign(campaignId);
        if (freshCampaign && isCampaignFullyDelivered(freshCampaign)) {
          useCampaignStore.getState().setCampaignStatus(campaignId, "completed");
          useBatchPipelineStore.getState().updateBatchStage(batchId, "complete");
          finalize(config, "completed", {
            batchId,
            campaignId,
            sentCount: freshCampaign.sentCount,
            foundCount,
            withWebsiteCount,
            withEmailCount,
            withoutEmailCount,
            duplicatesRemoved,
            eligibleCount: eligibleLeads.length,
            totalRecipients: freshCampaign.leadIds.length,
            remainingCount: 0,
          });
          writeCheckpoint(null);
          setCheckpoint(null);
          toast.success("Campanha já estava concluída — nenhum reenvio.");
          return;
        }

        // 11) Send via Agent 3 only
        patchProgress({ stage: "sending" });
        saveCheckpointState({
          config,
          batchId,
          campaignId,
          stage: "sending",
          control: "running",
          eligibleLeadIds: eligibleLeads.map((l) => l.id),
          leadIds: existing?.leadIds ?? eligibleLeads.map((l) => l.id),
          foundCount,
          withWebsiteCount,
          withEmailCount,
          withoutEmailCount,
          duplicatesRemoved,
        });

        const startResult = await agentThree.start(profileId);
        if (!startResult.started) {
          const reason =
            startResult.message ||
            "Não foi possível iniciar o Agente 3.";
          finalize(config, "interrupted", {
            batchId,
            campaignId,
            stopReason: reason,
            interruptedStage: "sending",
            foundCount,
            withWebsiteCount,
            withEmailCount,
            withoutEmailCount,
            duplicatesRemoved,
            eligibleCount: eligibleLeads.length,
          });
          saveCheckpointState({
            config,
            batchId,
            campaignId,
            stage: "interrupted",
            stopReason: reason,
            control: "stopped",
            eligibleLeadIds: eligibleLeads.map((l) => l.id),
            foundCount,
            withWebsiteCount,
            withEmailCount,
            withoutEmailCount,
            duplicatesRemoved,
          });
          toast.error(reason);
          return;
        }

        const waitResult = await waitForAgentThreeIdle(profileId, runId);
        if (runIdRef.current !== runId) return;

        const finalCampaign =
          useCampaignStore.getState().getCampaign(campaignId) ?? null;
        const sentCount = finalCampaign
          ? finalCampaign.leadStatuses.filter(isAgentThreeConfirmedDelivery)
              .length
          : 0;
        const failedCount = finalCampaign?.failedCount ?? 0;
        const operation = useAgentThreeStore.getState().operations[profileId];

        if (!waitResult.ok || operation.stopReason) {
          const reason =
            operation.stopReason ||
            waitResult.stopReason ||
            "Envio interrompido.";
          useCampaignStore.getState().setCampaignStatus(campaignId, "paused");
          finalize(config, "interrupted", {
            batchId,
            campaignId,
            stopReason: reason,
            interruptedStage: "sending",
            sentCount,
            failedCount,
            foundCount,
            withWebsiteCount,
            withEmailCount,
            withoutEmailCount,
            duplicatesRemoved,
            eligibleCount: eligibleLeads.length,
            totalRecipients: finalCampaign?.leadIds.length ?? eligibleLeads.length,
          });
          saveCheckpointState({
            config,
            batchId,
            campaignId,
            stage: "interrupted",
            stopReason: reason,
            control: "stopped",
            eligibleLeadIds: eligibleLeads.map((l) => l.id),
            foundCount,
            withWebsiteCount,
            withEmailCount,
            withoutEmailCount,
            duplicatesRemoved,
          });
          toast.error(reason);
          return;
        }

        // 12) Mark completed
        useCampaignStore.getState().setCampaignStatus(campaignId, "completed");
        useBatchPipelineStore.getState().updateBatchStage(batchId, "complete");

        finalize(config, "completed", {
          batchId,
          campaignId,
          sentCount,
          failedCount,
          foundCount,
          withWebsiteCount,
          withEmailCount,
          withoutEmailCount,
          duplicatesRemoved,
          eligibleCount: eligibleLeads.length,
          totalRecipients: finalCampaign?.leadIds.length ?? eligibleLeads.length,
          remainingCount: 0,
        });
        writeCheckpoint(null);
        setCheckpoint(null);
        toast.success("Campanha concluída!", { icon: "🚀" });
      } catch (error) {
        if (runIdRef.current !== runId) return;
        const aborted =
          error instanceof DOMException && error.name === "AbortError";
        // pause/stop mutate this ref outside the async frame; avoid TS narrowing.
        const controlSnapshot = controlRef.current as OneClickControl;
        const message = aborted
          ? controlSnapshot === "paused"
            ? "Execução pausada."
            : "Execução interrompida."
          : error instanceof Error
            ? error.message
            : "Erro no fluxo One-Click.";

        if (controlSnapshot === "paused") {
          finalize(config, "paused", {
            stopReason: message,
            interruptedStage: progress.stage,
          });
          return;
        }

        finalize(config, "interrupted", {
          stopReason: message,
          interruptedStage:
            progress.stage === "config" ? "searching" : progress.stage,
        });
        if (!aborted) toast.error(message);
      }
    },
    [
      agentThree,
      assertRunning,
      finalize,
      patchProgress,
      progress.stage,
      saveCheckpointState,
      waitForAgentThreeIdle,
    ]
  );

  const start = useCallback(
    (config: OneClickConfig) => runPipeline(config, { resumeFromCheckpoint: false }),
    [runPipeline]
  );

  const resume = useCallback(() => {
    const cp = readCheckpoint();
    if (!cp) {
      toast.error("Nenhum checkpoint para retomar.");
      return;
    }
    if (!cp.campaignId && cp.foundCount === 0) {
      writeCheckpoint(null);
      setCheckpoint(null);
      toast.error(
        "Lote vazio anterior descartado. Inicie uma nova busca real."
      );
      return;
    }
    void runPipeline(cp.config, { resumeFromCheckpoint: true });
  }, [runPipeline]);

  const pause = useCallback(() => {
    controlRef.current = "paused";
    const profileId = configRef.current?.operation;
    if (profileId) agentThree.pause(profileId);
    patchProgress({ stage: "paused", control: "paused" });
    const cp = readCheckpoint();
    if (cp) {
      saveCheckpointState({ ...cp, control: "paused", stage: "paused" });
    }
    toast("Envio pausado.", { icon: "⏸" });
  }, [agentThree, patchProgress, saveCheckpointState]);

  const stop = useCallback(() => {
    reviewResolverRef.current?.(false);
    reviewResolverRef.current = null;
    controlRef.current = "stopped";
    abortRef.current?.abort();
    const profileId = configRef.current?.operation;
    if (profileId) agentThree.stop(profileId);
    patchProgress({
      stage: "interrupted",
      control: "stopped",
      stopReason: "Parado pelo usuário.",
      interruptedStage: "sending",
    });
    const cp = readCheckpoint();
    if (cp) {
      saveCheckpointState({
        ...cp,
        control: "stopped",
        stage: "interrupted",
        stopReason: "Parado pelo usuário.",
      });
    }
    toast.error("Campanha interrompida.");
  }, [agentThree, patchProgress, saveCheckpointState]);

  const clearCheckpoint = useCallback(() => {
    writeCheckpoint(null);
    setCheckpoint(null);
    setReport(null);
    setDeduplicationPreview(null);
    setProgress(createEmptyOneClickProgress());
  }, []);

  const confirmDeduplicationPreview = useCallback(() => {
    if (!reviewResolverRef.current) return;
    reviewResolverRef.current(true);
    reviewResolverRef.current = null;
  }, []);

  return {
    progress,
    report,
    checkpoint,
    deduplicationPreview,
    start,
    pause,
    stop,
    resume,
    clearCheckpoint,
    confirmDeduplicationPreview,
    agentThree,
  };
}
