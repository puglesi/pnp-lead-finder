"use client";

import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { GlobalDeduplicationPreview } from "@/lib/global-email-deduplication";

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function GlobalDeduplicationPreviewPanel({
  preview,
}: {
  preview: GlobalDeduplicationPreview;
}) {
  const excluded = preview.decisions.filter((decision) => !decision.included);
  const crossOperation = preview.decisions.filter(
    (decision) => decision.otherOperationContact
  );

  return (
    <div className="space-y-4 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-5 text-violet-300" />
            Prévia obrigatória de deduplicação global
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Verificação por e-mail normalizado em todas as campanhas e no histórico confirmado.
          </p>
        </div>
        <Badge variant={preview.finalSendCount > 0 ? "success" : "danger"}>
          {preview.contactKind === "follow_up" ? "Follow-up" : "Primeiro contato"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Metric label="Empresas encontradas" value={preview.companiesFound} />
        <Metric label="Contatos com e-mail" value={preview.contactsWithEmail} />
        <Metric label="Duplicados no lote" value={preview.duplicatesInBatch} />
        <Metric label="Já contatados nesta operação" value={preview.alreadyContactedSameOperation} />
        <Metric label="Contatos bloqueados" value={preview.blockedContacts} />
        <Metric label="Alertas da outra operação" value={preview.otherOperationWarnings} />
        <Metric label="Destinatários realmente novos" value={preview.newRecipients} />
        <Metric label="Follow-ups autorizados" value={preview.authorizedFollowUps} />
        <Metric label="Total final que será enviado" value={preview.finalSendCount} />
      </div>

      {crossOperation.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" />
            Contato anterior pela outra operação — alerta apenas, sem bloqueio automático
          </p>
          {crossOperation.map((decision) => (
            <p key={`${decision.leadId}-cross`} className="mt-1 text-xs">
              {decision.company} · {decision.normalizedEmail} — campanha {decision.otherOperationContact?.campaignName}
            </p>
          ))}
        </div>
      )}

      {excluded.length > 0 && (
        <div className="max-h-56 overflow-y-auto rounded-lg border border-border/60">
          <div className="sticky top-0 grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-3 bg-muted px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
            <span>Contato</span><span>Motivo da exclusão</span>
          </div>
          {excluded.map((decision) => (
            <div key={`${decision.leadId}-${decision.code}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-3 border-t border-border/40 px-3 py-2 text-xs">
              <span className="min-w-0 truncate" title={decision.normalizedEmail ?? decision.company}>
                {decision.company} · {decision.normalizedEmail ?? "sem e-mail"}
              </span>
              <span className="text-amber-100">{decision.reason}</span>
            </div>
          ))}
        </div>
      )}

      {preview.finalSendCount > 0 && (
        <p className="flex items-center gap-2 text-sm text-emerald-300">
          <CheckCircle2 className="size-4" />
          {preview.finalSendCount} destinatário(s) autorizado(s) após a verificação global.
        </p>
      )}
    </div>
  );
}
