"use client";

import { Bookmark, BookmarkCheck, Copy, ExternalLink, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLeadStore } from "@/store/lead-store";
import type { Lead } from "@/types/lead";

interface LeadRowActionsProps {
  lead: Lead;
  mode?: "results" | "saved";
  onRemove?: (id: string) => void;
}

export function LeadRowActions({
  lead,
  mode = "results",
}: LeadRowActionsProps) {
  const { saveLead, isLeadSaved, removeSavedLead } = useLeadStore();
  const saved = isLeadSaved(lead);

  const handleCopyEmail = async () => {
    if (!lead.email) {
      toast.error("Este lead não possui email.");
      return;
    }
    await navigator.clipboard.writeText(lead.email);
    toast.success(`Email copiado: ${lead.email}`, { icon: "📋" });
  };

  const handleSave = () => {
    if (mode === "saved") return;
    if (saved) {
      toast("Este lead já está em Meus Leads", { icon: "⭐" });
      return;
    }
    const ok = saveLead(lead);
    if (ok) {
      toast.success(`${lead.company} salvo em Meus Leads!`, { icon: "💾" });
    }
  };

  const handleRemove = () => {
    removeSavedLead(lead.id);
    toast.success(`${lead.company} removido dos seus leads.`, { icon: "🗑️" });
  };

  return (
    <div className="flex items-center justify-end gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-emerald-400"
            onClick={handleCopyEmail}
            disabled={!lead.email}
          >
            <Copy className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {lead.email ? "Copiar email" : "Sem email"}
        </TooltipContent>
      </Tooltip>

      {mode === "results" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-amber-400"
              onClick={handleSave}
            >
              {saved ? (
                <BookmarkCheck className="size-3.5 text-amber-400" />
              ) : (
                <Bookmark className="size-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {saved ? "Já salvo" : "Salvar lead"}
          </TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-red-400"
              onClick={handleRemove}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remover lead</TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-blue-400"
            asChild
          >
            <a
              href={lead.website}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Ver site</TooltipContent>
      </Tooltip>
    </div>
  );
}