"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  MapPin,
  Megaphone,
  Sparkles,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardHeader,
} from "@/components/ui/collapsible-card";
import { hasValidEmail } from "@/lib/email-templates";
import { inferLeadSource } from "@/lib/campaign-leads";
import {
  DEFAULT_CAMPAIGN_SEND_CONFIG,
  DEFAULT_FOLLOW_UP,
  DEFAULT_BATCH_SEND_CONFIG,
  type CampaignAttachment,
  type CampaignBatchSendConfig,
  type CampaignFollowUp,
  type CampaignSignature,
} from "@/types/campaign";
import { FollowUpSettings } from "./follow-up-settings";
import { CampaignSignatureSettings } from "./campaign-signature-settings";
import { useLeadStore } from "@/store/lead-store";
import { useCampaignStore } from "@/store/campaign-store";
import { useSettingsStore } from "@/store/settings-store";
import { useOperationSignatureStore } from "@/store/operation-signature-store";
import { useAgentThreeStore } from "@/store/agent-three-store";
import { useEmailBlocklistStore } from "@/store/email-blocklist-store";
import { EmailPreviewPanel } from "./email-preview-panel";
import { LeadPicker } from "./lead-picker";
import { RichEmailEditor } from "./rich-email-editor";
import { SendConfigForm } from "./send-config-form";
import { ImportExternalLeads } from "./import-external-leads";
import { CampaignAttachmentField } from "./campaign-attachment";
import { BatchSendSettings } from "./batch-send-settings";
import { EmailProviderSettings } from "./email-provider-settings";
import { SmtpAutonomousSettings } from "./smtp-autonomous-settings";
import { GlobalDeduplicationPreviewPanel } from "./global-deduplication-preview";
import { buildReuseCampaignName } from "@/lib/campaign-reuse";
import {
  filterLeadsByMemberIds,
  getBatchEligibleLeads,
} from "@/lib/lead-batch";
import { DEFAULT_LOCATION_FILTER } from "@/lib/location-match";
import { LocationFilterControls } from "@/components/results/location-filter-controls";
import type { ImportBatchStats } from "@/lib/import-batch";
import {
  buildCampaignEligibilitySummary,
  eligibilityTopCards,
} from "@/lib/campaign-eligibility";
import {
  getOperationSendAccount,
} from "@/lib/operation-identity";
import { cn } from "@/lib/utils";
import { bindSignatureToOperation } from "@/lib/operation-signature";
import {
  CAMPAIGN_PROFILES,
  type CampaignProfileId,
} from "@/types/campaign-profile";
import { useBatchPipelineStore } from "@/store/batch-pipeline-store";
import {
  getDefaultEmailTemplate,
  getEmailTemplatesForOperation,
  getEmailTemplateSenderName,
  type EmailTemplate,
} from "@/lib/email-template-library";
import { useEmailTemplateStore } from "@/store/email-template-store";
import { SaveAsTemplateDialog } from "./save-as-template-dialog";
import type { Lead } from "@/types/lead";
import {
  LOCAL_DATA_UNAVAILABLE_MESSAGE,
  isLocalDataUnavailableError,
  prepareLocalDataWrite,
  useLocalDataAvailability,
} from "@/lib/local-data-client";

export function CreateCampaignForm({
  reuseFromId = null,
  batchId = null,
}: {
  reuseFromId?: string | null;
  batchId?: string | null;
}) {
  return (
    <CreateCampaignFormContent
      key={`${reuseFromId ?? "new"}:${batchId ?? "no-batch"}`}
      reuseFromId={reuseFromId}
      batchId={batchId}
    />
  );
}

