"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "@/lib/date-utils";
import {
  Download,
  ExternalLink,
  History,
  MapPin,
  Search,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLeadStore } from "@/store/lead-store";
import { RECENT_SEARCHES_LIMIT } from "@/lib/mode-labels";

export function FullSearchHistory() {
  const router = useRouter();
  // Exact field: fullSearchHistory null after legacy rehydrate → .filter/.length crash.
  const fullSearchHistory = useLeadStore((s) => s.fullSearchHistory ?? []);
  const loadSearchFromHistory = useLeadStore((s) => s.loadSearchFromHistory);
  const exportSearchFromHistory = useLeadStore(
    (s) => s.exportSearchFromHistory
  );

  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const list = Array.isArray(fullSearchHistory) ? fullSearchHistory : [];
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        (r?.keyword ?? "").toLowerCase().includes(q) ||
        (r?.location ?? "").toLowerCase().includes(q)
    );
  }, [filter, fullSearchHistory]);

  const handleView = (id: string, keyword: string, location: string) => {
    if (!loadSearchFromHistory(id)) {
      toast.error("Registro não encontrado no histórico.");
      return;
    }
    toast.success(`Resultados: ${keyword} em ${location}`);
    router.push("/resultados");
  };

  const handleExport = (id: string) => {
    if (exportSearchFromHistory(id)) {
      toast.success("CSV exportado novamente!", { icon: "📥" });
      return;
    }
    toast.error(
      "Sem snapshot de leads neste registro — use Ver Resultados primeiro."
    );
  };

  if (fullSearchHistory.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <History className="mb-4 size-12 text-muted-foreground/40" />
          <p className="font-medium">Histórico completo vazio</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Todas as suas buscas ficam guardadas aqui permanentemente, mesmo
            após limpar &quot;Buscas Recentes&quot; ({RECENT_SEARCHES_LIMIT}{" "}
            últimas no Dashboard).
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <History className="size-5 text-blue-400" />
              Histórico de Buscas
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {fullSearchHistory.length} buscas guardadas · persistente após
              limpar recentes
            </p>
          </div>
          <Badge variant="secondary" className="tabular-nums">
            {filtered.length} exibidas
          </Badge>
        </div>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar por setor ou localização..."
            className="h-9 bg-background/50 pl-9 pr-9"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma busca corresponde a &quot;{filter}&quot;
          </p>
        ) : (
          filtered.map((record) => (
            <div
              key={record.id}
              className="rounded-xl border border-border/60 bg-background/30 p-4 transition-colors hover:border-border"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="font-medium leading-snug">{record.keyword}</p>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" />
                      {record.location}
                    </span>
                    <Badge variant="secondary" className="tabular-nums">
                      {record.resultsCount} leads
                    </Badge>
                    <span className="text-xs">
                      {formatDistanceToNow(record.date)}
                    </span>
                    {record.leads?.length ? (
                      <Badge variant="outline" className="text-[10px]">
                        snapshot salvo
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() =>
                      handleView(record.id, record.keyword, record.location)
                    }
                  >
                    <ExternalLink className="size-3.5" />
                    Ver Resultados
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExport(record.id)}
                    disabled={!record.leads?.length}
                  >
                    <Download className="size-3.5" />
                    Exportar novamente
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}