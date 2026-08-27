"use client";

import { useMemo, useState } from "react";
import {
  Bookmark,
  CheckSquare,
  Filter,
  Search,
  Sparkles,
  Square,
  Upload,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { hasValidEmail } from "@/lib/email-templates";
import type { Lead } from "@/types/lead";
import { cn } from "@/lib/utils";
import { useEmailBlocklistStore } from "@/store/email-blocklist-store";
import { isEmailBlocked } from "@/lib/email-blocklist";

export type LeadPickerSource = "saved" | "recent" | "imported";

interface LeadPickerProps {
  savedLeads: Lead[];
  recentLeads: Lead[];
  importedLeads?: Lead[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  recentSearchLabel?: string;
}

export function LeadPicker({
  savedLeads,
  recentLeads,
  importedLeads = [],
  selectedIds,
  onSelectionChange,
  recentSearchLabel,
}: LeadPickerProps) {
  const [source, setSource] = useState<LeadPickerSource>(() => {
    if (importedLeads.length > 0) return "imported";
    if (savedLeads.length > 0) return "saved";
    return "recent";
  });
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [minScore, setMinScore] = useState(0);
  const blockedEntries = useEmailBlocklistStore((s) => s.entries);

  const pool =
    source === "saved"
      ? savedLeads
      : source === "imported"
        ? importedLeads
        : recentLeads;

  const categories = useMemo(() => {
    const set = new Set(pool.map((l) => l.category).filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [pool]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool.filter((lead) => {
      if (!hasValidEmail(lead.email)) return false;
      // Blocked contacts stay in history but never enter campaign prospect queues.
      if (
        isEmailBlocked(
          blockedEntries,
          lead.normalizedEmail ?? lead.email
        )
      ) {
        return false;
      }
      if (lead.aiScore < minScore) return false;
      if (categoryFilter !== "all" && lead.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        lead.company.toLowerCase().includes(q) ||
        (lead.email?.toLowerCase().includes(q) ?? false) ||
        lead.category.toLowerCase().includes(q) ||
        lead.address.toLowerCase().includes(q)
      );
    });
  }, [pool, query, categoryFilter, minScore, blockedEntries]);

  const toggleLead = (id: string) => {
    onSelectionChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
    );
  };

  const selectAllVisible = () => {
    const visibleIds = filtered.map((l) => l.id);
    const merged = new Set([...selectedIds, ...visibleIds]);
    onSelectionChange(Array.from(merged));
  };

  const clearVisible = () => {
    const visibleSet = new Set(filtered.map((l) => l.id));
    onSelectionChange(selectedIds.filter((id) => !visibleSet.has(id)));
  };

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((l) => selectedIds.includes(l.id));

  return (
    <Card className="border-border/60">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="size-4 text-blue-400" />
            Selecionar Leads
          </CardTitle>
          <Badge variant="secondary" className="tabular-nums">
            {selectedIds.length} selecionados
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSource("saved")}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all",
              source === "saved"
                ? "border-blue-400/50 bg-blue-500/15 text-blue-900 dark:text-blue-100"
                : "border-border/60 text-muted-foreground hover:border-blue-400/30"
            )}
          >
            <Bookmark className="size-3.5" />
            Meus Leads
            <Badge variant="outline" className="h-5 text-[10px]">
              {savedLeads.filter((l) => hasValidEmail(l.email)).length}
            </Badge>
          </button>
          <button
            type="button"
            onClick={() => setSource("recent")}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all",
              source === "recent"
                ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100"
                : "border-border/60 text-muted-foreground hover:border-emerald-400/30"
            )}
          >
            <Zap className="size-3.5" />
            Busca Recente
            <Badge variant="outline" className="h-5 text-[10px]">
              {recentLeads.filter((l) => hasValidEmail(l.email)).length}
            </Badge>
          </button>
          <button
            type="button"
            onClick={() => setSource("imported")}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all",
              source === "imported"
                ? "border-violet-400/50 bg-violet-500/15 text-violet-900 dark:text-violet-100"
                : "border-border/60 text-muted-foreground hover:border-violet-400/30"
            )}
          >
            <Upload className="size-3.5" />
            Importados
            <Badge variant="outline" className="h-5 text-[10px]">
              {importedLeads.filter((l) => hasValidEmail(l.email)).length}
            </Badge>
          </button>
        </div>

        {source === "recent" && recentSearchLabel && (
          <p className="text-xs text-muted-foreground">{recentSearchLabel}</p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filtrar por empresa, email, categoria..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-background/50 pl-10"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-all",
                categoryFilter === cat
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/60 text-muted-foreground hover:border-primary/30"
              )}
            >
              {cat === "all" ? "Todas categorias" : cat}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Sparkles className="size-3" />
              Score mínimo: {minScore}
            </span>
            <span>{filtered.length} com email</span>
          </div>
          <Slider
            value={minScore}
            onChange={setMinScore}
            min={0}
            max={90}
            step={5}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={allVisibleSelected ? clearVisible : selectAllVisible}
            disabled={filtered.length === 0}
          >
            {allVisibleSelected ? (
              <Square className="size-3.5" />
            ) : (
              <CheckSquare className="size-3.5" />
            )}
            {allVisibleSelected ? "Desmarcar visíveis" : "Selecionar visíveis"}
          </Button>
        </div>

        <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-border/40 p-2">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {pool.length === 0
                ? source === "saved"
                  ? "Nenhum lead salvo. Salve leads em Meus Leads ou use a busca recente."
                  : source === "imported"
                    ? "Nenhum lead importado. Use CSV ou cole emails acima."
                    : "Nenhum lead na busca recente. Execute uma busca primeiro."
                : "Nenhum lead corresponde aos filtros."}
            </p>
          ) : (
            filtered.map((lead) => (
              <label
                key={lead.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all",
                  selectedIds.includes(lead.id)
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/40 hover:bg-accent/30"
                )}
              >
                <Checkbox
                  checked={selectedIds.includes(lead.id)}
                  onCheckedChange={() => toggleLead(lead.id)}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{lead.company}</p>
                  <p className="truncate text-xs text-emerald-700 dark:text-emerald-400">
                    {lead.email}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {lead.address}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      lead.aiScore >= 85 && "border-amber-500/40 text-amber-800 dark:text-amber-300"
                    )}
                  >
                    {lead.aiScore}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {lead.category}
                  </span>
                </div>
              </label>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
