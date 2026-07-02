"use client";

import { Filter, Mail, MailX, RotateCcw, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type ScoreFilter = "all" | "high" | "medium" | "low";
export type EmailFilter = "all" | "with" | "without";

interface ResultsFiltersProps {
  scoreFilter: ScoreFilter;
  emailFilter: EmailFilter;
  categoryFilter: string;
  categories: string[];
  totalCount: number;
  filteredCount: number;
  onScoreChange: (value: ScoreFilter) => void;
  onEmailChange: (value: EmailFilter) => void;
  onCategoryChange: (value: string) => void;
  onClear: () => void;
}

const scoreOptions: { value: ScoreFilter; label: string; color: string }[] = [
  { value: "all", label: "Todos", color: "border-border" },
  { value: "high", label: "Alto (85+)", color: "border-emerald-500/50 text-emerald-400" },
  { value: "medium", label: "Médio (70-84)", color: "border-amber-500/50 text-amber-400" },
  { value: "low", label: "Baixo (<70)", color: "border-red-500/50 text-red-400" },
];

const emailOptions: { value: EmailFilter; label: string; icon: typeof Mail }[] = [
  { value: "all", label: "Todos", icon: Filter },
  { value: "with", label: "Com email", icon: Mail },
  { value: "without", label: "Sem email", icon: MailX },
];

function FilterPill({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border px-3 py-2 text-left text-sm transition-all hover:bg-accent/50",
        active
          ? "border-primary/50 bg-primary/10 font-medium text-primary shadow-sm"
          : "border-border/60 text-muted-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

export function ResultsFilters({
  scoreFilter,
  emailFilter,
  categoryFilter,
  categories,
  totalCount,
  filteredCount,
  onScoreChange,
  onEmailChange,
  onCategoryChange,
  onClear,
}: ResultsFiltersProps) {
  const hasActiveFilters =
    scoreFilter !== "all" ||
    emailFilter !== "all" ||
    categoryFilter !== "all";

  return (
    <Card className="sticky top-6 border-border/60 bg-card/80 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Filter className="size-4 text-blue-400" />
          Filtros
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {filteredCount} de {totalCount} leads
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="size-3" />
            Score IA
          </p>
          <div className="space-y-1.5">
            {scoreOptions.map((opt) => (
              <FilterPill
                key={opt.value}
                active={scoreFilter === opt.value}
                onClick={() => onScoreChange(opt.value)}
                className={scoreFilter === opt.value ? opt.color : undefined}
              >
                {opt.label}
              </FilterPill>
            ))}
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Categoria
          </p>
          <div className="space-y-1.5">
            <FilterPill
              active={categoryFilter === "all"}
              onClick={() => onCategoryChange("all")}
            >
              Todas
            </FilterPill>
            {categories.map((cat) => (
              <FilterPill
                key={cat}
                active={categoryFilter === cat}
                onClick={() => onCategoryChange(cat)}
              >
                {cat}
              </FilterPill>
            ))}
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Email
          </p>
          <div className="space-y-1.5">
            {emailOptions.map((opt) => {
              const Icon = opt.icon;
              return (
                <FilterPill
                  key={opt.value}
                  active={emailFilter === opt.value}
                  onClick={() => onEmailChange(opt.value)}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="size-3.5" />
                    {opt.label}
                  </span>
                </FilterPill>
              );
            })}
          </div>
        </div>

        {hasActiveFilters && (
          <>
            <Separator />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={onClear}
            >
              <RotateCcw className="size-3.5" />
              Limpar filtros
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}