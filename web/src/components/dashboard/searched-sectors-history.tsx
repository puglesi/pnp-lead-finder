"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, MapPin, Search, X } from "lucide-react";
import toast from "react-hot-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLeadStore } from "@/store/lead-store";
import { useSettingsStore } from "@/store/settings-store";
import { useUsageStore } from "@/store/usage-store";
import {
  estimateSerpApiCalls,
  getSerpApiPagesPerSector,
} from "@/lib/search/volume";
import { cn } from "@/lib/utils";

interface SearchedSectorsHistoryProps {
  compact?: boolean;
  className?: string;
}

export function SearchedSectorsHistory({
  compact,
  className,
}: SearchedSectorsHistoryProps) {
  const router = useRouter();
  const sectorHistory = useLeadStore((s) => s.sectorHistory ?? []);
  const lastBulkSearchLocation = useLeadStore(
    (s) => s.lastBulkSearchLocation ?? ""
  );
  const performBulkSearch = useLeadStore((s) => s.performBulkSearch);
  const isSearching = useLeadStore((s) => s.isSearching);
  const useMaxLeads = useSettingsStore((s) => s.useMaxLeads);
  const serpapiDeepPagination = useSettingsStore((s) => s.serpapiDeepPagination);
  const provider = useSettingsStore((s) => s.provider);
  const searchProfile = useSettingsStore((s) => s.searchProfile);
  const getEffectiveMaxResults = useSettingsStore(
    (s) => s.getEffectiveMaxResults
  );
  const remaining = useUsageStore((s) => s.getRemainingSerpApi());
  const creditExhausted = useUsageStore((s) => s.creditExhausted);

  const [filter, setFilter] = useState("");
  const [loadingSector, setLoadingSector] = useState<string | null>(null);

  const filteredSectors = useMemo(() => {
    const list = Array.isArray(sectorHistory) ? sectorHistory : [];
    const query = filter.trim().toLowerCase();
    if (!query) return list;
    return list.filter((sector) =>
      String(sector).toLowerCase().includes(query)
    );
  }, [filter, sectorHistory]);

  const searchLocation =
    (typeof lastBulkSearchLocation === "string"
      ? lastBulkSearchLocation
      : ""
    ).trim() || "London";

  const runSingleSectorSearch = async (sector: string) => {
    if (isSearching || loadingSector) return;

    const serpPagination = {
      useMaxLeads,
      deepPagination: serpapiDeepPagination,
    };
    const effectiveMax = getEffectiveMaxResults();
    const estimatedCalls = estimateSerpApiCalls(
      1,
      provider,
      searchProfile,
      effectiveMax,
      serpPagination
    );

    if (
      searchProfile === "serpapi" &&
      provider === "serpapi" &&
      estimatedCalls > 0 &&
      estimatedCalls > remaining &&
      !creditExhausted
    ) {
      toast.error(
        `Saldo insuficiente: ${remaining} buscas restantes, operação precisa de ${estimatedCalls}.`,
        { duration: 5000 }
      );
      return;
    }

    setLoadingSector(sector);
    router.push("/resultados");

    try {
      await performBulkSearch(sector, searchLocation);
      const summary = useLeadStore.getState().bulkProgress.searchSummary;
      if (summary) {
        const timeSec = (summary.elapsedMs / 1000).toFixed(1);
        toast.success(
          `${sector} · ${summary.leadsFound} leads · ${timeSec}s`,
          { icon: "🎯", duration: 5000 }
        );
      } else {
        toast.success(`Busca iniciada: ${sector} em ${searchLocation}`, {
          icon: "🎯",
        });
      }
    } catch {
      toast.error(`Erro ao buscar ${sector}. Tente novamente.`);
    } finally {
      setLoadingSector(null);
    }
  };

  if (!Array.isArray(sectorHistory) || sectorHistory.length === 0) {
    return (
      <Card className={cn("border-border/60", className)}>
        <CardContent
          className={cn(
            "flex flex-col items-center justify-center text-center",
            compact ? "py-10" : "py-14"
          )}
        >
          <Layers className="mb-3 size-10 text-muted-foreground/40" />
          <p className="font-medium">Nenhum setor no histórico</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Após sua primeira busca em volume, os setores aparecerão aqui como
            tags clicáveis.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("border-border/60", className)}>
      <CardHeader className={cn("space-y-3", compact && "pb-3")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Layers className="size-5 text-violet-400" />
              Setores Já Buscados
            </CardTitle>
            {!compact && (
              <p className="mt-1 text-sm text-muted-foreground">
                Histórico único e persistente — não é apagado ao limpar buscas
                recentes
              </p>
            )}
          </div>
          <Badge variant="secondary" className="tabular-nums">
            {sectorHistory.length} setores
          </Badge>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar setores..."
            className="h-9 bg-background/50 pl-9 pr-9 text-sm"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Limpar filtro"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {filteredSectors.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum setor corresponde a &quot;{filter}&quot;
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {filteredSectors.map((sector) => {
              const isLoading = loadingSector === sector;
              return (
                <button
                  key={sector}
                  type="button"
                  disabled={isSearching || Boolean(loadingSector)}
                  onClick={() => runSingleSectorSearch(sector)}
                  title={`Buscar apenas ${sector} em ${searchLocation}`}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-all",
                    "border-violet-500/25 bg-violet-500/5 hover:border-violet-400/50 hover:bg-violet-500/15 hover:text-violet-200",
                    isLoading && "border-violet-400/60 bg-violet-500/20 text-violet-100",
                    (isSearching || loadingSector) &&
                      !isLoading &&
                      "cursor-not-allowed opacity-50"
                  )}
                >
                  {isLoading ? (
                    <span className="size-3 animate-spin rounded-full border-2 border-violet-300 border-t-transparent" />
                  ) : (
                    <Layers className="size-3.5 opacity-60" />
                  )}
                  {sector}
                </button>
              );
            })}
          </div>
        )}

        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          Clique em um setor para iniciar busca só com ele em{" "}
          <strong className="text-foreground">{searchLocation}</strong>
          {searchProfile === "serpapi" && provider === "serpapi" && (
              <span>
                · ~{getSerpApiPagesPerSector({
                  useMaxLeads,
                  deepPagination: serpapiDeepPagination,
                  leadsPerSector: getEffectiveMaxResults(),
                })}{" "}
                buscas/setor
              </span>
            )}
        </p>
      </CardContent>
    </Card>
  );
}