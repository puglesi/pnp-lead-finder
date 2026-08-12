"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Megaphone, Trash2, Users } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LeadDataTable } from "./lead-data-table";
import {
  ResultsFilters,
  type EmailFilter,
  type ScoreFilter,
} from "@/components/results/results-filters";
import { useLeadStore } from "@/store/lead-store";
import { exportLeadsToCSV } from "@/lib/csv-export";
import type { Lead } from "@/types/lead";

function filterLeads(
  leads: Lead[],
  scoreFilter: ScoreFilter,
  emailFilter: EmailFilter,
  categoryFilter: string
) {
  return leads.filter((lead) => {
    if (scoreFilter === "high" && lead.aiScore < 85) return false;
    if (scoreFilter === "medium" && (lead.aiScore < 70 || lead.aiScore >= 85))
      return false;
    if (scoreFilter === "low" && lead.aiScore >= 70) return false;
    if (emailFilter === "with" && !lead.email) return false;
    if (emailFilter === "without" && lead.email) return false;
    if (categoryFilter !== "all" && lead.category !== categoryFilter)
      return false;
    return true;
  });
}

export function SavedLeadsTable() {
  // Never whole-store destructure — savedLeads can be null before merge repair.
  const savedLeads = useLeadStore((s) => s.savedLeads ?? []);
  const clearAllSavedLeads = useLeadStore((s) => s.clearAllSavedLeads);
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [emailFilter, setEmailFilter] = useState<EmailFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const categories = useMemo(
    () =>
      [
        ...new Set(
          (Array.isArray(savedLeads) ? savedLeads : []).map(
            (l) => l?.category
          )
        ),
      ].filter((c): c is string => Boolean(c)),
    [savedLeads]
  );

  const filteredLeads = useMemo(
    () =>
      filterLeads(savedLeads, scoreFilter, emailFilter, categoryFilter),
    [savedLeads, scoreFilter, emailFilter, categoryFilter]
  );

  const handleExport = () => {
    if (filteredLeads.length === 0) {
      toast.error("Nenhum lead para exportar.");
      return;
    }
    const filename = `pnp-meus-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    exportLeadsToCSV(filteredLeads, filename);
    toast.success(
      `Arquivo ${filename} baixado com ${filteredLeads.length} leads!`,
      { icon: "📥", duration: 5000 }
    );
  };

  const handleClearAll = () => {
    if (savedLeads.length === 0) return;
    clearAllSavedLeads();
    toast.success("Todos os leads salvos foram removidos.", { icon: "🗑️" });
  };

  const handleClearFilters = () => {
    setScoreFilter("all");
    setEmailFilter("all");
    setCategoryFilter("all");
  };

  if (savedLeads.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="mb-4 size-16 text-muted-foreground/40" />
          <h3 className="text-lg font-semibold">Nenhum lead salvo</h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Salve leads diretamente da página de resultados usando o ícone de
            bookmark em cada linha.
          </p>
          <Button asChild className="mt-6">
            <Link href="/busca">Fazer Nova Busca</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {filteredLeads.length} de {savedLeads.length} leads salvos
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/campanhas/nova">
              <Megaphone className="size-3.5" />
              Criar Campanha
            </Link>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={handleClearAll}>
                <Trash2 className="size-3.5" />
                Limpar todos
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remover todos os leads salvos</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleExport}
                className="bg-emerald-600 shadow-lg shadow-emerald-500/20 hover:bg-emerald-500"
              >
                <Download className="size-4" />
                Exportar CSV
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Baixar arquivo .csv com todos os leads salvos filtrados
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-56 xl:w-64">
          <ResultsFilters
            scoreFilter={scoreFilter}
            emailFilter={emailFilter}
            categoryFilter={categoryFilter}
            categories={categories}
            totalCount={savedLeads.length}
            filteredCount={filteredLeads.length}
            onScoreChange={setScoreFilter}
            onEmailChange={setEmailFilter}
            onCategoryChange={setCategoryFilter}
            onClear={handleClearFilters}
          />
        </aside>

        <Card className="min-w-0 flex-1 overflow-hidden border-border/60 shadow-sm">
          <CardHeader className="border-b border-border/60 px-6 py-5">
            <CardTitle className="text-base">Leads Salvos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <LeadDataTable
              leads={filteredLeads}
              mode="saved"
              showSelection={false}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}