function CreateCampaignFormContent({
  reuseFromId,
  batchId,
}: {
  reuseFromId: string | null;
  batchId: string | null;
}) {
  const router = useRouter();
  const localDataAvailability = useLocalDataAvailability();
  const localDataWriteBlocked = localDataAvailability === "unavailable";
  const {
    savedLeads,
    currentLeads,
    importedLeads,
    importExternalLeads,
    currentKeyword,
    currentLocation,
  } = useLeadStore(
    useShallow((s) => ({
      savedLeads: s.savedLeads,
      currentLeads: s.currentLeads,
      importedLeads: s.importedLeads,
      importExternalLeads: s.importExternalLeads,
      currentKeyword: s.currentKeyword,
      currentLocation: s.currentLocation,
    }))
  );
  const createCampaign = useCampaignStore((s) => s.createCampaign);
  const setCampaignStatus = useCampaignStore((s) => s.setCampaignStatus);
  const campaigns = useCampaignStore((s) => s.campaigns);
  const agentOperations = useAgentThreeStore((s) => s.operations);
  const blockedEntries = useEmailBlocklistStore((s) => s.entries);
  const getOpSignature = useOperationSignatureStore((s) => s.getSignature);
  const officialSignatures = useOperationSignatureStore((s) => s.signatures);
  const signaturesHydrated = useOperationSignatureStore(
    (s) => s.hasHydrated
  );
  const getCampaign = useCampaignStore((s) => s.getCampaign);
  const attachCampaign = useBatchPipelineStore((s) => s.attachCampaign);
  const setActiveBatch = useBatchPipelineStore((s) => s.setActiveBatch);
  const getBatch = useBatchPipelineStore((s) => s.getBatch);
  const emailProvider = useSettingsStore((s) => s.emailProvider);
  const setEmailProvider = useSettingsStore((s) => s.setEmailProvider);
  const reuseSource = reuseFromId ? getCampaign(reuseFromId) : undefined;
  const reuseLoaded = useRef<string | null>(null);
  const batchLoaded = useRef<string | null>(null);
  const reuseSourceName = reuseSource?.name ?? null;
  const batchMeta = batchId ? getBatch(batchId) : null;
  const emailTemplates = useEmailTemplateStore((state) => state.templates);

  const [name, setName] = useState(() =>
    reuseSource
      ? buildReuseCampaignName(reuseSource.name)
      : batchMeta
        ? `Campanha · ${batchMeta.sector}`
        : ""
  );
  const [campaignProfileId, setCampaignProfileId] =
    useState<CampaignProfileId>(
      reuseSource?.campaignProfileId ?? "panek-puglesi"
    );
  // New campaigns (manual or batch) start empty — user picks a template if wanted.
  const [subject, setSubject] = useState<string>(reuseSource?.subject ?? "");
  const [body, setBody] = useState<string>(reuseSource?.body ?? "");
  const [sendConfig, setSendConfig] = useState(() =>
    reuseSource
      ? {
          fromName: reuseSource.fromName,
          fromEmail: reuseSource.fromEmail,
          replyTo: reuseSource.replyTo,
          unsubscribeLink: reuseSource.unsubscribeLink,
        }
      : {
          ...DEFAULT_CAMPAIGN_SEND_CONFIG,
        }
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    reuseSource?.emailTemplateId ?? ""
  );
  const [followUp, setFollowUp] = useState<CampaignFollowUp>(() =>
    reuseSource ? { ...reuseSource.followUp } : { ...DEFAULT_FOLLOW_UP }
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState(DEFAULT_LOCATION_FILTER);
  const [previewLeadId, setPreviewLeadId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(() => Boolean(batchId));
  const [attachment, setAttachment] = useState<CampaignAttachment | null>(() =>
    reuseSource?.attachment ? { ...reuseSource.attachment } : null
  );
  const [signature, setSignature] = useState<CampaignSignature>(() => {
    if (reuseSource?.signature) {
      return bindSignatureToOperation(
        campaignProfileId,
        reuseSource.signature
      );
    }
    // Official per-operation signature (Gmail paste) — never legacy hardcoded.
    return bindSignatureToOperation(
      campaignProfileId,
      getOpSignature(campaignProfileId)
    );
  });
  /** Current upload only — never the global importedLeads pool. */
  const [importBatchLeads, setImportBatchLeads] = useState<Lead[]>([]);
  const [importBatchId, setImportBatchId] = useState<string | null>(null);
  const [importBatchStats, setImportBatchStats] =
    useState<ImportBatchStats | null>(null);
  const [batchSend, setBatchSend] = useState<CampaignBatchSendConfig>({
    ...(reuseSource?.batchSend ?? DEFAULT_BATCH_SEND_CONFIG),
  });
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const officialSignature = officialSignatures[campaignProfileId];
  const officialSignatureKey = `${campaignProfileId}:${officialSignature.enabled}:${officialSignature.body}`;
  const [signatureSourceKey, setSignatureSourceKey] = useState(
    officialSignatureKey
  );

  if (
    signaturesHydrated &&
    !formDirty &&
    !reuseSource &&
    signatureSourceKey !== officialSignatureKey
  ) {
    setSignatureSourceKey(officialSignatureKey);
    setSignature(
      bindSignatureToOperation(campaignProfileId, officialSignature)
    );
  }

  const allLeads = useMemo(() => {
    const map = new Map<string, Lead>();
    const memberIds = batchMeta?.leadIds ?? [];
    // Importados no seletor = SOMENTE o lote atual (importBatchLeads), não o pool global.
    const pool = batchId
      ? filterLeadsByMemberIds([...currentLeads, ...savedLeads], memberIds)
      : [...importBatchLeads, ...savedLeads, ...currentLeads];
    const scoped = batchId
      ? getBatchEligibleLeads(pool, {
          locationFilter,
          requestedLocation: batchMeta?.location,
        })
      : pool;
    for (const l of scoped) {
      if (hasValidEmail(l.email)) map.set(l.id, l);
    }
    return Array.from(map.values());
  }, [
    savedLeads,
    currentLeads,
    importBatchLeads,
    batchId,
    batchMeta?.leadIds,
    batchMeta?.location,
    locationFilter,
  ]);

  const selectedLeads = useMemo(
    () => allLeads.filter((l) => selectedIds.includes(l.id)),
    [allLeads, selectedIds]
  );

  /** Canonical eligibility — same numbers for cards, preview, and create. */
  const eligibility = useMemo(
    () =>
      buildCampaignEligibilitySummary({
        operation: campaignProfileId,
        campaignId: "new-campaign-draft",
        contactKind: "first_contact",
        members: selectedLeads,
        allKnownLeads: [...savedLeads, ...importedLeads, ...currentLeads],
        campaigns,
        operations: agentOperations,
        blockedEntries,
      }),
    [
      campaignProfileId,
      selectedLeads,
      savedLeads,
      importedLeads,
      currentLeads,
      campaigns,
      agentOperations,
      blockedEntries,
    ]
  );
  const topCards = eligibilityTopCards(eligibility);
  const operationTemplates = useMemo(
    () => getEmailTemplatesForOperation(emailTemplates, campaignProfileId),
    [emailTemplates, campaignProfileId]
  );

  useEffect(() => {
    if (!batchId || batchLoaded.current === batchId) return;
    batchLoaded.current = batchId;
    setActiveBatch(batchId);
    const approvedIds = allLeads.map((lead) => lead.id);
    const nextName =
      batchMeta && !name.trim() ? `Campanha · ${batchMeta.sector}` : null;
    // Defer local selection updates so this effect only syncs external batch store first.
    queueMicrotask(() => {
      setSelectedIds(approvedIds);
      if (approvedIds[0]) setPreviewLeadId(approvedIds[0]);
      if (nextName) setName(nextName);
    });
  }, [batchId, allLeads, setActiveBatch, batchMeta, name]);

  const previewLead =
    selectedLeads.find((l) => l.id === previewLeadId) ??
    selectedLeads[0] ??
    null;

  const recentSearchLabel =
    currentKeyword && currentLocation
      ? `${currentKeyword} · ${currentLocation}`
      : undefined;

  useEffect(() => {
    if (!reuseFromId || reuseLoaded.current === reuseFromId) return;
    if (!reuseSource) {
      toast.error("Campanha de origem não encontrada.");
      return;
    }

    reuseLoaded.current = reuseFromId;
    setEmailProvider(reuseSource.emailProvider);
    toast.success("Template carregado — selecione a nova lista de leads", {
      icon: "📋",
    });
  }, [reuseFromId, reuseSource, setEmailProvider]);

  const applyEmailTemplate = (template: EmailTemplate, notify = true) => {
    setSelectedTemplateId(template.id);
    setSubject(template.subject);
    setBody(template.body);
    setSendConfig((current) => ({
      ...current,
      fromName: getEmailTemplateSenderName(template.operation),
      fromEmail: template.sender,
      replyTo: template.replyTo,
    }));
    if (notify) toast.success(`Modelo "${template.name}" aplicado`);
  };

  const changeCampaignOperation = (value: CampaignProfileId) => {
    setCampaignProfileId(value);
    // Official signature switches immediately with operation.
    if (!reuseSource) {
      setSignature(bindSignatureToOperation(value, getOpSignature(value)));
      const account = getOperationSendAccount(value);
      setSendConfig((prev) => ({
        ...prev,
        fromName: account.fromName,
        fromEmail: account.fromEmail,
        replyTo: account.replyTo,
      }));
    }
    if (reuseSource || selectedTemplateId) {
      const defaultTemplate = getDefaultEmailTemplate(emailTemplates, value);
      if (defaultTemplate && selectedTemplateId) {
        applyEmailTemplate(defaultTemplate, false);
      }
    }
  };

  const handleImportBatch = (stats: ImportBatchStats) => {
    // Persist new emails in global history, but campaign membership = this batch only.
    importExternalLeads(stats.leads);
    setImportBatchLeads(stats.leads);
    setImportBatchId(stats.importBatchId);
    setImportBatchStats(stats);
    // Replace selection with this batch (do not accumulate old imports).
    setSelectedIds(stats.leadIds);
    if (stats.leadIds[0]) setPreviewLeadId(stats.leadIds[0]);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Dê um nome à campanha.");
      return;
    }
    if (!sendConfig.fromEmail.trim()) {
      toast.error("Informe o email de envio (De).");
      return;
    }
    if (selectedIds.length === 0) {
      toast.error("Selecione ou importe pelo menos um lead com email.");
      return;
    }

    try {
      const ready = await prepareLocalDataWrite();
      if (!ready) {
        toast.error(LOCAL_DATA_UNAVAILABLE_MESSAGE);
        return;
      }
    } catch (error) {
      if (isLocalDataUnavailableError(error)) {
        toast.error(LOCAL_DATA_UNAVAILABLE_MESSAGE);
        return;
      }
      throw error;
    }

    const selectedEmailTemplate = emailTemplates.find(
      (template) => template.id === selectedTemplateId
    );
    try {
      const campaign = createCampaign({
        campaignProfileId,
        emailTemplateId:
          selectedEmailTemplate?.id ?? reuseSource?.emailTemplateId,
        contactKind:
          selectedEmailTemplate?.contactKind ??
          reuseSource?.contactKind ??
          "first_contact",
        name: name.trim(),
        subject: subject.trim(),
        body: body.trim(),
        leadIds: selectedIds,
        leadSource: inferLeadSource(
          selectedIds,
          savedLeads,
          currentLeads,
          importedLeads
        ),
        batchId: batchId ?? undefined,
        fromName: sendConfig.fromName.trim(),
        fromEmail: sendConfig.fromEmail.trim(),
        replyTo: sendConfig.replyTo.trim(),
        unsubscribeLink: sendConfig.unsubscribeLink.trim(),
        followUp,
        attachment,
        signature,
        batchSend,
        emailProvider,
      });

      if (batchId) {
        attachCampaign(batchId, campaign.id);
      }
      // Explicit save → status Salva (persiste; limpar UI não apaga).
      setCampaignStatus(campaign.id, "saved");

      toast.success(`Campanha "${campaign.name}" salva!`, { icon: "📣" });
      router.push(`/campanhas/${campaign.id}`);
    } catch (error) {
      if (isLocalDataUnavailableError(error)) {
        toast.error(LOCAL_DATA_UNAVAILABLE_MESSAGE);
        return;
      }
      throw error;
    }
  };

  const eligibleCount = eligibility.eligibleFinal;
  const createLabel = batchId
    ? `Criar campanha com ${eligibleCount} elegíveis`
    : `Criar Campanha (${eligibleCount} elegíveis de ${selectedIds.length} selecionados)`;

  // ── Batch mode: compact layout only ─────────────────────────────────────
  if (batchId) {
    const sector = batchMeta?.sector ?? currentKeyword ?? "Lote";
    const location = batchMeta?.location ?? currentLocation ?? "—";

    return (
      <div
        className={cn(
          "grid gap-4",
          showPreview && "lg:grid-cols-[1fr_minmax(300px,380px)]"
        )}
      >
        <div className="space-y-3">
          {/* 1. Compact batch summary */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
            <span className="font-semibold text-foreground">{sector}</span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <MapPin className="size-3.5" />
              {location}
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-emerald-300">
              <Users className="size-3.5" />
              {eligibleCount} elegíveis
            </span>
          </div>

          {/* 2. Name */}
          <div className="space-y-1.5">
            <Label htmlFor="batch-campaign-name">Nome da campanha</Label>
            <Input
              id="batch-campaign-name"
              placeholder="Ex: Mortgage Adviser London"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 bg-background/50"
            />
          </div>

          {/* 3. Templates */}
          <div className="space-y-1.5">
            <Label>Modelo de e-mail</Label>
            <Select
              value={selectedTemplateId}
              onValueChange={(id) => {
                const template = operationTemplates.find((item) => item.id === id);
                if (template) {
                  applyEmailTemplate(template);
                  setFormDirty(true);
                }
              }}
            >
              <SelectTrigger className="h-9 bg-background/50">
                <SelectValue placeholder="Selecione um modelo (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {operationTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}{template.isDefault ? " · Padrão" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setTemplateDialogOpen(true)}
              >
                Salvar como modelo
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const result = useEmailTemplateStore.getState().saveAsTemplate({
                    name: name.trim() || "Modelo do lote",
                    operation: campaignProfileId,
                    subject,
                    body,
                    sender: sendConfig.fromEmail,
                    replyTo: sendConfig.replyTo,
                    setAsDefault: true,
                  });
                  if (result) toast.success("Definido como padrão.");
                  else toast.error("Preencha assunto e corpo antes.");
                }}
              >
                Definir como padrão
              </Button>
              {formDirty && (
                <Badge variant="warning" className="text-[10px]">
                  Alterações não salvas — use Criar campanha para persistir
                </Badge>
              )}
            </div>
          </div>

          <SaveAsTemplateDialog
            open={templateDialogOpen}
            onOpenChange={setTemplateDialogOpen}
            operation={campaignProfileId}
            subject={subject}
            body={body}
            sender={sendConfig.fromEmail}
            replyTo={sendConfig.replyTo}
          />

          {/* 4. Sender one line */}
          <div className="space-y-1.5">
            <Label>Remetente</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                aria-label="Nome"
                placeholder="Nome"
                value={sendConfig.fromName}
                onChange={(e) =>
                  setSendConfig((prev) => ({
                    ...prev,
                    fromName: e.target.value,
                  }))
                }
                className="h-9 bg-background/50"
              />
              <Input
                aria-label="E-mail"
                type="email"
                placeholder="E-mail"
                value={sendConfig.fromEmail}
                onChange={(e) =>
                  setSendConfig((prev) => ({
                    ...prev,
                    fromEmail: e.target.value,
                  }))
                }
                className="h-9 bg-background/50"
              />
              <Input
                aria-label="Reply-To"
                type="email"
                placeholder="Reply-To"
                value={sendConfig.replyTo}
                onChange={(e) =>
                  setSendConfig((prev) => ({
                    ...prev,
                    replyTo: e.target.value,
                  }))
                }
                className="h-9 bg-background/50"
              />
            </div>
          </div>

          {/* 5. Subject */}
          <div className="space-y-1.5">
            <Label htmlFor="batch-subject">Assunto</Label>
            <Input
              id="batch-subject"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setFormDirty(true);
              }}
              className="h-9 bg-background/50"
            />
          </div>

          {/* 6–7. Body + preview toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Corpo do e-mail</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPreview((v) => !v)}
                className="h-8"
              >
                {showPreview ? (
                  <>
                    <EyeOff className="size-3.5" />
                    Ocultar preview
                  </>
                ) : (
                  <>
                    <Eye className="size-3.5" />
                    Mostrar preview
                  </>
                )}
              </Button>
            </div>
            <RichEmailEditor
              value={body}
              onChange={setBody}
              layout="full"
              minHeight={360}
            />
          </div>

          {/* Advanced: unsubscribe + other options collapsed */}
          <CollapsibleCard
            storageKey="campaign-batch-advanced"
            defaultOpen={false}
          >
            <CollapsibleCardHeader className="py-3">
              <CardTitle className="text-sm font-medium">
                Configurações avançadas
              </CardTitle>
            </CollapsibleCardHeader>
            <CollapsibleCardContent className="space-y-4 pt-0">
              <div className="space-y-1.5">
                <Label htmlFor="batch-unsubscribe">Unsubscribe</Label>
                <Input
                  id="batch-unsubscribe"
                  value={sendConfig.unsubscribeLink}
                  onChange={(e) =>
                    setSendConfig((prev) => ({
                      ...prev,
                      unsubscribeLink: e.target.value,
                    }))
                  }
                  placeholder="https://...?email={{email}}"
                  className="h-9 bg-background/50 font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="batch-profile">Operação</Label>
                <Select
                  value={campaignProfileId}
                  onValueChange={(value: CampaignProfileId) =>
                    changeCampaignOperation(value)
                  }
                >
                  <SelectTrigger
                    id="batch-profile"
                    className="h-9 bg-background/50"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAMPAIGN_PROFILES.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <CampaignAttachmentField
                attachment={attachment}
                onChange={setAttachment}
              />
              <CampaignSignatureSettings
                signature={signature}
                onChange={(patch) =>
                  setSignature((prev) => ({ ...prev, ...patch }))
                }
              />
              <FollowUpSettings
                followUp={followUp}
                onChange={(patch) =>
                  setFollowUp((prev) => ({ ...prev, ...patch }))
                }
              />
              <BatchSendSettings
                config={batchSend}
                provider={emailProvider}
                leadCount={selectedIds.length}
                onChange={(patch) =>
                  setBatchSend((prev) => ({ ...prev, ...patch }))
                }
                onProviderChange={setEmailProvider}
              />
              <EmailProviderSettings />
              <SmtpAutonomousSettings />
            </CollapsibleCardContent>
          </CollapsibleCard>

          {/* 8. Primary action */}
          <Button
            size="lg"
            onClick={() => void handleSubmit()}
            disabled={eligibleCount === 0 || localDataWriteBlocked}
            className="sticky bottom-4 z-10 w-full bg-gradient-to-r from-blue-600 to-emerald-600 shadow-lg hover:from-blue-500 hover:to-emerald-500"
          >
            <Sparkles className="size-4" />
            {createLabel}
          </Button>
        </div>

        {showPreview && (
          <EmailPreviewPanel
            subject={subject}
            body={body}
            signature={signature}
            sendConfig={sendConfig}
            previewLead={previewLead}
            availableLeads={selectedLeads}
            onPreviewLeadChange={setPreviewLeadId}
            attachment={attachment}
            className="lg:sticky lg:top-6 lg:self-start"
          />
        )}
      </div>
    );
  }

  // ── Full (non-batch) form ───────────────────────────────────────────────
  return (
    <div
      className={cn(
        "grid gap-6",
        showPreview && "xl:grid-cols-[1fr_minmax(340px,420px)]"
      )}
    >
      <div className="space-y-6">
        {reuseSourceName && (
          <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
            Reutilizando template de <strong>{reuseSourceName}</strong>. O email,
            assinatura, anexo e configurações de envio foram copiados — escolha uma
            <strong> nova lista de leads</strong> abaixo.
          </div>
        )}

        <CollapsibleCard
          storageKey="nova-campanha-main"
          defaultOpen
          className="border-border/60 bg-gradient-to-br from-card to-blue-500/5"
        >
          <CollapsibleCardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="size-5 text-blue-400" />
              Nova Campanha
            </CardTitle>
          </CollapsibleCardHeader>
          <CollapsibleCardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="campaign-profile">Operação</Label>
              <Select
                value={campaignProfileId}
                onValueChange={(value: CampaignProfileId) =>
                  changeCampaignOperation(value)
                }
              >
                <SelectTrigger id="campaign-profile" className="bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_PROFILES.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Trocar a operação troca conta de envio e assinatura oficial
                imediatamente.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nome da campanha</Label>
              <Input
                id="name"
                placeholder="Ex: Outreach Estate Agents London Q3"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-background/50"
              />
            </div>
            <div className="space-y-2">
              <Label>Modelo de e-mail</Label>
              <Select
                value={selectedTemplateId}
                onValueChange={(id) => {
                  const template = operationTemplates.find(
                    (item) => item.id === id
                  );
                  if (template) applyEmailTemplate(template);
                }}
              >
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder="Selecione um modelo" />
                </SelectTrigger>
                <SelectContent>
                  {operationTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                      {template.isDefault ? " · Padrão" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CollapsibleCardContent>
        </CollapsibleCard>

        <CollapsibleCard
          storageKey="nova-campanha-import"
          defaultOpen
          className="border-border/60 border-dashed"
        >
          <CollapsibleCardHeader>
            <CardTitle className="text-base">Importar Leads Externos</CardTitle>
          </CollapsibleCardHeader>
          <CollapsibleCardContent>
            <ImportExternalLeads
              onImportBatch={handleImportBatch}
              systemLeads={[...savedLeads, ...importedLeads]}
              blockedEmails={blockedEntries.map((e) => e.normalizedEmail)}
              currentBatchCount={importBatchLeads.length}
            />
          </CollapsibleCardContent>
        </CollapsibleCard>

        {selectedIds.length > 0 && (
          <CollapsibleCard
            storageKey="nova-campanha-eligibility"
            defaultOpen
            className="border-border/60"
          >
            <CollapsibleCardHeader>
              <CardTitle className="text-base">
                Elegibilidade (fonte única)
              </CardTitle>
            </CollapsibleCardHeader>
            <CollapsibleCardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] text-muted-foreground">Selecionados</p>
                  <p className="text-xl font-semibold tabular-nums">
                    {topCards.total}
                  </p>
                </div>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <p className="text-[11px] text-muted-foreground">Elegíveis</p>
                  <p className="text-xl font-semibold tabular-nums text-emerald-400">
                    {topCards.eligible}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] text-muted-foreground">Excluídos</p>
                  <p className="text-xl font-semibold tabular-nums">
                    {topCards.excluded}
                  </p>
                </div>
              </div>
              <LocationFilterControls
                value={locationFilter}
                onChange={setLocationFilter}
              />
              <GlobalDeduplicationPreviewPanel preview={eligibility.preview} />
              <p className="text-xs text-muted-foreground">
                Os mesmos números alimentam cards, prévia, Agent 3 e Start.
                {importBatchId
                  ? ` Lote de importação: ${importBatchId}.`
                  : ""}
              </p>
            </CollapsibleCardContent>
          </CollapsibleCard>
        )}

        <CollapsibleCard storageKey="nova-campanha-send-config" defaultOpen>
          <CollapsibleCardHeader>
            <CardTitle className="text-base">Configuração de envio</CardTitle>
          </CollapsibleCardHeader>
          <CollapsibleCardContent>
            <SendConfigForm
              config={sendConfig}
              subject={subject}
              onConfigChange={(patch) =>
                setSendConfig((prev) => ({ ...prev, ...patch }))
              }
              onSubjectChange={setSubject}
              onInsertVariable={(v) => setSubject((prev) => prev + v)}
            />
          </CollapsibleCardContent>
        </CollapsibleCard>

        <CollapsibleCard storageKey="nova-campanha-editor" defaultOpen>
          <CollapsibleCardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2 pr-10">
              <CardTitle className="text-base">Editor / Preview do email</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPreview((v) => !v)}
              >
                {showPreview ? (
                  <>
                    <EyeOff className="size-3.5" />
                    Ocultar preview
                  </>
                ) : (
                  <>
                    <Eye className="size-3.5" />
                    Mostrar preview
                  </>
                )}
              </Button>
            </div>
          </CollapsibleCardHeader>
          <CollapsibleCardContent className="space-y-4">
            <RichEmailEditor
              value={body}
              onChange={setBody}
              layout="full"
              minHeight={560}
            />
          </CollapsibleCardContent>
        </CollapsibleCard>

        <CollapsibleCard storageKey="nova-campanha-attachment" defaultOpen={false}>
          <CollapsibleCardHeader>
            <CardTitle className="text-base">Anexo PDF</CardTitle>
          </CollapsibleCardHeader>
          <CollapsibleCardContent>
            <CampaignAttachmentField
              attachment={attachment}
              onChange={setAttachment}
            />
          </CollapsibleCardContent>
        </CollapsibleCard>

        <CollapsibleCard storageKey="nova-campanha-signature" defaultOpen>
          <CollapsibleCardHeader>
            <CardTitle className="text-base">Assinatura</CardTitle>
          </CollapsibleCardHeader>
          <CollapsibleCardContent>
            <CampaignSignatureSettings
              signature={signature}
              operation={campaignProfileId}
              onChange={(patch) =>
                setSignature((prev) => ({ ...prev, ...patch }))
              }
            />
          </CollapsibleCardContent>
        </CollapsibleCard>

        <CollapsibleCard storageKey="nova-campanha-followup" defaultOpen={false}>
          <CollapsibleCardHeader>
            <CardTitle className="text-base">Follow-up</CardTitle>
          </CollapsibleCardHeader>
          <CollapsibleCardContent>
            <FollowUpSettings
              followUp={followUp}
              onChange={(patch) =>
                setFollowUp((prev) => ({ ...prev, ...patch }))
              }
            />
          </CollapsibleCardContent>
        </CollapsibleCard>

        <CollapsibleCard storageKey="nova-campanha-batch-settings" defaultOpen={false}>
          <CollapsibleCardHeader>
            <CardTitle className="text-base">Configurações de lote / SMTP</CardTitle>
          </CollapsibleCardHeader>
          <CollapsibleCardContent className="space-y-4">
            <BatchSendSettings
              config={batchSend}
              provider={emailProvider}
              leadCount={selectedIds.length}
              onChange={(patch) =>
                setBatchSend((prev) => ({ ...prev, ...patch }))
              }
              onProviderChange={setEmailProvider}
            />
            <EmailProviderSettings />
            <SmtpAutonomousSettings />
          </CollapsibleCardContent>
        </CollapsibleCard>

        <CollapsibleCard storageKey="nova-campanha-leads" defaultOpen>
          <CollapsibleCardHeader>
            <CardTitle className="text-base">Selecionar Leads</CardTitle>
          </CollapsibleCardHeader>
          <CollapsibleCardContent>
            <LeadPicker
              savedLeads={savedLeads}
              recentLeads={currentLeads}
              importedLeads={importBatchLeads}
              selectedIds={selectedIds}
              onSelectionChange={(ids) => {
                setSelectedIds(ids);
                if (ids.length > 0 && !ids.includes(previewLeadId ?? "")) {
                  setPreviewLeadId(ids[0]);
                }
              }}
              recentSearchLabel={recentSearchLabel}
            />
          </CollapsibleCardContent>
        </CollapsibleCard>

        <Button
          size="lg"
          onClick={() => void handleSubmit()}
          disabled={selectedIds.length === 0 || localDataWriteBlocked}
          className="w-full bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500"
        >
          <Sparkles className="size-4" />
          {createLabel}
        </Button>
      </div>

      {showPreview && (
        <EmailPreviewPanel
          subject={subject}
          body={body}
          signature={signature}
          sendConfig={sendConfig}
          previewLead={previewLead}
          availableLeads={selectedLeads}
          onPreviewLeadChange={setPreviewLeadId}
          attachment={attachment}
          className="xl:sticky xl:top-8 xl:self-start"
        />
      )}
    </div>
  );
}
