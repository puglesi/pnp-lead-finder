"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  PenLine,
  RotateCcw,
  Save,
  Upload,
} from "lucide-react";
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
  const signatures = useOperationSignatureStore((state) => state.signatures);
  const records = useOperationSignatureStore((state) => state.records);
  const hasHydrated = useOperationSignatureStore(
    (state) => state.hasHydrated
  );
  const isHydrating = useOperationSignatureStore(
    (state) => state.isHydrating
  );
  const persistenceError = useOperationSignatureStore(
    (state) => state.persistenceError
  );
  const hydrate = useOperationSignatureStore((state) => state.hydrate);
  const saveOfficial = useOperationSignatureStore(
    (state) => state.saveOfficial
  );
  const exportBackup = useOperationSignatureStore(
    (state) => state.exportBackup
  );
  const importBackup = useOperationSignatureStore(
    (state) => state.importBackup
  );

  const signature = useMemo(
    () => selectOperationSignature(signatures, operation),
    [signatures, operation]
  );
  const account = useMemo(
    () => getOperationSendAccount(operation),
    [operation]
  );

  const [draftBody, setDraftBody] = useState(signature.body);
  const [draftEnabled, setDraftEnabled] = useState(signature.enabled);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const officialDraftKey = `${operation}:${signature.enabled}:${signature.body}`;
  const [draftSourceKey, setDraftSourceKey] = useState(officialDraftKey);

  useEffect(() => {
    void hydrate().catch((error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao carregar assinaturas oficiais."
      );
    });
  }, [hydrate]);

  if (draftSourceKey !== officialDraftKey) {
    setDraftSourceKey(officialDraftKey);
    setDraftBody(signature.body);
    setDraftEnabled(signature.enabled);
    setDirty(false);
  }

  async function handleSave() {
    setBusy(true);
    try {
      const official = await saveOfficial(operation, {
        body: draftBody,
        enabled: draftEnabled,
      });
      setDraftBody(official.body);
      setDraftEnabled(official.enabled);
      setDirty(false);
      toast.success(`Assinatura de ${account.signatureLabel} salva.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao salvar assinatura oficial."
      );
    } finally {
      setBusy(false);
    }
  }

  function handleDiscard() {
    const saved = selectOperationSignature(signatures, operation);
    setDraftBody(saved.body);
    setDraftEnabled(saved.enabled);
    setDirty(false);
    toast.success(
      "Alterações descartadas — última assinatura oficial restaurada."
    );
  }

  async function handleExportBackup() {
    setBusy(true);
    try {
      const json = await exportBackup();
      const blob = new Blob([json], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `pnp-assinaturas-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(href);
      toast.success("Backup das assinaturas exportado.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao exportar backup."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleImportBackup(file: File) {
    setBusy(true);
    try {
      await importBackup(await file.text());
      toast.success("Backup importado e salvo no IndexedDB.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao importar backup."
      );
    } finally {
      setBusy(false);
    }
  }

  const previewHtml = draftEnabled
    ? sanitizeSignatureHtml(draftBody)
    : "<p style='color:#9ca3af'>(assinatura desativada)</p>";
  const record = records[operation];
  const signatureEmpty = isSignatureHtmlEmpty(draftBody);
  const savedAt = record?.updatedAt
    ? new Date(record.updatedAt).toLocaleString("pt-BR")
    : null;

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
        {persistenceError && (
          <div className="flex gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <strong>Falha na persistência da assinatura.</strong>
              <p>{persistenceError}</p>
            </div>
          </div>
        )}

        <div className="max-w-sm space-y-1.5">
          <Label>Operação</Label>
          <Select
            value={operation}
            onValueChange={(value) => {
              setDirty(false);
              setOperation(value as CampaignProfileId);
            }}
          >
            <SelectTrigger>
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

        <div className="rounded-lg border border-border/50 bg-background/40 p-3 text-sm">
          <p>
            <span className="text-muted-foreground">Enviando pela conta: </span>
            <strong>{account.accountLabel}</strong>
          </p>
          <p className="mt-1">
            <span className="text-muted-foreground">Assinatura: </span>
            <strong>{account.signatureLabel}</strong>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {isHydrating || !hasHydrated ? (
              <span className="text-muted-foreground">Carregando…</span>
            ) : record ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" />
                Salva ✓
              </span>
            ) : (
              <span className="font-medium text-amber-800 dark:text-amber-400">
                Assinatura não configurada
              </span>
            )}
            <span className="text-muted-foreground">
              {isHydrating
                ? "Carregando do IndexedDB…"
                : savedAt
                  ? `Última atualização: ${savedAt}`
                  : hasHydrated
                    ? "Nenhuma versão oficial salva"
                    : "Aguardando persistência"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="op-sig-enabled"
            checked={draftEnabled}
            onCheckedChange={(value) => {
              setDraftEnabled(value === true);
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
          {signatureEmpty && hasHydrated && !isHydrating && (
            <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-400">
              Assinatura não configurada. O preflight e o envio desta operação
              permanecerão bloqueados até existir HTML oficial salvo.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={!dirty || busy || signatureEmpty}
          >
            <Save className="size-4" />
            Salvar assinatura
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleDiscard}
            disabled={!dirty || busy}
          >
            <RotateCcw className="size-4" />
            Descartar alterações
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleExportBackup()}
            disabled={busy || Object.keys(records).length === 0}
          >
            <Download className="size-4" />
            Exportar backup
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => importInputRef.current?.click()}
            disabled={busy}
          >
            <Upload className="size-4" />
            Importar backup
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImportBackup(file);
              event.target.value = "";
            }}
          />
        </div>
      </CollapsibleCardContent>
    </CollapsibleCard>
  );
}
