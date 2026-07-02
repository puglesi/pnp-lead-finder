"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Loader2,
  Mail,
  MapPin,
  Megaphone,
  Rocket,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EMAIL_TEMPLATE_PRESETS,
  hasValidEmail,
} from "@/lib/email-templates";
import { inferLeadSource } from "@/lib/campaign-leads";
import { formatDuration } from "@/lib/time-estimate";
import { parseSectors } from "@/lib/worker-pool";
import { useLeadStore } from "@/store/lead-store";
import { useCampaignStore } from "@/store/campaign-store";
import {
  DEFAULT_CAMPAIGN_SEND_CONFIG,
  DEFAULT_FOLLOW_UP,
  type Campaign,
} from "@/types/campaign";
import type { Lead } from "@/types/lead";
import { CampaignSendProgress } from "@/components/campaigns/campaign-send-progress";
import { cn } from "@/lib/utils";

type FlowPhase =
  | "config"
  | "searching"
  | "validating"
  | "review"
  | "sending"
  | "done";

type CampaignChoice =
  | { kind: "campaign"; id: string }
  | { kind: "preset"; id: string };

const PHASE_STEPS: { id: FlowPhase; label: string; icon: typeof Search }[] = [
  { id: "searching", label: "Busca", icon: Search },
  { id: "validating", label: "Validação", icon: ShieldCheck },
  { id: "review", label: "Revisão", icon: Users },
  { id: "sending", label: "Envio", icon: Send },
  { id: "done", label: "Concluído", icon: CheckCircle2 },
];

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function phaseIndex(phase: FlowPhase, skipReview: boolean): number {
  const order: FlowPhase[] = skipReview
    ? ["searching", "validating", "sending", "done"]
    : ["searching", "validating", "review", "sending", "done"];
  return order.indexOf(phase);
}

function resolveCampaignTemplate(
  choice: CampaignChoice,
  campaigns: Campaign[]
) {
  if (choice.kind === "campaign") {
    const c = campaigns.find((x) => x.id === choice.id);
    if (!c) return null;
    return {
      name: c.name,
      subject: c.subject,
      body: c.body,
      fromName: c.fromName,
      fromEmail: c.fromEmail,
      replyTo: c.replyTo,
      unsubscribeLink: c.unsubscribeLink,
      followUp: c.followUp,
    };
  }
  const preset = EMAIL_TEMPLATE_PRESETS.find((p) => p.id === choice.id);
  if (!preset) return null;
  return {
    name: preset.label,
    subject: preset.subject,
    body: preset.body,
    ...DEFAULT_CAMPAIGN_SEND_CONFIG,
    followUp: { ...DEFAULT_FOLLOW_UP },
  };
}

