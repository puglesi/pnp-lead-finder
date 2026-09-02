"use client";

import { useMemo, useState } from "react";
import { Send, ShieldAlert } from "lucide-react";
import toast from "react-hot-toast";
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardHeader,
} from "@/components/ui/collapsible-card";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListFileImportCard } from "@/components/import/list-file-import-card";
import { GlobalDeduplicationPreviewPanel } from "@/components/campaigns/global-deduplication-preview";
import {
  previewImportedSendList,
  type ListImportAnalysis,
} from "@/lib/list-import";
import type { ListImportParseResult } from "@/lib/list-import";
import type { GlobalDeduplicationPreview } from "@/lib/global-email-deduplication";
import { useEmailBlocklistStore } from "@/store/email-blocklist-store";
import { useLeadStore } from "@/store/lead-store";
import { useCampaignStore } from "@/store/campaign-store";
import { useAgentThreeStore } from "@/store/agent-three-store";
import { useEmailTemplateStore } from "@/store/email-template-store";
import { useOperationSignatureStore } from "@/store/operation-signature-store";
import {
  CAMPAIGN_PROFILES,
  type CampaignProfileId,
} from "@/types/campaign-profile";
import type { Lead } from "@/types/lead";
import {
  getDefaultEmailTemplate,
  getEmailTemplatesForOperation,
} from "@/lib/email-template-library";
import { getOperationSendAccount } from "@/lib/operation-identity";
import { bindSignatureToOperation } from "@/lib/operation-signature";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function AgentThreeImportList() {
  const blockedEntries = useEmailBlocklistStore((s) => s.entries);
  const savedLeads = useLeadStore((s) => s.savedLeads);
  const importedLeads = useLeadStore((s) => s.importedLeads);
  const currentLeads = useLeadStore((s) => s.currentLeads);
  const importExternalLeads = useLeadStore((s) => s.importExternalLeads);
  const campaigns = useCampaignStore((s) => s.campaigns);
  const createCampaign = useCampaignStore((s) => s.createCampaign);
  const selectProfile = useAgentThreeStore((s) => s.selectProfile);
  const selectCampaign = useAgentThreeStore((s) => s.selectCampaign);
  const setRecipientSourceMode = useAgentThreeStore(
    (s) => s.setRecipientSourceMode
  );
  const setImportTemplateId = useAgentThreeStore((s) => s.setImportTemplateId);
  const operations = useAgentThreeStore((s) => s.operations);
  const selectedProfileId = useAgentThreeStore((s) => s.selectedProfileId);
  const templates = useEmailTemplateStore((s) => s.templates);
  const getSignature = useOperationSignatureStore((s) => s.getSignature);

  const [operation, setOperation] = useState<CampaignProfileId>(
    selectedProfileId || "panek-puglesi"
  );
  const [analysis, setAnalysis] = useState<ListImportAnalysis | null>(null);
  const [preview, setPreview] = useState<GlobalDeduplicationPreview | null>(
    null
  );
  const [eligibleLeads, setEligibleLeads] = useState<Lead[]>([]);
  const [importedRaw, setImportedRaw] = useState<Lead[]>([]);

  const allKnown = useMemo(
    () => [...savedLeads, ...importedLeads, ...currentLeads],
    [savedLeads, importedLeads, currentLeads]
  );

  const opTemplates = useMemo(
    () => getEmailTemplatesForOperation(templates, operation),
    [templates, operation]
  );

  function rebuildPreview(leads: Lead[], profile: CampaignProfileId) {
    const result = previewImportedSendList({
      leads,
      operation: profile,
      campaignId: `import-preview-${profile}`,
      campaigns,
      allKnownLeads: allKnown,
      operations,
      blockedEntries,
    });
    setAnalysis(result.analysis);
    setPreview(result.preview);
    setEligibleLeads(result.eligibleLeads);
  }

  function handleParsed(result: ListImportParseResult) {
    if (result.needsManualMapping && result.leads.length === 0) return;
    setImportedRaw(result.leads);
    // Auto-select Minha lista mode for Agent 3 control card.
    setRecipientSourceMode("import");
    selectProfile(operation);
    rebuildPreview(result.leads, operation);
    toast.success(
      `${result.leads.length} contato(s) lidos. Origem: Minha lista.`
    );
  }

  function handleOperationChange(value: CampaignProfileId) {
    setOperation(value);
    selectProfile(value);
    if (importedRaw.length > 0) rebuildPreview(importedRaw, value);
  }

  async function handlePrepareCampaign() {
    if (!preview || eligibleLeads.length === 0) {
      toast.error(
        "Nenhum destinatário elegível. Histórico, blocklist e dedupe bloquearam a lista."
      );
      return;
    }

    const added = importExternalLeads(eligibleLeads);
    // Exclusive recipients from this import — never merge old campaign leadIds.
    const leadIds = (added.length > 0 ? added : eligibleLeads).map((l) => l.id);
    const account = getOperationSendAccount(operation);
    const signature = getSignature(operation);
    const template = getDefaultEmailTemplate(templates, operation);

    const campaign = await createCampaign({
      campaignProfileId: operation,
      contactKind: template?.contactKind ?? "first_contact",
      emailTemplateId: template?.id,
      name: `Lista importada · ${new Date().toLocaleString("pt-BR")}`,
      subject: template?.subject ?? "",
      body: template?.body ?? "",
      leadIds,
      leadSource: "imported",
      fromName: account.fromName,
      fromEmail: account.fromEmail,
      replyTo: account.replyTo,
      signature: bindSignatureToOperation(operation, signature),
    });
    useCampaignStore.getState().setCampaignStatus(campaign.id, "saved");
    setRecipientSourceMode("import");
    if (template) setImportTemplateId(template.id);
    selectProfile(operation);
    selectCampaign(operation, campaign.id);
    toast.success(
      `Lista carregada (${leadIds.length} elegível(is)). Escolha o modelo e envie no card abaixo — sem campanhas antigas.`
    );
  }

  return (
    <div className="space-y-4">
      <ListFileImportCard
        storageKey="agent-3-send-my-list-upload"
        title="Enviar para minha lista"
        description="CSV, TXT ou XLSX. Ativa automaticamente o modo Minha lista no Agente 3. Destinatários vêm só desta lista — campanhas antigas não contaminam. Dedupe/blocklist/histórico só filtram."
        onParsed={handleParsed}
        defaultOpen={false}
      />

      {(analysis || preview) && (
        <CollapsibleCard storageKey="agent-3-import-preview" defaultOpen>
          <CollapsibleCardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldAlert className="size-5 text-amber-400" />
              Prévia de envio (proteções obrigatórias)
            </CardTitle>
            <CardDescription>
              Normalização, deduplicação, blocklist, suppression, histórico,
              unsubscribe, bounce e já contatados — mesma engine global.
            </CardDescription>
          </CollapsibleCardHeader>
          <CollapsibleCardContent className="space-y-4">
            <div className="max-w-xs space-y-1.5">
              <Label>Operação</Label>
              <Select
                value={operation}
                onValueChange={(v) =>
                  handleOperationChange(v as CampaignProfileId)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_PROFILES.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground">
              Modelos disponíveis para {getOperationSendAccount(operation).profileName}:{" "}
              {opTemplates.map((t) => t.name).join(", ") || "nenhum"}
            </p>

            {analysis && (
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Importados" value={analysis.totalImported} />
                <Stat label="Duplicados" value={analysis.duplicates} />
                <Stat label="Bloqueados" value={analysis.blocked} />
                <Stat
                  label="Já contatados"
                  value={preview?.alreadyContactedSameOperation ?? 0}
                />
                <Stat
                  label="Elegíveis"
                  value={preview?.finalSendCount ?? 0}
                />
                <Stat
                  label="Total final"
                  value={preview?.finalSendCount ?? 0}
                />
              </div>
            )}

            {preview && <GlobalDeduplicationPreviewPanel preview={preview} />}

            <Button
              onClick={handlePrepareCampaign}
              disabled={!preview || preview.finalSendCount === 0}
            >
              <Send className="size-4" />
              Carregar no Agente 3 (Minha lista)
            </Button>
            <p className="text-xs text-muted-foreground">
              Nenhum e-mail é enviado neste passo. O card de envio usará Modelo
              de e-mail (não seletor de campanha antiga) e a lista importada
              como única fonte de destinatários.
            </p>
          </CollapsibleCardContent>
        </CollapsibleCard>
      )}
    </div>
  );
}
