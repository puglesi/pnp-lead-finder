import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CampaignStatus } from "@/types/campaign";

const config: Record<
  CampaignStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "Rascunho",
    className: "border-slate-500/40 bg-slate-500/15 text-slate-300",
  },
  saved: {
    label: "Salva",
    className: "border-sky-500/40 bg-sky-500/15 text-sky-300",
  },
  active: {
    label: "Em andamento",
    className: "border-blue-500/40 bg-blue-500/15 text-blue-300",
  },
  paused: {
    label: "Pausada",
    className: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  },
  completed: {
    label: "Concluída",
    className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  },
  archived: {
    label: "Arquivada",
    className: "border-zinc-500/40 bg-zinc-500/15 text-zinc-300",
  },
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const entry = config[status] ?? config.draft;
  const { label, className } = entry;
  return (
    <Badge variant="outline" className={cn("font-medium", className)}>
      {label}
    </Badge>
  );
}