function PhaseStepper({
  current,
  skipReview,
}: {
  current: FlowPhase;
  skipReview: boolean;
}) {
  const steps = skipReview
    ? PHASE_STEPS.filter((s) => s.id !== "review")
    : PHASE_STEPS;
  const currentIdx = phaseIndex(current, skipReview);

  return (
    <div className="flex flex-wrap items-center gap-1 sm:gap-2">
      {steps.map((step, i) => {
        const Icon = step.icon;
        const idx = phaseIndex(step.id, skipReview);
        const done = currentIdx > idx;
        const active = current === step.id;
        return (
          <div key={step.id} className="flex items-center gap-1 sm:gap-2">
            {i > 0 && (
              <ArrowRight className="hidden size-3 text-muted-foreground/50 sm:block" />
            )}
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3",
                done && "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
                active && "border-primary/50 bg-primary/10 text-primary",
                !done && !active && "border-border/50 text-muted-foreground"
              )}
            >
              {done ? (
                <CheckCircle2 className="size-3.5" />
              ) : active ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Icon className="size-3.5" />
              )}
              {step.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OneClickFlow({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    performBulkSearch,
    isSearching,
    bulkProgress,
    currentLeads,
    lastBulkSearchSectors,
    lastBulkSearchLocation,
    saveLead,
  } = useLeadStore();
  const {
    campaigns,
    createCampaign,
    simulateSend,
    sendingCampaignId,
    sendingProgress,
    getCampaign,
  } = useCampaignStore();

  const [phase, setPhase] = useState<FlowPhase>("config");
  const [sectors, setSectors] = useState("");
  const [location, setLocation] = useState("London");
  const [reviewBeforeSend, setReviewBeforeSend] = useState(false);
  const [campaignChoice, setCampaignChoice] = useState<CampaignChoice>(() =>
    campaigns.length > 0
      ? { kind: "campaign", id: campaigns[0].id }
      : { kind: "preset", id: EMAIL_TEMPLATE_PRESETS[0].id }
  );
  const [validatedLeads, setValidatedLeads] = useState<Lead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [validationProgress, setValidationProgress] = useState({
    current: 0,
    total: 0,
    valid: 0,
  });
  const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(
    null
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !open) return;
    setSectors(lastBulkSearchSectors);
    setLocation(lastBulkSearchLocation || "London");
  }, [hydrated, open, lastBulkSearchSectors, lastBulkSearchLocation]);



  const sectorList = parseSectors(sectors);
  const activeCampaign = createdCampaignId
    ? getCampaign(createdCampaignId)
    : null;
  const isSending =
    sendingCampaignId === createdCampaignId && phase === "sending";

  const templateLabel = useMemo(() => {
    if (campaignChoice.kind === "campaign") {
      return campaigns.find((c) => c.id === campaignChoice.id)?.name ?? "—";
    }
    return (
      EMAIL_TEMPLATE_PRESETS.find((p) => p.id === campaignChoice.id)?.label ??
      "—"
    );
  }, [campaignChoice, campaigns]);

  const resetFlow = useCallback(() => {
    setPhase("config");
    setValidatedLeads([]);
    setSelectedLeadIds([]);
    setValidationProgress({ current: 0, total: 0, valid: 0 });
    setCreatedCampaignId(null);
  }, []);

  const handleClose = (next: boolean) => {
    if (
      !next &&
      (phase === "searching" || phase === "validating" || phase === "sending")
    ) {
      toast.error("Aguarde a conclusão do fluxo ou cancele após concluir.");
      return;
    }
    if (!next) resetFlow();
    onOpenChange(next);
  };

  const validateLeads = async (leads: Lead[]) => {
    setPhase("validating");
    const valid: Lead[] = [];
    setValidationProgress({ current: 0, total: leads.length, valid: 0 });

    for (let i = 0; i < leads.length; i++) {
      await delay(25 + Math.random() * 45);
      const lead = leads[i];
      if (hasValidEmail(lead.email)) {
        valid.push(lead);
        saveLead(lead);
      }
      setValidationProgress({
        current: i + 1,
        total: leads.length,
        valid: valid.length,
      });
    }

    return valid;
  };

  const launchCampaign = async (leads: Lead[]) => {
    const template = resolveCampaignTemplate(campaignChoice, campaigns);
    if (!template) {
      toast.error("Campanha ou template inválido.");
      setPhase("config");
      return;
    }

    const leadIds = leads.map((l) => l.id);
    const campaignName = `One-Click · ${location.trim()} · ${new Date().toLocaleDateString("pt-BR")}`;

    const freshSaved = useLeadStore.getState().savedLeads;
    const freshRecent = useLeadStore.getState().currentLeads;

    const campaign = createCampaign({
      name: campaignName,
      subject: template.subject,
      body: template.body,
      leadIds,
      leadSource: inferLeadSource(leadIds, freshSaved, freshRecent),
      fromName: template.fromName,
      fromEmail: template.fromEmail,
      replyTo: template.replyTo,
      unsubscribeLink: template.unsubscribeLink,
      followUp: template.followUp,
    });

    setCreatedCampaignId(campaign.id);
    setPhase("sending");

    const contexts = leads.map((l) => ({
      leadId: l.id,
      label: l.company,
      email: l.email!,
      lead: l,
    }));
    await simulateSend(campaign.id, contexts);
    setPhase("done");
    toast.success(
      `Campanha enviada para ${leads.length} leads com email válido!`,
      { icon: "🚀", duration: 6000 }
    );
  };

  const runFlow = async () => {
    if (sectorList.length === 0 || !location.trim()) {
      toast.error("Preencha os setores e a localização.");
      return;
    }

    try {
      setPhase("searching");
      await performBulkSearch(sectors, location.trim());

      const leads = useLeadStore.getState().currentLeads;
      if (leads.length === 0) {
        toast.error("Nenhum lead encontrado. Ajuste setores ou localização.");
        setPhase("config");
        return;
      }

      const valid = await validateLeads(leads);
      setValidatedLeads(valid);

      if (valid.length === 0) {
        toast.error(
          "Nenhum lead com email válido. Tente outros setores ou localização."
        );
        setPhase("config");
        return;
      }

      setSelectedLeadIds(valid.map((l) => l.id));

      if (reviewBeforeSend) {
        setPhase("review");
        return;
      }

      await launchCampaign(valid);
    } catch {
      toast.error("Erro no fluxo One-Click. Tente novamente.");
      setPhase("config");
    }
  };

  const handleConfirmReview = async () => {
    const leads = validatedLeads.filter((l) =>
      selectedLeadIds.includes(l.id)
    );
    if (leads.length === 0) {
      toast.error("Selecione pelo menos um lead para enviar.");
      return;
    }
    await launchCampaign(leads);
  };

  const toggleLead = (id: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const searchPct =
    bulkProgress.totalCount > 0
      ? Math.round(
          (bulkProgress.completedCount / bulkProgress.totalCount) * 100
        )
      : 0;

  const validationPct =
    validationProgress.total > 0
      ? Math.round(
          (validationProgress.current / validationProgress.total) * 100
        )
      : 0;

  const inProgress = phase !== "config" && phase !== "done";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          "max-h-[92vh] overflow-y-auto transition-all",
          inProgress ? "max-w-5xl" : "max-w-2xl"
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="size-5 text-violet-400" />
            {phase === "config"
              ? "Campanha Completa — One-Click"
              : "Campanha em Andamento"}
          </DialogTitle>
          <DialogDescription>
            {phase === "config"
              ? "Busca, validação e envio em um único fluxo automatizado."
              : `${templateLabel} · ${location}`}
          </DialogDescription>
        </DialogHeader>

        {phase === "config" ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Setores (vírgula ou →)</Label>
              <Textarea
                value={sectors}
                onChange={(e) => setSectors(e.target.value)}
                placeholder="restaurants, hotels, gyms"
                className="min-h-[72px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {sectorList.length} setor(es) na fila
              </p>
            </div>

            <div className="space-y-2">
              <Label>Localização</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="pl-10"
                  placeholder="London, Manchester..."
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Campanha / template de email</Label>
              {campaigns.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Campanhas salvas
                  </p>
                  {campaigns.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setCampaignChoice({ kind: "campaign", id: c.id })
                      }
                      className={cn(
                        "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                        campaignChoice.kind === "campaign" &&
                          campaignChoice.id === c.id
                          ? "border-primary/50 bg-primary/5"
                          : "border-border/50 hover:bg-accent/30"
                      )}
                    >
                      {campaignChoice.kind === "campaign" &&
                      campaignChoice.id === c.id ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                      ) : (
                        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.subject}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {c.leadIds.length} leads
                      </Badge>
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Templates rápidos
                </p>
                {EMAIL_TEMPLATE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      setCampaignChoice({ kind: "preset", id: preset.id })
                    }
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                      campaignChoice.kind === "preset" &&
                        campaignChoice.id === preset.id
                        ? "border-violet-500/50 bg-violet-500/5"
                        : "border-border/50 hover:bg-accent/30"
                    )}
                  >
                    {campaignChoice.kind === "preset" &&
                    campaignChoice.id === preset.id ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-violet-400" />
                    ) : (
                      <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{preset.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {preset.subject}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/40 px-4 py-3">
              <Checkbox
                id="review-before-send"
                checked={reviewBeforeSend}
                onCheckedChange={(v) => setReviewBeforeSend(v === true)}
              />
              <div className="space-y-0.5">
                <Label
                  htmlFor="review-before-send"
                  className="cursor-pointer font-medium"
                >
                  Revisar leads antes de enviar
                </Label>
                <p className="text-xs text-muted-foreground">
                  Pausa após validação para você confirmar a lista. Desmarcado =
                  envio automático.
                </p>
              </div>
            </div>

            <Button
              size="lg"
              className="h-12 w-full bg-gradient-to-r from-violet-600 to-emerald-600 font-semibold hover:from-violet-500 hover:to-emerald-500"
              onClick={runFlow}
            >
              <Rocket className="size-5" />
              Iniciar Campanha Completa
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <PhaseStepper
              current={phase}
              skipReview={!reviewBeforeSend}
            />

            {phase === "searching" && (
              <div className="space-y-4 rounded-xl border border-border/50 bg-background/30 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-5 animate-spin text-primary" />
                    <span className="font-medium">Buscando leads...</span>
                  </div>
                  <span className="text-2xl font-bold tabular-nums text-primary">
                    {isSearching ? searchPct : 100}%
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500"
                    style={{ width: `${isSearching ? searchPct : 100}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-border/40 p-3">
                    <p className="text-xs text-muted-foreground">Setores</p>
                    <p className="text-lg font-bold tabular-nums">
                      {bulkProgress.completedCount}/{bulkProgress.totalCount}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/40 p-3">
                    <p className="text-xs text-muted-foreground">Leads</p>
                    <p className="text-lg font-bold tabular-nums text-emerald-400">
                      {bulkProgress.leadsFound}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/40 p-3">
                    <p className="text-xs text-muted-foreground">Tempo</p>
                    <p className="text-lg font-bold tabular-nums">
                      {formatDuration(bulkProgress.elapsedMs)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/40 p-3">
                    <p className="text-xs text-muted-foreground">Local</p>
                    <p className="truncate text-sm font-medium">{location}</p>
                  </div>
                </div>
              </div>
            )}

            {phase === "validating" && (
              <div className="space-y-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-5 text-cyan-400" />
                    <span className="font-medium">Validando emails...</span>
                  </div>
                  <span className="text-2xl font-bold tabular-nums text-cyan-400">
                    {validationPct}%
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                    style={{ width: `${validationPct}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {validationProgress.current}/{validationProgress.total}{" "}
                  analisados ·{" "}
                  <span className="font-medium text-emerald-400">
                    {validationProgress.valid} válidos
                  </span>
                </p>
              </div>
            )}

            {phase === "review" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    <Mail className="mr-1 inline size-4 text-emerald-400" />
                    {selectedLeadIds.length} de {validatedLeads.length} leads
                    selecionados
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setSelectedLeadIds(validatedLeads.map((l) => l.id))
                      }
                    >
                      Selecionar todos
                    </Button>
                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-violet-600 to-emerald-600"
                      onClick={handleConfirmReview}
                    >
                      <Send className="size-3.5" />
                      Confirmar e Enviar
                    </Button>
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto rounded-xl border border-border/50">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="w-10 px-4 py-2" />
                        <th className="px-4 py-2">Empresa</th>
                        <th className="px-4 py-2">Email</th>
                        <th className="px-4 py-2">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validatedLeads.map((lead) => (
                        <tr
                          key={lead.id}
                          className="border-t border-border/40 hover:bg-accent/20"
                        >
                          <td className="px-4 py-2.5">
                            <Checkbox
                              checked={selectedLeadIds.includes(lead.id)}
                              onCheckedChange={() => toggleLead(lead.id)}
                            />
                          </td>
                          <td className="px-4 py-2.5 font-medium">
                            {lead.company}
                          </td>
                          <td className="px-4 py-2.5 text-emerald-400">
                            {lead.email}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums">
                            {lead.aiScore}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(phase === "sending" || phase === "done") && activeCampaign && (
              <CampaignSendProgress
                campaign={activeCampaign}
                isSending={isSending}
                sendingProgress={sendingProgress}
              />
            )}

            {phase === "done" && createdCampaignId && (
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href={`/campanhas/${createdCampaignId}`}>
                    <Megaphone className="size-4" />
                    Ver Campanha
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/resultados">
                    <Search className="size-4" />
                    Ver Leads
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    resetFlow();
                    onOpenChange(false);
                  }}
                >
                  Fechar
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function OneClickOutreach() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card className="overflow-hidden border-violet-500/25 bg-gradient-to-br from-card via-card to-violet-500/8 shadow-lg shadow-violet-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="size-5 text-violet-400" />
            One-Click Outreach
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Busca + validação de emails + envio de campanha em um único clique
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="gap-1">
              <Search className="size-3" />
              Buscar leads
            </Badge>
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="size-3" />
              Validar emails
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Send className="size-3" />
              Enviar campanha
            </Badge>
          </div>
          <Button
            size="lg"
            onClick={() => setOpen(true)}
            className="h-12 w-full bg-gradient-to-r from-violet-600 via-blue-600 to-emerald-600 text-base font-semibold shadow-lg shadow-violet-500/20 hover:from-violet-500 hover:via-blue-500 hover:to-emerald-500"
          >
            <Rocket className="size-5" />
            Iniciar Campanha Completa
          </Button>
        </CardContent>
      </Card>
      <OneClickFlow open={open} onOpenChange={setOpen} />
    </>
  );
}