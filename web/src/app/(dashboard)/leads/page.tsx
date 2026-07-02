"use client";

import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SavedLeadsTable } from "@/components/leads/saved-leads-table";
import { useLeadStore } from "@/store/lead-store";

export default function LeadsPage() {
  const { savedLeads } = useLeadStore();

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Users className="size-7 text-emerald-400" />
            Meus Leads
          </h2>
          <p className="text-muted-foreground">
            Gerencie e exporte seus leads salvos
          </p>
        </div>
        {savedLeads.length > 0 && (
          <Badge
            variant="success"
            className="px-3 py-1 text-sm"
          >
            {savedLeads.length} salvo{savedLeads.length !== 1 && "s"}
          </Badge>
        )}
      </div>

      <SavedLeadsTable />
    </div>
  );
}