"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Database, Eye, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "@/lib/date-utils";
import { useLeadStore } from "@/store/lead-store";
import type { PersistedSearchBatch } from "@/types/search";

export function SearchRecovery() {
  const isSearching = useLeadStore((state) => state.isSearching);
  const getRecoverableSearchBatch = useLeadStore(
    (state) => state.getRecoverableSearchBatch
  );
  const loadPersistedSearchBatch = useLeadStore(
    (state) => state.loadPersistedSearchBatch
  );
  const resumeBulkSearch = useLeadStore((state) => state.resumeBulkSearch);
  const [batch, setBatch] = useState<PersistedSearchBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<"view" | "resume" | null>(null);
  const [mountedAt] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    getRecoverableSearchBatch()
      .then((candidate) => {
        if (!cancelled) setBatch(candidate);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(
            error instanceof Error
              ? `Falha ao ler buscas salvas: ${error.message}`
              : "Falha ao ler buscas salvas"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getRecoverableSearchBatch, isSearching]);

  const stale = batch
    ? mountedAt - new Date(batch.lastActivityAt).getTime() > 3 * 60_000
    : false;

  if (loading || isSearching || !batch) return null;

  const handleView = async () => {
    setActing("view");
    try {
      const loaded = await loadPersistedSearchBatch(batch.batchId);
      if (!loaded) throw new Error("Lote persistido não encontrado");
      toast.success(`${batch.deduplicatedLeads} resultados salvos carregados.`);
      setBatch(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao abrir lote");
    } finally {
      setActing(null);
    }
  };

  const handleResume = async () => {
    setActing("resume");
    try {
      await resumeBulkSearch(batch.batchId);
      setBatch(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao retomar busca"
      );
    } finally {
      setActing(null);
    }
  };

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-5 text-amber-400" />
          Busca interrompida encontrada
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">{batch.completedSectors}/{batch.sectors.length} setores concluídos</Badge>
          <Badge variant="outline">{batch.pendingSectors} pendentes</Badge>
          <Badge variant="outline">{batch.deduplicatedLeads} leads salvos</Badge>
          <Badge variant="outline">Etapa: {batch.currentStage}</Badge>
        </div>
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>{batch.sectorsInput} · {batch.location}</p>
          <p>Última atividade: {formatDistanceToNow(batch.lastActivityAt)}</p>
          {stale && (
            <p className="font-medium text-amber-300">
              Processamento interrompido. Os resultados já obtidos estão salvos.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void handleResume()} disabled={acting !== null}>
            <RotateCcw className="size-4" />
            {acting === "resume" ? "Retomando…" : "Retomar busca"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void handleView()}
            disabled={acting !== null}
          >
            <Eye className="size-4" />
            Ver resultados salvos
          </Button>
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-emerald-300">
            <Database className="size-3.5" />
            Salvo automaticamente ✓
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
