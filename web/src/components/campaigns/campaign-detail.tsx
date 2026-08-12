"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Eye,
  EyeOff,
  FilePlus2,
  LineChart,
  Play,
  Save,
  Send,
  Settings2,
  Star,
  Trash2,
  Users,
  UsersRound,
  Wand2,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCampaignEffectiveStatus } from "@/lib/campaign-completion";
import { CampaignStatusBadge } from "./campaign-status-badge";
import { CampaignOverview } from "./campaign-overview";
import { CampaignPerformanceReport } from "./campaign-performance-report";
import { useCampaignTrackingSync } from "@/hooks/use-campaign-tracking-sync";
import type { CampaignTrackingEvent } from "@/types/campaign-tracking";
import { CampaignLeadsTable } from "./campaign-leads-table";
import { CampaignSendErrorLog } from "./campaign-send-error-log";
import { BatchSendSettings } from "./batch-send-settings";
import { EmailProviderSettings } from "./email-provider-settings";
import { SmtpAutonomousSettings } from "./smtp-autonomous-settings";
import { EmailPreviewPanel } from "./email-preview-panel";
import { FollowUpSettings } from "./follow-up-settings";
import { RichEmailEditor } from "./rich-email-editor";
import { SendConfigForm } from "./send-config-form";
import { CampaignAttachmentField } from "./campaign-attachment";
import { CampaignSignatureSettings } from "./campaign-signature-settings";
import { SaveAsTemplateDialog } from "./save-as-template-dialog";
import { CampaignSendNowDialog } from "./campaign-send-now-dialog";
import { getTrackingPollInterval } from "@/lib/local-production";
import { buildReuseCampaignUrl } from "@/lib/campaign-reuse";
import { useSettingsStore } from "@/store/settings-store";
import { resolveCampaignLeads } from "@/lib/campaign-leads";
import { useLeadStore } from "@/store/lead-store";
import { useCampaignStore } from "@/store/campaign-store";
import { useAgentThreeStore } from "@/store/agent-three-store";
import { useBatchPipelineStore } from "@/store/batch-pipeline-store";
import { useEmailTemplateStore } from "@/store/email-template-store";
import {
  type Campaign,
  type CampaignFollowUp,
  type CampaignSignature,
} from "@/types/campaign";
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardHeader,
} from "@/components/ui/collapsible-card";
import { CardTitle } from "@/components/ui/card";
import { getDefaultOperationSignature } from "@/lib/operation-identity";

import { cn } from "@/lib/utils";

type CampaignTab = "overview" | "report" | "compose" | "leads" | "settings";

const TABS: { id: CampaignTab; label: string; icon: typeof BarChart3 }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "report", label: "Relatório", icon: LineChart },
  { id: "compose", label: "Email", icon: Wand2 },
  { id: "leads", label: "Leads", icon: Users },
  { id: "settings", label: "Settings", icon: Settings2 },
];

function resolveInitialTab(
  campaign: Campaign | undefined,
  initialTab?: CampaignTab
): CampaignTab {
  if (initialTab) return initialTab;
  if (campaign?.status === "draft") return "compose";
  return "overview";
}

function buildCampaignDraft(campaign: Campaign | undefined) {
  const op = campaign?.campaignProfileId ?? "panek-puglesi";
  const defaultSig = getDefaultOperationSignature(op);
  return {
    subject: campaign?.subject ?? "",
    body: campaign?.body ?? "",
    fromName: campaign?.fromName ?? "",
    fromEmail: campaign?.fromEmail ?? "",
    replyTo: campaign?.replyTo ?? "",
    unsubscribeLink: campaign?.unsubscribeLink ?? "",
    followUp: campaign
      ? { ...campaign.followUp }
      : ({
          enabled: false,
          delayDays: 3,
          subject: "",
          body: "",
        } as CampaignFollowUp),
    signature: campaign?.signature
      ? { ...campaign.signature }
      : ({ ...defaultSig } as CampaignSignature),
  };
}

