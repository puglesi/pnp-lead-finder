"use client";

import { Database, History, MailCheck, MailWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCampaignProfileName, isCampaignProfileId } from "@/types/campaign-profile";
import { useOfficialHistoryStore } from "@/store/official-history-store";

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

function operationLabel(value: string) {
  return isCampaignProfileId(value) ? getCampaignProfileName(value) : value;
}

export function RecoveredCampaignsPanel() {
  const recovered = useOfficialHistoryStore((state) => state.recoveredCampaigns);
  if (recovered.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        <History className="size-4" /> Campanhas históricas recuperadas
      </p>
      <p className="text-xs text-muted-foreground">
        Somente campos comprovados no SQLite. Assunto e corpo não são inventados.
      </p>
      <div className="grid gap-2 lg:grid-cols-2">
        {recovered.map((campaign) => (
          <div
            key={campaign.campaignId}
            className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>{campaign.label}</strong>
              <Badge variant="outline">{operationLabel(campaign.operation)}</Badge>
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {campaign.campaignId}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {campaign.confirmed} confirmados · {campaign.failed} falhos ·{" "}
              {campaign.uniqueEmails} e-mails · {campaign.uniqueProviderMessageIds}{" "}
              providerMessageIds
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDate(campaign.firstActivityAt)} — {formatDate(campaign.lastActivityAt)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OfficialSendHistory() {
  const sends = useOfficialHistoryStore((state) => state.sendHistory);
  const confirmed = sends.filter((item) => item.status === "confirmed").length;
  const failed = sends.filter((item) => item.status === "failed").length;

  return (
    <Card className="border-border/60">
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center gap-2 text-xl">
          <Database className="size-5 text-emerald-500" />
          Histórico oficial de campanhas e envios
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Lido diretamente do SQLite a cada abertura: {confirmed} confirmados · {failed} falhos.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <RecoveredCampaignsPanel />

        {sends.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum envio persistido no SQLite.
          </p>
        ) : (
          <div className="max-h-[32rem] overflow-auto rounded-lg border border-border/60">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2">Data</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Operação</th><th className="px-3 py-2">Campanha</th><th className="px-3 py-2">Empresa</th><th className="px-3 py-2">E-mail</th><th className="px-3 py-2">providerMessageId</th>
                </tr>
              </thead>
              <tbody>
                {sends.map((send) => (
                  <tr key={send.id} className="border-t border-border/40">
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDate(send.confirmedAt ?? send.attemptedAt)}</td>
                    <td className="px-3 py-2">
                      <span className={send.status === "confirmed" ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}>
                        {send.status === "confirmed" ? <MailCheck className="mr-1 inline size-4" /> : <MailWarning className="mr-1 inline size-4" />}{send.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">{operationLabel(send.operation)}</td>
                    <td className="px-3 py-2" title={send.campaignId ?? undefined}>{send.campaignName ?? send.campaignId ?? "—"}</td>
                    <td className="px-3 py-2">{send.company ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{send.email}</td>
                    <td className="max-w-64 truncate px-3 py-2 font-mono text-xs" title={send.providerMessageId ?? send.error ?? undefined}>{send.providerMessageId ?? send.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
