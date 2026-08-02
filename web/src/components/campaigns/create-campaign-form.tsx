"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  FileText,
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
import {
  DEFAULT_BODY_HTML,
  DEFAULT_SUBJECT,
  EMAIL_TEMPLATE_PRESETS,
  hasValidEmail,
} from "@/lib/email-templates";
import { inferLeadSource } from "@/lib/campaign-leads";
import {
  DEFAULT_CAMPAIGN_SEND_CONFIG,
  DEFAULT_FOLLOW_UP,
  DEFAULT_SIGNATURE,
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
import { EmailPreviewPanel } from "./email-preview-panel";
import { LeadPicker } from "./lead-picker";
import { RichEmailEditor } from "./rich-email-editor";
import { SendConfigForm } from "./send-config-form";
import { ImportExternalLeads } from "./import-external-leads";
import { CampaignAttachmentField } from "./campaign-attachment";
import { BatchSendSettings } from "./batch-send-settings";
import { EmailProviderSettings } from "./email-provider-settings";
import { SmtpAutonomousSettings } from "./smtp-autonomous-settings";
import { buildReuseCampaignName } from "@/lib/campaign-reuse";
import {
  filterLeadsByMemberIds,
  getBatchEligibleLeads,
} from "@/lib/lead-batch";
import { cn } from "@/lib/utils";
import {
  CAMPAIGN_PROFILES,
  type CampaignProfileId,
} from "@/types/campaign-profile";
import { useBatchPipelineStore } from "@/store/batch-pipeline-store";

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
  const [subject, setSubject] = useState<string>(
    reuseSource?.subject ?? DEFAULT_SUBJECT
  );
  const [body, setBody] = useState<string>(
    reuseSource?.body ?? DEFAULT_BODY_HTML
  );
  const [sendConfig, setSendConfig] = useState(() =>
    reuseSource
      ? {
          fromName: reuseSource.fromName,
          fromEmail: reuseSource.fromEmail,
          replyTo: reuseSource.replyTo,
          unsubscribeLink: reuseSource.unsubscribeLink,
        }
      : { ...DEFAULT_CAMPAIGN_SEND_CONFIG }
  );
  const [followUp, setFollowUp] = useState<CampaignFollowUp>(() =>
    reuseSource ? { ...reuseSource.followUp } : { ...DEFAULT_FOLLOW_UP }
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewLeadId, setPreviewLeadId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(() => Boolean(batchId));
  const [attachment, setAttachment] = useState<CampaignAttachment | null>(() =>
    reuseSource?.attachment ? { ...reuseSource.attachment } : null
  );
  const [signature, setSignature] = useState<CampaignSignature>(() =>
    reuseSource ? { ...reuseSource.signature } : { ...DEFAULT_SIGNATURE }
  );
  const [batchSend, setBatchSend] = useState<CampaignBatchSendConfig>({
    ...(reuseSource?.batchSend ?? DEFAULT_BATCH_SEND_CONFIG),
  });

  const allLeads = useMemo(() => {
    const map = new Map<string, (typeof savedLeads)[0]>();
    const memberIds = batchMeta?.leadIds ?? [];
    const pool = batchId
      ? filterLeadsByMemberIds([...currentLeads, ...savedLeads], memberIds)
      : [...importedLeads, ...savedLeads, ...currentLeads];
    // Batch campaigns: only eligible emails (mailbox unknown OK; sem e-mail out).
    const scoped = batchId ? getBatchEligibleLeads(pool) : pool;
    for (const l of scoped) {
      if (hasValidEmail(l.email)) map.set(l.id, l);
    }
    return Array.from(map.values());
  }, [savedLeads, currentLeads, importedLeads, batchId, batchMeta?.leadIds]);

  const selectedLeads = useMemo(
    () => allLeads.filter((l) => selectedIds.includes(l.id)),
    [allLeads, selectedIds]
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

  const applyPreset = (presetId: string) => {
    const preset = EMAIL_TEMPLATE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSubject(preset.subject);
    setBody(preset.body);
    toast.success(`Template "${preset.label}" aplicado`);
  };

  const handleImport = (leads: import("@/types/lead").Lead[]) => {
    const added = importExternalLeads(leads);
    if (added.length > 0) {
      const freshIds = added.map((l) => l.id);
      setSelectedIds((prev) => [...new Set([...prev, ...freshIds])]);
      if (!previewLeadId) setPreviewLeadId(freshIds[0]);
    }
  };

  const handleSubmit = () => {
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

    const campaign = createCampaign({
      campaignProfileId,
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

    toast.success(`Campanha "${campaign.name}" criada!`, { icon: "📣" });
    router.push(`/campanhas/${campaign.id}`);
  };

  const eligibleCount = selectedIds.length;
  const createLabel = batchId
    ? `Criar campanha com ${eligibleCount} elegíveis`
    : `Criar Campanha (${eligibleCount} leads)`;

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
            <Label>Template</Label>
            <div className="flex flex-wrap gap-2">
              {EMAIL_TEMPLATE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className="rounded-lg border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <FileText className="mr-1 inline size-3" />
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

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
              onChange={(e) => setSubject(e.target.value)}
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
                    setCampaignProfileId(value)
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
            onClick={handleSubmit}
            disabled={eligibleCount === 0}
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

        <Card className="border-border/60 bg-gradient-to-br from-card to-blue-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="size-5 text-blue-400" />
              Nova Campanha
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="campaign-profile">Operação</Label>
              <Select
                value={campaignProfileId}
                onValueChange={(value: CampaignProfileId) =>
                  setCampaignProfileId(value)
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
                A campanha e sua futura fila de envio ficarão isoladas nesta operação.
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
              <Label>Templates rápidos</Label>
              <div className="flex flex-wrap gap-2">
                {EMAIL_TEMPLATE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset.id)}
                    className="rounded-lg border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <FileText className="mr-1 inline size-3" />
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <ImportExternalLeads
          onImport={handleImport}
          importedCount={importedLeads.length}
        />

        <SendConfigForm
          config={sendConfig}
          subject={subject}
          onConfigChange={(patch) =>
            setSendConfig((prev) => ({ ...prev, ...patch }))
          }
          onSubjectChange={setSubject}
          onInsertVariable={(v) => setSubject((prev) => prev + v)}
        />

        <Card className="border-border/60">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
            <div>
              <CardTitle className="text-base">Corpo do email</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Editor amplo — cole direto do Gmail mantendo formatação
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPreview((v) => !v)}
              className="shrink-0"
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
          </CardHeader>
          <CardContent className="space-y-4">
            <RichEmailEditor
              value={body}
              onChange={setBody}
              layout="full"
              minHeight={560}
            />
            <CampaignAttachmentField
              attachment={attachment}
              onChange={setAttachment}
            />
          </CardContent>
        </Card>

        <CampaignSignatureSettings
          signature={signature}
          onChange={(patch) => setSignature((prev) => ({ ...prev, ...patch }))}
        />

        <FollowUpSettings
          followUp={followUp}
          onChange={(patch) => setFollowUp((prev) => ({ ...prev, ...patch }))}
        />

        <BatchSendSettings
          config={batchSend}
          provider={emailProvider}
          leadCount={selectedIds.length}
          onChange={(patch) => setBatchSend((prev) => ({ ...prev, ...patch }))}
          onProviderChange={setEmailProvider}
        />

        <EmailProviderSettings />
        <SmtpAutonomousSettings />

        <LeadPicker
          savedLeads={savedLeads}
          recentLeads={currentLeads}
          importedLeads={importedLeads}
          selectedIds={selectedIds}
          onSelectionChange={(ids) => {
            setSelectedIds(ids);
            if (ids.length > 0 && !ids.includes(previewLeadId ?? "")) {
              setPreviewLeadId(ids[0]);
            }
          }}
          recentSearchLabel={recentSearchLabel}
        />

        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={selectedIds.length === 0}
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
