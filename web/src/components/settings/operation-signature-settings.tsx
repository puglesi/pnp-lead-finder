"use client";

import { useMemo, useState } from "react";
import { PenLine, RotateCcw, Save } from "lucide-react";
import toast from "react-hot-toast";
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardHeader,
} from "@/components/ui/collapsible-card";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SignatureHtmlEditor } from "@/components/settings/signature-html-editor";
import {
  CAMPAIGN_PROFILES,
  type CampaignProfileId,
} from "@/types/campaign-profile";
import {
  selectOperationSignature,
  useOperationSignatureStore,
} from "@/store/operation-signature-store";
import { getOperationSendAccount } from "@/lib/operation-identity";
import {
  isSignatureHtmlEmpty,
  sanitizeSignatureHtml,
} from "@/lib/signature-html";

export function OperationSignatureSettings() {
  const [operation, setOperation] =
    useState<CampaignProfileId>("panek-puglesi");

  // CRITICAL: select the map (stable when untouched), then resolve entry with
  // a pure helper that returns the store reference or frozen EMPTY — never
  // allocate inside a Zustand selector.
  const signatures = useOperationSignatureStore((s) => s.signatures);
  const saveOfficial = useOperationSignatureStore((s) => s.saveOfficial);

  const signature = useMemo(
    () => selectOperationSignature(signatures, operation),
    [signatures, operation]
  );

  const account = useMemo(
    () => getOperationSendAccount(operation),
    [operation]
  );

  // Local draft only. Sync from store when operation changes or after save.
  const [boundOperation, setBoundOperation] = useState(operation);
  const [draftBody, setDraftBody] = useState(signature.body);
  const [draftEnabled, setDraftEnabled] = useState(signature.enabled);
  const [dirty, setDirty] = useState(false);

  // Operation switch: reload last saved for that op (discard in-flight draft).
  if (boundOperation !== operation) {
    setBoundOperation(operation);
    setDraftBody(signature.body);
    setDraftEnabled(signature.enabled);
    setDirty(false);
  }

  function handleSave() {
    const official = saveOfficial(operation, {
      body: draftBody,
      enabled: draftEnabled,
    });
    setDraftBody(official.body);
    setDraftEnabled(official.enabled);
    setDirty(false);
    toast.success(`Assinatura de ${account.signatureLabel} salva.`);
  }

  function handleDiscard() {
    // Last official snapshot for this operation (store reference fields).
    const saved = selectOperationSignature(signatures, operation);
    setDraftBody(saved.body);
    setDraftEnabled(saved.enabled);
    setDirty(false);
    toast.success(
      "Alterações descartadas — última assinatura salva restaurada."
    );
  }

  const previewHtml = draftEnabled
    ? sanitizeSignatureHtml(draftBody)
    : "<p style='color:#9ca3af'>(assinatura desativada)</p>";

  return (
    <CollapsibleCard
      storageKey="settings-operation-signatures"
      defaultOpen
      className="border-border/60"
    >
      <CollapsibleCardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <PenLine className="size-5 text-emerald-400" />
          Assinatura do e-mail
        </CardTitle>
        <CardDescription>
          Cole a assinatura formatada do Gmail (Ctrl+C / Ctrl+V). O layout
          (tabelas, logo, colunas, estilos) é preservado. P&amp;P e Modeclean
          ficam totalmente separadas. Senha SMTP não é editável aqui.
        </CardDescription>
      </CollapsibleCardHeader>
      <CollapsibleCardContent className="space-y-4">
        <div className="max-w-sm space-y-1.5">
          <Label>Operação</Label>
          <Select
            value={operation}
            onValueChange={(v) => setOperation(v as CampaignProfileId)}
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

        <div className="rounded-lg border border-border/50 bg-background/40 p-3 text-sm">
          <p>
            <span className="text-muted-foreground">Enviando pela conta: </span>
            <strong>{account.accountLabel}</strong>
          </p>
          <p className="mt-1">
            <span className="text-muted-foreground">Assinatura: </span>
            <strong>{account.signatureLabel}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="op-sig-enabled"
            checked={draftEnabled}
            onCheckedChange={(v) => {
              setDraftEnabled(v === true);
              setDirty(true);
            }}
          />
          <Label htmlFor="op-sig-enabled">Ativar assinatura</Label>
        </div>

        <SignatureHtmlEditor
          value={draftBody}
          disabled={!draftEnabled}
          minHeight={300}
          onChange={(body) => {
            setDraftBody(body);
            setDirty(true);
          }}
        />

        <div className="rounded-xl border border-border/50 bg-white p-4 dark:bg-background/40">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Preview (HTML exato que será enviado)
          </p>
          <div
            data-signature-preview="true"
            className="max-w-full overflow-x-auto text-sm text-foreground"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
          {draftEnabled && isSignatureHtmlEmpty(draftBody) && (
            <p className="mt-2 text-xs text-muted-foreground">
              Nada para exibir ainda. Abra o Gmail → Nova mensagem → copie a
              assinatura → cole acima.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={handleSave} disabled={!dirty}>
            <Save className="size-4" />
            Salvar assinatura
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleDiscard}
            disabled={!dirty}
          >
            <RotateCcw className="size-4" />
            Descartar alterações
          </Button>
        </div>
      </CollapsibleCardContent>
    </CollapsibleCard>
  );
}
