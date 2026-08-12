"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "@/lib/date-utils";
import {
  History,
  ArrowRight,
  ExternalLink,
  Pickaxe,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLeadStore } from "@/store/lead-store";
import { useBatchPipelineStore } from "@/store/batch-pipeline-store";
import { RECENT_SEARCHES_LIMIT } from "@/lib/mode-labels";

export function RecentSearches() {
  const router = useRouter();
  // Never destructure the whole store — partial rehydrate can leave null arrays.
  const recentSearches = useLeadStore((s) => s.recentSearches ?? []);
  const fullSearchHistory = useLeadStore((s) => s.fullSearchHistory ?? []);
  const loadSearchFromHistory = useLeadStore((s) => s.loadSearchFromHistory);
  const openSearchBatchInAgentOne = useLeadStore(
    (s) => s.openSearchBatchInAgentOne
  );
  const clearRecentSearches = useLeadStore((s) => s.clearRecentSearches);

  const handleRowClick = (id: string, keyword: string, location: string) => {
    if (!loadSearchFromHistory(id)) {
      toast.error("Registro não encontrado.");
      return;
    }
    toast.success(`Resultados carregados: ${keyword} em ${location}`);
    router.push("/resultados");
  };

  const handleContinueAgentOne = (
    event: { stopPropagation: () => void },
    id: string,
    keyword: string,
    location: string,
    resultsCount: number
  ) => {
    event.stopPropagation();
    const batchId = openSearchBatchInAgentOne(id);
    if (!batchId) {
      toast.error(
        "Sem leads salvos neste registro para continuar no Agente 1."
      );
      return;
    }
    useBatchPipelineStore.getState().setActiveBatch(batchId);
    useBatchPipelineStore.getState().updateBatchStage(batchId, "garimpo");
    toast.success(
      `Lote aberto: ${keyword} · ${location} · ${resultsCount} leads`
    );
    router.push(`/agente-1?batchId=${encodeURIComponent(batchId)}`);
  };

  const handleClear = () => {
    clearRecentSearches();
    toast.success(
      `Recentes limpas — ${fullSearchHistory.length} buscas no histórico completo`,
      { icon: "🗑️", duration: 4500 }
    );
  };

  if (recentSearches.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <History className="mb-4 size-12 text-muted-foreground/50" />
          <p className="font-medium">Nenhuma busca recente</p>
          <p className="mt-1 text-sm text-muted-foreground">
            As últimas {RECENT_SEARCHES_LIMIT} buscas aparecem aqui. O histórico
            completo permanece em Histórico de Buscas.
          </p>
          {fullSearchHistory.length > 0 && (
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <Link href="/historico">
                Ver histórico completo ({fullSearchHistory.length})
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="size-5 text-blue-400" />
            Buscas Recentes
          </CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Últimas {RECENT_SEARCHES_LIMIT} · histórico completo:{" "}
            <Link href="/historico" className="text-primary hover:underline">
              {fullSearchHistory.length} buscas
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            Limpar Recentes
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/historico">
              Histórico completo
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-3 pr-4 font-medium">Fila de setores</th>
                <th className="pb-3 pr-4 font-medium">Localização</th>
                <th className="pb-3 pr-4 font-medium">Leads</th>
                <th className="pb-3 pr-4 font-medium">Data</th>
                <th className="pb-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {recentSearches.map((search) => (
                <tr
                  key={search.id}
                  onClick={() =>
                    handleRowClick(
                      search.id,
                      search.keyword,
                      search.location
                    )
                  }
                  className="group cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/40"
                >
                  <td className="max-w-[240px] truncate py-3 pr-4 font-medium group-hover:text-primary">
                    {search.keyword}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {search.location}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant="secondary">{search.resultsCount}</Badge>
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {formatDistanceToNow(search.date)}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        className="h-8"
                        onClick={(event) =>
                          handleContinueAgentOne(
                            event,
                            search.id,
                            search.keyword,
                            search.location,
                            search.resultsCount
                          )
                        }
                      >
                        <Pickaxe className="size-3.5" />
                        Continuar no Agente 1
                      </Button>
                      <ExternalLink className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}