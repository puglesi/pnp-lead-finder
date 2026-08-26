"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  RefreshCw,
  RotateCcw,
  Save,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchLocalDataHealth,
} from "@/lib/local-data-client";
import { LOCAL_DATA_HEALTH_CHANGE_EVENT } from "@/components/providers/local-data-bootstrap";
import type { LocalDataHealth } from "@/types/local-data";

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function DataIntegrityCard() {
  const [health, setHealth] = useState<LocalDataHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setHealth(await fetchLocalDataHealth());
    } catch (error) {
      setHealth((current) => ({
        ok: false,
        status: "error",
        writable: false,
        message: error instanceof Error ? error.message : "Banco indisponível.",
        databasePath: current?.databasePath ?? null,
        backupPath: current?.backupPath ?? null,
        lastBackup: current?.lastBackup ?? null,
        sizeBytes: current?.sizeBytes ?? 0,
        migrationVersion: current?.migrationVersion ?? 0,
        counts: current?.counts ?? {
          leads: 0,
          campaigns: 0,
          searchHistory: 0,
          confirmedSends: 0,
          blocklist: 0,
          templates: 0,
        },
        signatures: current?.signatures ?? {
          "panek-puglesi": false,
          modeclean: false,
        },
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const listener = () => void refresh();
    window.addEventListener(LOCAL_DATA_HEALTH_CHANGE_EVENT, listener);
    return () =>
      window.removeEventListener(LOCAL_DATA_HEALTH_CHANGE_EVENT, listener);
  }, [refresh]);

  const createBackup = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/local-data/backup", { method: "POST" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Falha no backup.");
      toast.success("Backup SQLite íntegro criado.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha no backup.");
    } finally {
      setBusy(false);
    }
  };

  const exportBackup = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/local-data/backup");
      if (!response.ok) throw new Error("Falha ao exportar backup.");
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(blob);
      anchor.download = match?.[1] ?? "pnp-lead-finder-backup.sqlite";
      anchor.click();
      URL.revokeObjectURL(anchor.href);
      toast.success("Backup exportado.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na exportação.");
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async (file: File) => {
    const confirmed = window.confirm(
      "Restaurar este backup substituirá o banco atual. Um backup PRE-RESTORE será criado automaticamente. Deseja continuar?"
    );
    if (!confirmed) {
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/local-data/backup", {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Falha no restore.");
      toast.success("Banco restaurado e validado. Recarregando dados oficiais.");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha no restore.");
      await refresh();
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const counts = health?.counts;
  const healthState = !health
    ? "checking"
    : health.ok && health.writable
      ? "available"
      : "unavailable";
  return (
    <Card className={healthState === "available" ? "border-emerald-500/40" : healthState === "checking" ? "border-amber-500/40" : "border-red-500/60"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="size-5 text-blue-400" />
          Integridade dos dados
          {healthState === "available" ? (
            <span className="ml-auto flex items-center gap-1 text-sm text-emerald-400">
              <CheckCircle2 className="size-4" /> Banco local: OK
            </span>
          ) : healthState === "checking" ? (
            <span className="ml-auto flex items-center gap-1 text-sm text-amber-400">
              <RefreshCw className="size-4 animate-spin" /> Verificando banco local...
            </span>
          ) : (
            <span className="ml-auto flex items-center gap-1 text-sm text-red-400">
              <AlertTriangle className="size-4" /> Banco local: ERRO
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {healthState === "unavailable" && (
          <div role="alert" className="rounded-md border border-red-500/50 bg-red-950/40 p-3 text-sm font-medium text-red-100">
            Banco local indisponível. Alterações e envios estão temporariamente bloqueados.
            {health?.message ? " " + health.message : ""}
          </div>
        )}

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Caminho do banco</dt><dd className="break-all font-mono text-xs">{health?.databasePath ?? "Indisponível"}</dd></div>
          <div><dt className="text-muted-foreground">Último backup</dt><dd>{health?.lastBackup ? new Date(health.lastBackup).toLocaleString("pt-BR") : "Nenhum"}</dd></div>
          <div><dt className="text-muted-foreground">Tamanho do banco</dt><dd>{sizeLabel(health?.sizeBytes ?? 0)}</dd></div>
          <div><dt className="text-muted-foreground">Histórico de buscas</dt><dd>{counts?.searchHistory ?? 0}</dd></div>
          <div><dt className="text-muted-foreground">Leads</dt><dd>{counts?.leads ?? 0}</dd></div>
          <div><dt className="text-muted-foreground">Campanhas</dt><dd>{counts?.campaigns ?? 0}</dd></div>
          <div><dt className="text-muted-foreground">Envios confirmados</dt><dd>{counts?.confirmedSends ?? 0}</dd></div>
          <div><dt className="text-muted-foreground">Blocklist</dt><dd>{counts?.blocklist ?? 0}</dd></div>
          <div><dt className="text-muted-foreground">Templates</dt><dd>{counts?.templates ?? 0}</dd></div>
          <div><dt className="text-muted-foreground">Assinatura P&amp;P</dt><dd>{health?.signatures["panek-puglesi"] ? "✓" : "não configurada"}</dd></div>
          <div><dt className="text-muted-foreground">Assinatura Modeclean</dt><dd>{health?.signatures.modeclean ? "✓" : "não configurada"}</dd></div>
        </dl>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void createBackup()} disabled={busy || !health?.ok}>
            <Save className="size-4" /> Criar backup agora
          </Button>
          <Button variant="outline" onClick={() => void exportBackup()} disabled={busy || !health?.ok}>
            <Download className="size-4" /> Exportar backup
          </Button>
          <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={busy || !health?.ok}>
            <RotateCcw className="size-4" /> Restaurar backup
          </Button>
          <Button variant="ghost" onClick={() => void refresh()} disabled={busy}>
            <RefreshCw className="size-4" /> Verificar
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".sqlite,application/vnd.sqlite3,application/octet-stream"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void restoreBackup(file);
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
