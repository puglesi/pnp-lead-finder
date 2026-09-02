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
  const exclusionBreakdown = Object.entries(
    excluded.reduce<Record<string, number>>((counts, decision) => {
      counts[decision.reason] = (counts[decision.reason] ?? 0) + 1;
      return counts;
    }, {})
  );

  return (
    <div className="space-y-4 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-5 text-violet-700 dark:text-violet-300" />
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
        <Metric label="Excluídos por qualidade" value={preview.qualityExcluded} />
        <Metric label="Alertas da outra operação" value={preview.otherOperationWarnings} />
        <Metric label="Destinatários realmente novos" value={preview.newRecipients} />
        <Metric label="Follow-ups autorizados" value={preview.authorizedFollowUps} />
        <Metric label="Total final que será enviado" value={preview.finalSendCount} />
      </div>

      {crossOperation.length > 0 && (
        <div className="rounded-lg border border-sky-500/35 bg-sky-500/10 p-3 text-sm text-sky-950 dark:text-sky-100">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4 text-sky-700 dark:text-sky-300" />
            Alerta: já contatado pela outra operação — não é erro de envio nem
            bloqueio automático
          </p>
          {crossOperation.map((decision) => (
            <p key={`${decision.leadId}-cross`} className="mt-1 text-xs text-sky-800 dark:text-sky-50/90">
              {decision.company} · {decision.normalizedEmail} — campanha{" "}
              {decision.otherOperationContact?.campaignName}
            </p>
          ))}
        </div>
      )}

      {excluded.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {exclusionBreakdown.map(([reason, count]) => `${reason}: ${count}`).join(" · ")}
          </p>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-border/60">
          <div className="sticky top-0 grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-3 bg-muted px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
            <span>Contato</span><span>Motivo da exclusão</span>
          </div>
          {excluded.map((decision) => {
            const isBlock =
              decision.code === "permanently_blocked" ||
              decision.code === "invalid_email";
            const isDup =
              decision.code === "duplicate_in_batch" ||
              decision.code === "same_operation_contacted" ||
              decision.code === "already_sent_current_campaign";
            return (
              <div
                key={`${decision.leadId}-${decision.code}`}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-3 border-t border-border/40 px-3 py-2 text-xs"
              >
                <span
                  className="min-w-0 truncate"
                  title={decision.normalizedEmail ?? decision.company}
                >
                  {decision.company} ·{" "}
                  {decision.normalizedEmail ?? "sem e-mail"}
                </span>
                <span
                  className={
                    isBlock
                      ? "text-red-800 dark:text-red-300"
                      : isDup
                        ? "text-orange-800 dark:text-orange-200"
                        : "text-muted-foreground"
                  }
                >
                  {decision.reason}
                </span>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {preview.finalSendCount > 0 && (
        <p className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="size-4" />
          {preview.finalSendCount} destinatário(s) autorizado(s) após a verificação global.
        </p>
      )}
    </div>
  );
}
