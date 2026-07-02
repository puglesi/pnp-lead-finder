"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Plus, SearchX, X } from "lucide-react";
import toast from "react-hot-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BulkSearchProgress } from "@/components/dashboard/bulk-search-progress";
import { LeadDataTable } from "@/components/leads/lead-data-table";
import { SearchLoading } from "./search-loading";
import {
  ResultsFilters,
  type EmailFilter,
  type ScoreFilter,
} from "./results-filters";
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

export function LeadsTable() {
  const {
    currentLeads,
    currentKeyword,
    currentLocation,
    isSearching,
    selectedLeadIds,
    toggleLeadSelection,
    selectAllLeads,
    clearSelection,
    getSelectedLeads,
    generateMoreLeads,
  } = useLeadStore();

  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [emailFilter, setEmailFilter] = useState<EmailFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const categories = useMemo(
    () => [...new Set(currentLeads.map((l) => l.category))],
    [currentLeads]
  );

  const filteredLeads = useMemo(
    () =>
      filterLeads(currentLeads, scoreFilter, emailFilter, categoryFilter),
    [currentLeads, scoreFilter, emailFilter, categoryFilter]
  );

  const selectedSet = new Set(selectedLeadIds);
  const allSelected =
    filteredLeads.length > 0 &&
    filteredLeads.every((l) => selectedSet.has(l.id));

  const handleSelectAll = () => {
    if (allSelected) clearSelection();
    else selectAllLeads(filteredLeads.map((l) => l.id));
  };

  const handleExport = () => {
    const toExport =
      selectedLeadIds.length > 0 ? getSelectedLeads() : filteredLeads;
    if (toExport.length === 0) {
      toast.error("Nenhum lead para exportar.");
      return;
    }
    const filename = `pnp-leads-${currentKeyword || "export"}-${currentLocation || "uk"}-${new Date().toISOString().slice(0, 10)}.csv`;
    exportLeadsToCSV(toExport, filename);
    toast.success(
      `Arquivo ${filename} baixado com ${toExport.length} leads!`,
      { icon: "📥", duration: 5000 }
    );
  };

  const handleClearFilters = () => {
    setScoreFilter("all");
    setEmailFilter("all");
    setCategoryFilter("all");
  };

  if (isSearching) {
    return <SearchLoading />;
  }

  if (currentLeads.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <SearchX className="mb-4 size-16 text-muted-foreground/40" />
          <h3 className="text-lg font-semibold">Nenhum resultado ainda</h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Faça uma busca no dashboard para encontrar empresas B2B com dados
            enriquecidos por IA.
          </p>
          <div className="mt-6 flex gap-3">
            <Button variant="outline" asChild>
              <Link href="/">
                <ArrowLeft className="size-4" />
                Dashboard
              </Link>
            </Button>
            <Button asChild>
              <Link href="/busca">Nova Busca</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {!isSearching && currentLeads.length > 0 && (
        <BulkSearchProgress />
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Link
              href="/"
              className="inline-flex items-center gap-1 transition-colors hover:text-primary"
            >
              <ArrowLeft className="size-3.5" />
              Dashboard
            </Link>
            <span>/</span>
            <Link href="/busca" className="transition-colors hover:text-primary">
              Nova Busca
            </Link>
            <span>/</span>
            <span className="text-foreground">Resultados</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            {currentKeyword}{" "}
            <span className="font-normal text-muted-foreground">
              em {currentLocation}
            </span>
          </h2>
          <p className="text-sm text-muted-foreground">
            {filteredLeads.length} de {currentLeads.length} empresas
            {selectedLeadIds.length > 0 && (
              <span className="ml-2 text-primary">
                · {selectedLeadIds.length} selecionados
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const added = generateMoreLeads(50);
              if (added > 0) {
                toast.success(`+${added} leads adicionados!`, { icon: "✨" });
              }
            }}
          >
            <Plus className="size-3.5" />
            Gerar Mais
          </Button>
          {selectedLeadIds.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearSelection}>
              <X className="size-3.5" />
              Limpar seleção
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleExport}
                className="bg-emerald-600 shadow-lg shadow-emerald-500/20 hover:bg-emerald-500"
              >
                <Download className="size-4" />
                Exportar CSV
                {selectedLeadIds.length > 0 && ` (${selectedLeadIds.length})`}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Baixar arquivo .csv com Empresa, Website, Email, Telefone,
              Endereço, Categoria e Score IA
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
            totalCount={currentLeads.length}
            filteredCount={filteredLeads.length}
            onScoreChange={setScoreFilter}
            onEmailChange={setEmailFilter}
            onCategoryChange={setCategoryFilter}
            onClear={handleClearFilters}
          />
        </aside>

        <Card className="min-w-0 flex-1 overflow-hidden border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 px-6 py-5">
            <CardTitle className="text-base">Resultados da Busca</CardTitle>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={handleSelectAll}
                id="select-all"
              />
              <label
                htmlFor="select-all"
                className="cursor-pointer text-sm text-muted-foreground"
              >
                Selecionar todos
              </label>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredLeads.length === 0 ? (
              <p className="p-12 text-center text-muted-foreground">
                Nenhum lead corresponde aos filtros selecionados.
              </p>
            ) : (
              <LeadDataTable
                leads={filteredLeads}
                mode="results"
                selectedIds={selectedLeadIds}
                onToggleSelect={toggleLeadSelection}
                onSelectAll={handleSelectAll}
                allSelected={allSelected}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}