export function CampaignDetail({
  campaignId,
  initialTab,
}: {
  campaignId: string;
  initialTab?: CampaignTab;
}) {
  const campaignStateKey = useCampaignStore((state) => {
    const campaign = state.campaigns.find((item) => item.id === campaignId);
    return campaign ? `${campaign.id}:${campaign.status}` : null;
  });

  if (!campaignStateKey) return null;

  return (
    <CampaignDetailContent
      key={`${campaignStateKey}:${initialTab ?? ""}`}
      campaignId={campaignId}
      initialTab={initialTab}
    />
  );
}

function CampaignDetailContent({
  campaignId,
  initialTab,
}: {
  campaignId: string;
  initialTab?: CampaignTab;
}) {
  const router = useRouter();
  const { savedLeads, currentLeads, importedLeads } = useLeadStore();
  const campaign = useCampaignStore((s) =>
    s.campaigns.find((c) => c.id === campaignId)
  );
  const {
    deleteCampaign,
    updateCampaign,
    syncCampaignTracking,
  } = useCampaignStore();
  const selectProfile = useAgentThreeStore((s) => s.selectProfile);
  const selectCampaign = useAgentThreeStore((s) => s.selectCampaign);
  const setActiveBatch = useBatchPipelineStore((s) => s.setActiveBatch);
  const updateBatchStage = useBatchPipelineStore((s) => s.updateBatchStage);
  const attachCampaign = useBatchPipelineStore((s) => s.attachCampaign);

  const [tab, setTab] = useState<CampaignTab>(() =>
    resolveInitialTab(campaign, initialTab)
  );
  const [trackingEvents, setTrackingEvents] = useState<CampaignTrackingEvent[]>([]);
  const [trackingRefreshing, setTrackingRefreshing] = useState(false);

  const localProductionEnabled = useSettingsStore(
    (s) => s.localProductionEnabled
  );
  const nightModeActive = useSettingsStore((s) => s.nightModeActive);
  const trackingPollMs = getTrackingPollInterval(
    localProductionEnabled,
    nightModeActive
  );

  const trackingEnabled =
    tab === "overview" || tab === "report" || tab === "leads";
  useCampaignTrackingSync(campaignId, trackingEnabled, trackingPollMs);

  const refreshTracking = useCallback(async () => {
    setTrackingRefreshing(true);
    try {
      const events = await syncCampaignTracking(campaignId);
      setTrackingEvents(events);
    } finally {
      setTrackingRefreshing(false);
    }
  }, [campaignId, syncCampaignTracking]);
  const [showPreview, setShowPreview] = useState(false);
  const [previewLeadId, setPreviewLeadId] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => buildCampaignDraft(campaign));
  const [saveState, setSaveState] = useState<"clean" | "dirty" | "saved">(
    "clean"
  );
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [sendNowOpen, setSendNowOpen] = useState(false);
  const setRecipientSourceMode = useAgentThreeStore(
    (s) => s.setRecipientSourceMode
  );

  const leads = useMemo(
    () =>
      campaign
        ? resolveCampaignLeads(
            campaign.leadIds,
            savedLeads,
            currentLeads,
            importedLeads
          )
        : [],
    [campaign, savedLeads, currentLeads, importedLeads]
  );
  const campaignSentCount = campaign?.sentCount;

  useEffect(() => {
    if (campaignSentCount === undefined) return;
    const timeoutId = window.setTimeout(() => {
      void refreshTracking();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [campaignSentCount, refreshTracking]);

  if (!campaign) return null;

  const effectiveStatus = getCampaignEffectiveStatus(campaign);
  const isEditable =
    effectiveStatus === "draft" ||
    effectiveStatus === "saved" ||
    effectiveStatus === "paused" ||
    effectiveStatus === "active";
  const previewLead =
    leads.find((l) => l.id === previewLeadId) ?? leads[0] ?? null;

  const sendConfig = {
    fromName: draft.fromName,
    fromEmail: draft.fromEmail,
    replyTo: draft.replyTo,
    unsubscribeLink: draft.unsubscribeLink,
  };

  const patchDraft = (
    updater: (d: ReturnType<typeof buildCampaignDraft>) => ReturnType<
      typeof buildCampaignDraft
    >
  ) => {
    setDraft((d) => updater(d));
    setSaveState("dirty");
  };

  const handleSave = () => {
    updateCampaign(campaign.id, {
      subject: draft.subject,
      body: draft.body,
      fromName: draft.fromName,
      fromEmail: draft.fromEmail,
      replyTo: draft.replyTo,
      unsubscribeLink: draft.unsubscribeLink,
      followUp: draft.followUp,
      signature: draft.signature,
      attachment: campaign.attachment ?? null,
      status:
        campaign.status === "draft" || campaign.status === "saved"
          ? "saved"
          : campaign.status,
    });
    setSaveState("saved");
    toast.success("Salvo");
  };

  const handleOpenInAgentThree = () => {
    if (isEditable) handleSave();
    setRecipientSourceMode("campaign");
    selectProfile(campaign.campaignProfileId);
    selectCampaign(campaign.campaignProfileId, campaign.id);
    if (campaign.batchId) {
      setActiveBatch(campaign.batchId);
      attachCampaign(campaign.batchId, campaign.id);
      updateBatchStage(campaign.batchId, "send");
    }
    router.push("/agente-3");
  };

  const handleSendNow = () => {
    if (isEditable) handleSave();
    setSendNowOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/campanhas"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="size-3.5" />
            Campanhas
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{campaign.name}</h1>
            <CampaignStatusBadge status={effectiveStatus} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {campaign.leadIds.length} leads · envio exclusivo pelo Agente 3
            {effectiveStatus === "completed"
              ? " · campanha concluída"
              : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {saveState === "dirty" && (
            <Badge variant="warning" className="text-[10px]">
              Alterações não salvas
            </Badge>
          )}
          {saveState === "saved" && (
            <Badge variant="success" className="text-[10px]">
              Salvo
            </Badge>
          )}
          <Button
            variant="outline"
            onClick={() => router.push(buildReuseCampaignUrl(campaign.id))}
          >
            <UsersRound className="size-4" />
            Reutilizar para nova lista
          </Button>
          {isEditable && (
            <Button
              variant={saveState === "dirty" ? "default" : "outline"}
              onClick={handleSave}
            >
              <Save className="size-4" />
              Salvar alterações
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setTemplateDialogOpen(true)}
          >
            <FilePlus2 className="size-4" />
            Salvar como modelo
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const saveAs = useEmailTemplateStore.getState().saveAsTemplate;
              const result = saveAs({
                name: `${campaign.name} (padrão)`,
                operation: campaign.campaignProfileId,
                subject: draft.subject,
                body: draft.body,
                sender: draft.fromEmail,
                replyTo: draft.replyTo,
                setAsDefault: true,
              });
              if (result) toast.success("Definido como modelo padrão.");
              else toast.error("Não foi possível definir o padrão.");
            }}
          >
            <Star className="size-4" />
            Definir como padrão
          </Button>
          <Button
            onClick={handleOpenInAgentThree}
            className="bg-emerald-600 hover:bg-emerald-500"
          >
            <Send className="size-4" />
            Abrir no Agente 3
          </Button>
          <Button
            variant="default"
            onClick={handleSendNow}
            className="bg-blue-600 hover:bg-blue-500"
          >
            <Play className="size-4" />
            Enviar agora
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (
                !window.confirm(
                  `Apagar a campanha “${campaign.name}”?`
                )
              ) {
                return;
              }
              deleteCampaign(campaign.id);
              router.push("/campanhas");
            }}
          >
            <Trash2 className="size-4" />
            Apagar
          </Button>
        </div>
      </div>

      <SaveAsTemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        operation={campaign.campaignProfileId}
        subject={draft.subject}
        body={draft.body}
        sender={draft.fromEmail}
        replyTo={draft.replyTo}
      />

      <CampaignSendNowDialog
        open={sendNowOpen}
        onOpenChange={setSendNowOpen}
        campaign={campaign}
      />

      <div className="flex flex-wrap gap-1 rounded-xl border border-border/60 bg-muted/20 p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
                tab === t.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {t.label}
              {t.id === "leads" && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {leads.length}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <CollapsibleCard
            storageKey={`campaign-detail-overview-${campaign.id}`}
            defaultOpen
          >
            <CollapsibleCardHeader>
              <CardTitle className="text-base">Overview / resumo</CardTitle>
            </CollapsibleCardHeader>
            <CollapsibleCardContent>
              <CampaignOverview campaign={campaign} events={trackingEvents} />
            </CollapsibleCardContent>
          </CollapsibleCard>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-100/90">
            Envio legado desativado nesta página. Use{" "}
            <strong>Abrir no Agente 3</strong> ou <strong>Enviar agora</strong>{" "}
            (mesmo motor do Agente 3: preflight, dedupe, blocklist, fila).
          </div>
          <CollapsibleCard
            storageKey={`campaign-detail-errors-${campaign.id}`}
            defaultOpen={false}
          >
            <CollapsibleCardHeader>
              <CardTitle className="text-base">Log de erros de envio</CardTitle>
            </CollapsibleCardHeader>
            <CollapsibleCardContent>
              <CampaignSendErrorLog errors={campaign.sendErrors ?? []} />
            </CollapsibleCardContent>
          </CollapsibleCard>
          {campaign.followUp.enabled && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90">
              Follow-up automático ativo — {campaign.followUp.delayDays} dias após
              o primeiro envio
            </div>
          )}
          <div className="grid gap-6 xl:grid-cols-2">
            <CollapsibleCard
              storageKey={`campaign-detail-preview-${campaign.id}`}
              defaultOpen
            >
              <CollapsibleCardHeader>
                <CardTitle className="text-base">Preview do email</CardTitle>
              </CollapsibleCardHeader>
              <CollapsibleCardContent>
                <EmailPreviewPanel
                  subject={campaign.subject}
                  body={campaign.body}
                  signature={campaign.signature}
                  sendConfig={{
                    fromName: campaign.fromName,
                    fromEmail: campaign.fromEmail,
                    replyTo: campaign.replyTo,
                    unsubscribeLink: campaign.unsubscribeLink,
                  }}
                  previewLead={previewLead}
                  availableLeads={leads}
                  onPreviewLeadChange={setPreviewLeadId}
                  attachment={campaign.attachment}
                />
              </CollapsibleCardContent>
            </CollapsibleCard>
            <CollapsibleCard
              storageKey={`campaign-detail-leads-overview-${campaign.id}`}
              defaultOpen
            >
              <CollapsibleCardHeader>
                <CardTitle className="text-base">Leads / destinatários</CardTitle>
              </CollapsibleCardHeader>
              <CollapsibleCardContent>
                <CampaignLeadsTable
                  campaign={campaign}
                  leads={leads}
                  onSelectLead={setPreviewLeadId}
                  selectedLeadId={previewLeadId}
                />
              </CollapsibleCardContent>
            </CollapsibleCard>
          </div>
        </div>
      )}

      {tab === "compose" && (
        <div
          className={cn(
            "grid gap-6",
            showPreview && "xl:grid-cols-[1fr_minmax(340px,420px)]"
          )}
        >
          <div className="space-y-4">
            <div className="flex justify-end">
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
            <RichEmailEditor
              value={draft.body}
              onChange={(body) => patchDraft((d) => ({ ...d, body }))}
              disabled={!isEditable && campaign.status === "completed"}
              layout="full"
              minHeight={560}
            />
            {isEditable && (
              <>
                <CampaignAttachmentField
                  attachment={campaign.attachment ?? null}
                  onChange={(att) => updateCampaign(campaign.id, { attachment: att })}
                />
                <CampaignSignatureSettings
                  signature={draft.signature}
                  operation={campaign.campaignProfileId}
                  disabled={!isEditable}
                  onChange={(patch) =>
                    patchDraft((d) => ({
                      ...d,
                      signature: { ...d.signature, ...patch },
                    }))
                  }
                />
              </>
            )}
            {!isEditable && campaign.status === "completed" && (
              <p className="text-xs text-muted-foreground">
                Campanha concluída — duplique para editar o email
              </p>
            )}
          </div>
          {showPreview && (
            <EmailPreviewPanel
              subject={draft.subject}
              body={draft.body}
              signature={draft.signature}
              sendConfig={sendConfig}
              previewLead={previewLead}
              availableLeads={leads}
              onPreviewLeadChange={setPreviewLeadId}
              attachment={campaign.attachment}
              className="xl:sticky xl:top-6 xl:self-start"
            />
          )}
        </div>
      )}

      {tab === "report" && (
        <CollapsibleCard
          storageKey={`campaign-detail-report-${campaign.id}`}
          defaultOpen
        >
          <CollapsibleCardHeader>
            <CardTitle className="text-base">Relatório</CardTitle>
          </CollapsibleCardHeader>
          <CollapsibleCardContent>
            <CampaignPerformanceReport
              campaign={campaign}
              events={trackingEvents}
              onRefresh={refreshTracking}
              refreshing={trackingRefreshing}
            />
          </CollapsibleCardContent>
        </CollapsibleCard>
      )}

      {tab === "leads" && (
        <CollapsibleCard
          storageKey={`campaign-detail-leads-tab-${campaign.id}`}
          defaultOpen
        >
          <CollapsibleCardHeader>
            <CardTitle className="text-base">Leads / destinatários</CardTitle>
          </CollapsibleCardHeader>
          <CollapsibleCardContent>
            <CampaignLeadsTable
              campaign={campaign}
              leads={leads}
              onSelectLead={(id) => {
                setPreviewLeadId(id);
                setTab("compose");
              }}
              selectedLeadId={previewLeadId}
            />
          </CollapsibleCardContent>
        </CollapsibleCard>
      )}

      {tab === "settings" && (
        <div className="space-y-6">
          <CollapsibleCard
            storageKey={`campaign-detail-settings-${campaign.id}`}
            defaultOpen
          >
            <CollapsibleCardHeader>
              <CardTitle className="text-base">Settings / configurações</CardTitle>
            </CollapsibleCardHeader>
            <CollapsibleCardContent className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-2">
                <BatchSendSettings
                  config={campaign.batchSend}
                  provider={campaign.emailProvider}
                  leadCount={campaign.leadIds.length}
                  disabled={!isEditable}
                  onChange={(patch) =>
                    updateCampaign(campaign.id, {
                      batchSend: { ...campaign.batchSend, ...patch },
                    })
                  }
                  onProviderChange={(id) =>
                    updateCampaign(campaign.id, { emailProvider: id })
                  }
                />
                <SendConfigForm
                  config={sendConfig}
                  subject={draft.subject}
                  disabled={!isEditable && campaign.status === "completed"}
                  onConfigChange={(patch) =>
                    patchDraft((d) => ({ ...d, ...patch }))
                  }
                  onSubjectChange={(subject) =>
                    patchDraft((d) => ({ ...d, subject }))
                  }
                  onInsertVariable={(v) =>
                    patchDraft((d) => ({ ...d, subject: d.subject + v }))
                  }
                />
                <FollowUpSettings
                  followUp={draft.followUp}
                  disabled={!isEditable && campaign.status === "completed"}
                  onChange={(patch) =>
                    patchDraft((d) => ({
                      ...d,
                      followUp: { ...d.followUp, ...patch },
                    }))
                  }
                />
              </div>
              <EmailProviderSettings />
              <SmtpAutonomousSettings />
            </CollapsibleCardContent>
          </CollapsibleCard>
        </div>
      )}
    </div>
  );
}