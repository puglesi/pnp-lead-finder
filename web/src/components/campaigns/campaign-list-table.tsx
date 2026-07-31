"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, MessageSquare, Users, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampaignStatusBadge } from "./campaign-status-badge";
import {
  countConfirmedSmtpSends,
  getCampaignListProgressPercent,
} from "@/lib/campaign-list-metrics";
import { formatDistanceToNow } from "@/lib/date-utils";
import { buildReuseCampaignUrl } from "@/lib/campaign-reuse";
import type { Campaign } from "@/types/campaign";
import { cn } from "@/lib/utils";

export function CampaignListTable({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter();

  const handleReuse = (campaign: Campaign) => {
    router.push(buildReuseCampaignUrl(campaign.id));
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card/50">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">Campanha</th>
              <th className="px-5 py-3 font-medium">Leads</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Enviados</th>
              <th className="px-5 py-3 font-medium">Respostas</th>
              <th className="px-5 py-3 font-medium">Progresso</th>
              <th className="px-5 py-3 font-medium">Atualizado</th>
              <th className="px-5 py-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => {
              const confirmedSent = countConfirmedSmtpSends(campaign);
              const progress = getCampaignListProgressPercent(campaign);
              const replied = (campaign.leadStatuses ?? []).filter(
                (status) =>
                  status.status === "replied" &&
                  Boolean(status.providerMessageId) &&
                  !String(status.providerMessageId).startsWith("sim-")
              ).length;
              const responseRate =
                confirmedSent === 0
                  ? 0
                  : Math.round((replied / confirmedSent) * 100);

              return (
                <tr
                  key={campaign.id}
                  className="border-b border-border/40 transition-colors last:border-0 hover:bg-accent/20"
                >
                  <td className="px-5 py-4">
                    <p className="font-semibold text-foreground">
                      {campaign.name}
                    </p>
                    <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">
                      {campaign.subject}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <Users className="size-3.5 text-blue-400" />
                      {campaign.leadIds.length}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <CampaignStatusBadge status={campaign.status} />
                  </td>
                  <td className="px-5 py-4 tabular-nums">
                    <span className="font-medium text-emerald-400">
                      {confirmedSent}
                    </span>
                    <span className="text-muted-foreground">
                      /{campaign.leadIds.length}
                    </span>
                  </td>
                  <td className="px-5 py-4 tabular-nums">
                    {confirmedSent > 0 ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 font-medium",
                          responseRate >= 10
                            ? "text-emerald-400"
                            : "text-muted-foreground"
                        )}
                      >
                        <MessageSquare className="size-3.5" />
                        {responseRate}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex min-w-[100px] items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {progress}%
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-xs text-muted-foreground">
                    {formatDistanceToNow(campaign.updatedAt)}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => handleReuse(campaign)}
                      >
                        <UsersRound className="size-3.5" />
                        Reutilizar para nova lista
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        asChild
                      >
                        <Link href={`/campanhas/${campaign.id}`}>
                          Abrir
                          <ArrowRight className="size-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
