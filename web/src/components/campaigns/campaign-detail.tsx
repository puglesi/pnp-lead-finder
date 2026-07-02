"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Eye,
  EyeOff,
  LineChart,
  Loader2,
  Pause,
  Play,
  Save,
  Settings2,
  Trash2,
  Users,
  UsersRound,
  Wand2,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CampaignStatusBadge } from "./campaign-status-badge";
import { CampaignOverview } from "./campaign-overview";
import { CampaignPerformanceReport } from "./campaign-performance-report";
import { useCampaignTrackingSync } from "@/hooks/use-campaign-tracking-sync";
import type { CampaignTrackingEvent } from "@/types/campaign-tracking";
import { CampaignLeadsTable } from "./campaign-leads-table";
import { CampaignSendProgress } from "./campaign-send-progress";
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
import { getTrackingPollInterval } from "@/lib/local-production";
import { buildReuseCampaignUrl } from "@/lib/campaign-reuse";
import { useSettingsStore } from "@/store/settings-store";
import { resolveCampaignLeads } from "@/lib/campaign-leads";
import { useLeadStore } from "@/store/lead-store";
import { useCampaignStore } from "@/store/campaign-store";
import {
  DEFAULT_SIGNATURE,
  type CampaignFollowUp,
  type CampaignSignature,
} from "@/types/campaign";

import { cn } from "@/lib/utils";

type CampaignTab = "overview" | "report" | "compose" | "leads" | "settings";

const TABS: { id: CampaignTab; label: string; icon: typeof BarChart3 }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "report", label: "Relatório", icon: LineChart },
  { id: "compose", label: "Email", icon: Wand2 },
  { id: "leads", label: "Leads", icon: Users },
  { id: "settings", label: "Settings", icon: Settings2 },
];

