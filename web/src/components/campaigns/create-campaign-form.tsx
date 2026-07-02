"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, FileText, Megaphone, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

export function CreateCampaignForm({
  reuseFromId = null,
}: {
  reuseFromId?: string | null;
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
  const emailProvider = useSettingsStore((s) => s.emailProvider);
  const setEmailProvider = useSettingsStore((s) => s.setEmailProvider);
  const reuseLoaded = useRef<string | null>(null);
  const [reuseSourceName, setReuseSourceName] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [subject, setSubject] = useState<string>(DEFAULT_SUBJECT);
  const [body, setBody] = useState<string>(DEFAULT_BODY_HTML);
  const [sendConfig, setSendConfig] = useState({ ...DEFAULT_CAMPAIGN_SEND_CONFIG });
  const [followUp, setFollowUp] = useState<CampaignFollowUp>({ ...DEFAULT_FOLLOW_UP });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewLeadId, setPreviewLeadId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [attachment, setAttachment] = useState<CampaignAttachment | null>(null);
  const [signature, setSignature] = useState<CampaignSignature>({ ...DEFAULT_SIGNATURE });
  const [batchSend, setBatchSend] = useState<CampaignBatchSendConfig>({
    ...DEFAULT_BATCH_SEND_CONFIG,
  });

  const allLeads = useMemo(() => {
    const map = new Map<string, (typeof savedLeads)[0]>();
    for (const l of [...importedLeads, ...savedLeads, ...currentLeads]) {
      if (hasValidEmail(l.email)) map.set(l.id, l);
    }
    return Array.from(map.values());
  }, [savedLeads, currentLeads, importedLeads]);

  const selectedLeads = useMemo(
    () => allLeads.filter((l) => selectedIds.includes(l.id)),
    [allLeads, selectedIds]
  );

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
    const source = getCampaign(reuseFromId);
    if (!source) {
      toast.error("Campanha de origem não encontrada.");
      return;
    }

    reuseLoaded.current = reuseFromId;
    setReuseSourceName(source.name);
    setName(buildReuseCampaignName(source.name));
    setSubject(source.subject);
    setBody(source.body);
    setSendConfig({
      fromName: source.fromName,
      fromEmail: source.fromEmail,
      replyTo: source.replyTo,
      unsubscribeLink: source.unsubscribeLink,
    });
    setFollowUp({ ...source.followUp });
    setSignature({ ...source.signature });
    setAttachment(source.attachment ? { ...source.attachment } : null);
    setBatchSend({ ...source.batchSend });
    setEmailProvider(source.emailProvider);
    setSelectedIds([]);
    setPreviewLeadId(null);
    toast.success("Template carregado — selecione a nova lista de leads", {
      icon: "📋",
    });
  }, [reuseFromId, getCampaign, setEmailProvider]);

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

    toast.success(`Campanha "${campaign.name}" criada!`, { icon: "📣" });
    router.push(`/campanhas/${campaign.id}`);
  };

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
          Criar Campanha ({selectedIds.length} leads)
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