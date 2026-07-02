"use client";

import {
  Building2,
  ChevronRight,
  ExternalLink,
  Globe,
  MapPin,
  Phone,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScoreBadge } from "@/components/results/score-badge";
import { EmailStatus } from "./email-status";
import { LeadRowActions } from "./lead-row-actions";
import { cn } from "@/lib/utils";
import type { Lead } from "@/types/lead";

const thClass =
  "px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap";
const tdClass = "px-5 py-5 align-middle";

interface LeadDataTableProps {
  leads: Lead[];
  mode?: "results" | "saved";
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  onSelectAll?: () => void;
  allSelected?: boolean;
  showSelection?: boolean;
}

export function LeadDataTable({
  leads,
  mode = "results",
  selectedIds = [],
  onToggleSelect,
  onSelectAll,
  allSelected = false,
  showSelection = true,
}: LeadDataTableProps) {
  const selectedSet = new Set(selectedIds);
  const colSpan = showSelection ? 10 : 9;

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 border-b border-border/40 bg-muted/10 px-5 py-2 text-xs text-muted-foreground lg:hidden">
        <ChevronRight className="size-3.5 animate-pulse" />
        Deslize horizontalmente para ver todas as colunas
      </div>

      <div className="overflow-x-auto overscroll-x-contain scroll-smooth">
        <table className="w-full min-w-[1280px] table-fixed border-collapse text-sm">
          <colgroup>
            {showSelection && <col style={{ width: 52 }} />}
            <col style={{ width: 200 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 230 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 240 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 130 }} />
          </colgroup>

          <thead>
            <tr className="border-b border-border bg-muted/20">
              {showSelection && (
                <th className={cn(thClass, "w-[52px]")}>
                  {onSelectAll && (
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={onSelectAll}
                    />
                  )}
                </th>
              )}
              <th className={thClass}>Empresa</th>
              <th className={thClass}>Website</th>
              <th className={thClass}>Email</th>
              <th className={thClass}>Telefone</th>
              <th className={thClass}>Endereço</th>
              <th className={thClass}>Categoria</th>
              <th className={cn(thClass, "text-center")}>Score IA</th>
              <th className={cn(thClass, "text-right")}>Ações</th>
            </tr>
          </thead>

          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td
                  colSpan={colSpan}
                  className="px-5 py-16 text-center text-muted-foreground"
                >
                  Nenhum lead para exibir.
                </td>
              </tr>
            ) : (
              leads.map((lead) => {
                const isSelected = selectedSet.has(lead.id);
                return (
                  <tr
                    key={lead.id}
                    className={cn(
                      "group border-b border-border/40 transition-colors hover:bg-accent/25",
                      isSelected &&
                        "border-l-2 border-l-primary bg-primary/5 hover:bg-primary/10"
                    )}
                  >
                    {showSelection && (
                      <td className={cn(tdClass, "w-[52px]")}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => onToggleSelect?.(lead.id)}
                        />
                      </td>
                    )}

                    <td className={tdClass}>
                      <a
                        href={lead.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2.5 font-medium text-foreground transition-colors hover:text-primary"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 transition-colors group-hover:bg-blue-500/20">
                          <Building2 className="size-4 text-blue-400" />
                        </span>
                        <span className="min-w-0 break-words leading-snug hover:underline">
                          {lead.company}
                        </span>
                      </a>
                    </td>

                    <td className={tdClass}>
                      <a
                        href={lead.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-w-0 items-center gap-1.5 break-all text-blue-400 transition-colors hover:text-blue-300 hover:underline"
                      >
                        <Globe className="size-3.5 shrink-0" />
                        {new URL(lead.website).hostname.replace("www.", "")}
                      </a>
                    </td>

                    <td className={tdClass}>
                      <div className="flex min-w-0 items-start gap-2">
                        <EmailStatus email={lead.email} className="mt-0.5" />
                        {lead.email ? (
                          <span className="min-w-0 break-all text-emerald-400/90 leading-snug">
                            {lead.email}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>

                    <td className={cn(tdClass, "whitespace-nowrap")}>
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Phone className="size-3.5 shrink-0 text-blue-400/70" />
                        {lead.phone}
                      </span>
                    </td>

                    <td className={cn(tdClass, "align-top")}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex min-w-0 items-start gap-2 text-muted-foreground">
                            <MapPin className="mt-0.5 size-3.5 shrink-0" />
                            <span className="min-w-0 break-words text-xs leading-relaxed line-clamp-3">
                              {lead.address}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm">
                          {lead.address}
                        </TooltipContent>
                      </Tooltip>
                    </td>

                    <td className={tdClass}>
                      <Badge
                        variant="outline"
                        className="max-w-full whitespace-normal break-words text-center transition-colors group-hover:border-primary/30"
                      >
                        {lead.category}
                      </Badge>
                    </td>

                    <td className={cn(tdClass, "text-center")}>
                      <div className="flex justify-center">
                        <ScoreBadge score={lead.aiScore} />
                      </div>
                    </td>

                    <td
                      className={cn(
                        tdClass,
                        "sticky right-0 text-right shadow-[-12px_0_20px_-12px_rgba(0,0,0,0.45)] backdrop-blur-sm",
                        isSelected
                          ? "bg-primary/5 group-hover:bg-primary/10"
                          : "bg-card/95 group-hover:bg-accent/30"
                      )}
                    >
                      <LeadRowActions lead={lead} mode={mode} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}