export function CampaignDetail({
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
  const sendingCampaignId = useCampaignStore((s) => s.sendingCampaignId);
  const sendingProgress = useCampaignStore((s) => s.sendingProgress);
  const sendPaused = useCampaignStore((s) => s.sendPaused);
  const {
    startBatchSend,
    pauseBatchSend,
    resumeBatchSend,
    deleteCampaign,
    updateCampaign,
    syncCampaignTracking,
  } = useCampaignStore();

  const [tab, setTab] = useState<CampaignTab>(initialTab ?? "overview");
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

  const refreshTracking = async () => {
    setTrackingRefreshing(true);
    try {
      const events = await syncCampaignTracking(campaignId);
      setTrackingEvents(events);
    } finally {
      setTrackingRefreshing(false);
    }
  };
  const [showPreview, setShowPreview] = useState(false);
  const [previewLeadId, setPreviewLeadId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    subject: "",
    body: "",
    fromName: "",
    fromEmail: "",
    replyTo: "",
    unsubscribeLink: "",
    followUp: { enabled: false, delayDays: 3, subject: "", body: "" } as CampaignFollowUp,
    signature: { ...DEFAULT_SIGNATURE } as CampaignSignature,
  });

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

  useEffect(() => {
    if (!campaign) return;
    refreshTracking();
  }, [campaign?.id, campaign?.sentCount]);

  useEffect(() => {
    if (!campaign) return;
    setDraft({
      subject: campaign.subject,
      body: campaign.body,
      fromName: campaign.fromName,
      fromEmail: campaign.fromEmail,
      replyTo: campaign.replyTo,
      unsubscribeLink: campaign.unsubscribeLink,
      followUp: { ...campaign.followUp },
      signature: campaign.signature
        ? { ...campaign.signature }
        : { ...DEFAULT_SIGNATURE },
    });
    if (initialTab) {
      setTab(initialTab);
    } else if (campaign.status === "draft") {
      setTab("compose");
    } else if (campaign.sentCount > 0) {
      setTab("overview");
    }
  }, [campaign?.id, campaign?.status, initialTab]);

  if (!campaign) return null;

  const isSending = sendingCampaignId === campaign.id;
  const isEditable =
    campaign.status === "draft" || campaign.status === "paused";
  const previewLead =
    leads.find((l) => l.id === previewLeadId) ?? leads[0] ?? null;

  const sendConfig = {
    fromName: draft.fromName,
    fromEmail: draft.fromEmail,
    replyTo: draft.replyTo,
    unsubscribeLink: draft.unsubscribeLink,
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
    });
    toast.success("Campanha salva");
  };

  const buildLeadContexts = () =>
    leads
      .filter((l) => l.email)
      .map((l) => ({
        leadId: l.id,
        label: l.company,
        email: l.email!,
        lead: l,
      }));

  const handleSend = async () => {
    if (isSending && sendPaused) {
      resumeBatchSend();
      toast.success("Envio retomado");
      return;
    }
    if (isEditable) handleSave();
    const contexts = buildLeadContexts();
    if (contexts.length === 0) {
      toast.error("Nenhum lead com email válido.");
      return;
    }
    toast.loading("Iniciando envio em lotes...", { id: "send" });
    try {
      await startBatchSend(campaign.id, contexts);
      toast.success("Campanha concluída!", { id: "send" });
      setTab("overview");
    } catch {
      toast.error("Erro no envio", { id: "send" });
    }
  };

  const showProgress =
    isSending ||
    sendPaused ||
    campaign.status === "active" ||
    campaign.status === "paused" ||
    campaign.status === "completed";

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
            <CampaignStatusBadge status={campaign.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {campaign.leadIds.length} leads · Mailmeteor-style workspace
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(buildReuseCampaignUrl(campaign.id))}
          >
            <UsersRound className="size-4" />
            Reutilizar para nova lista
          </Button>
          {isEditable && (
            <Button variant="outline" onClick={handleSave}>
              <Save className="size-4" />
              Salvar
            </Button>
          )}
          {campaign.status === "draft" && (
            <Button
              onClick={handleSend}
              disabled={isSending}
              className="bg-emerald-600 hover:bg-emerald-500"
            >
              {isSending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Enviar
            </Button>
          )}
          {(isSending || campaign.status === "active") && !sendPaused && (
            <Button
              variant="outline"
              onClick={() => {
                pauseBatchSend();
                toast("Envio pausado");
              }}
            >
              <Pause className="size-4" />
              Pausar
            </Button>
          )}
          {(sendPaused || (campaign.status === "paused" && !isSending)) && (
            <Button onClick={handleSend}>
              <Play className="size-4" />
              Retomar
            </Button>
          )}
          <Button variant="outline" onClick={() => {
            deleteCampaign(campaign.id);
            router.push("/campanhas");
          }}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

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
          <CampaignOverview campaign={campaign} events={trackingEvents} />
          {showProgress && (
            <CampaignSendProgress
              campaign={campaign}
              isSending={isSending}
              sendingProgress={sendingProgress}
              isPaused={sendPaused}
              onPause={pauseBatchSend}
              onResume={resumeBatchSend}
            />
          )}
          <CampaignSendErrorLog errors={campaign.sendErrors ?? []} />
          {campaign.followUp.enabled && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90">
              Follow-up automático ativo — {campaign.followUp.delayDays} dias após
              o primeiro envio
            </div>
          )}
          <div className="grid gap-6 xl:grid-cols-2">
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
            <CampaignLeadsTable
              campaign={campaign}
              leads={leads}
              onSelectLead={setPreviewLeadId}
              selectedLeadId={previewLeadId}
            />
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
              onChange={(body) => setDraft((d) => ({ ...d, body }))}
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
                  disabled={!isEditable}
                  onChange={(patch) =>
                    setDraft((d) => ({
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
        <CampaignPerformanceReport
          campaign={campaign}
          events={trackingEvents}
          onRefresh={refreshTracking}
          refreshing={trackingRefreshing}
        />
      )}

      {tab === "leads" && (
        <CampaignLeadsTable
          campaign={campaign}
          leads={leads}
          onSelectLead={(id) => {
            setPreviewLeadId(id);
            setTab("compose");
          }}
          selectedLeadId={previewLeadId}
        />
      )}

      {tab === "settings" && (
        <div className="space-y-6">
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
              setDraft((d) => ({ ...d, ...patch }))
            }
            onSubjectChange={(subject) => setDraft((d) => ({ ...d, subject }))}
            onInsertVariable={(v) =>
              setDraft((d) => ({ ...d, subject: d.subject + v }))
            }
          />
          <FollowUpSettings
            followUp={draft.followUp}
            disabled={!isEditable && campaign.status === "completed"}
            onChange={(patch) =>
              setDraft((d) => ({
                ...d,
                followUp: { ...d.followUp, ...patch },
              }))
            }
          />
        </div>
        <EmailProviderSettings />
        <SmtpAutonomousSettings />
        </div>
      )}
    </div>
  );
}