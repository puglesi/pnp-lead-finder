"use client";

import { MessageSquare } from "lucide-react";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCampaignStore } from "@/store/campaign-store";
import type { Campaign, CampaignLeadEventStatus } from "@/types/campaign";
import type { Lead } from "@/types/lead";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<
  CampaignLeadEventStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "Pendente",
    className: "border-slate-500/40 bg-slate-500/15 text-slate-300",
  },
  failed: {
    label: "Falhou",
    className: "border-red-500/40 bg-red-500/15 text-red-300",
  },
  sent: {
    label: "Enviado",
    className: "border-blue-500/40 bg-blue-500/15 text-blue-300",
  },
  opened: {
    label: "Aberto",
    className: "border-cyan-500/40 bg-cyan-500/15 text-cyan-300",
  },
  clicked: {
    label: "Clicou",
    className: "border-violet-500/40 bg-violet-500/15 text-violet-300",
  },
  replied: {
    label: "Respondeu",
    className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  },
};

function formatShortDate(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface CampaignLeadsTableProps {
  campaign: Campaign;
  leads: Lead[];
  onSelectLead?: (leadId: string) => void;
  selectedLeadId?: string | null;
  showTrackingActions?: boolean;
}

export function CampaignLeadsTable({
  campaign,
  leads,
  onSelectLead,
  selectedLeadId,
  showTrackingActions = true,
}: CampaignLeadsTableProps) {
  const markLeadReplied = useCampaignStore((s) => s.markLeadReplied);
  const statusMap = new Map(
    campaign.leadStatuses.map((s) => [s.leadId, s])
  );

  const handleMarkReply = async (
    e: React.MouseEvent,
    leadId: string,
    email: string
  ) => {
    e.stopPropagation();
    try {
      await markLeadReplied(campaign.id, leadId, email);
      toast.success("Resposta registrada");
    } catch {
      toast.error("Falha ao registrar resposta");
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/25 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">Empresa</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Engajamento</th>
              <th className="px-5 py-3 font-medium">Score</th>
              {showTrackingActions && (
                <th className="px-5 py-3 font-medium">Ações</th>
              )}
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => {
              const ls = statusMap.get(lead.id);
              const status = ls?.status ?? "pending";
              const cfg = STATUS_CONFIG[status];
              const engagement = [
                ls?.openedAt && `Abriu ${formatShortDate(ls.openedAt)}`,
                ls?.clickedAt && `Clicou ${formatShortDate(ls.clickedAt)}`,
                ls?.repliedAt && `Respondeu ${formatShortDate(ls.repliedAt)}`,
              ].filter(Boolean);

              return (
                <tr
                  key={lead.id}
                  onClick={() => onSelectLead?.(lead.id)}
                  className={cn(
                    "border-b border-border/40 transition-colors last:border-0",
                    onSelectLead && "cursor-pointer hover:bg-accent/25",
                    selectedLeadId === lead.id && "bg-primary/5"
                  )}
                >
                  <td className="px-5 py-3.5 font-medium">{lead.company}</td>
                  <td className="px-5 py-3.5 text-emerald-400">{lead.email}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant="outline" className={cn("font-medium", cfg.className)}>
                      {cfg.label}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-muted-foreground">
                    {engagement.length > 0 ? (
                      <ul className="space-y-0.5">
                        {engagement.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-3.5 tabular-nums text-muted-foreground">
                    {lead.aiScore}
                  </td>
                  {showTrackingActions && (
                    <td className="px-5 py-3.5">
                      {lead.email &&
                        status !== "replied" &&
                        ["sent", "opened", "clicked"].includes(status) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={(e) =>
                              handleMarkReply(e, lead.id, lead.email!)
                            }
                          >
                            <MessageSquare className="size-3" />
                            Marcar resposta
                          </Button>
                        )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {leads.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Nenhum lead associado
        </p>
      )}
    </div>
  );
}