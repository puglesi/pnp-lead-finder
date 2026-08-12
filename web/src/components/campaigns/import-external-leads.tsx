"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { parseEmailList, parseLeadsCsv } from "@/lib/import-leads";
import type { Lead } from "@/types/lead";
import {
  buildImportBatchMembership,
  createImportBatchId,
  type ImportBatchStats,
} from "@/lib/import-batch";
import { normalizeEmail } from "@/lib/email-validation";
import { cn } from "@/lib/utils";

type ImportMode = "paste" | "csv";

interface ImportExternalLeadsProps {
  /**
   * Called with ONLY this upload's batch membership (not the global pool).
   */
  onImportBatch: (stats: ImportBatchStats) => void;
  /** Existing system emails (saved + imported) for alreadyInSystem accounting. */
  systemLeads?: Lead[];
  blockedEmails?: string[];
  /** Size of the current form batch only (not global history). */
  currentBatchCount?: number;
  className?: string;
}

function StatRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-semibold tabular-nums",
          accent && "text-emerald-400"
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function ImportExternalLeads({
  onImportBatch,
  systemLeads = [],
  blockedEmails = [],
  currentBatchCount = 0,
  className,
}: ImportExternalLeadsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>("paste");
  const [pasteText, setPasteText] = useState("");
  const [lastStats, setLastStats] = useState<ImportBatchStats | null>(null);

  function systemMaps() {
    const systemEmails = new Set<string>();
    const existingByEmail = new Map<string, Lead>();
    for (const lead of systemLeads) {
      const key = normalizeEmail(lead.normalizedEmail ?? lead.email);
      if (!key) continue;
      systemEmails.add(key);
      if (!existingByEmail.has(key)) existingByEmail.set(key, lead);
    }
    const blocked = new Set(
      blockedEmails
        .map((e) => normalizeEmail(e))
        .filter(Boolean) as string[]
    );
    return { systemEmails, existingByEmail, blocked };
  }

  function finalizeFromParsed(
    parsedLeads: Lead[],
    skipped: number,
    totalLines: number,
    filename?: string
  ) {
    if (parsedLeads.length === 0) {
      toast.error("Nenhum e-mail válido encontrado neste arquivo/lista.");
      return;
    }
    const importBatchId = createImportBatchId();
    const { systemEmails, existingByEmail, blocked } = systemMaps();
    // Parser skipped = invalid + in-file dups combined; split is approximate
    // when parser doesn't separate — treat all skipped as invalid+dup bucket.
    const stats = buildImportBatchMembership({
      importBatchId,
      filename,
      totalLines,
      parsedLeads,
      skippedInvalidOrDup: skipped,
      duplicatesInFile: 0,
      invalidCount: skipped,
      systemEmails,
      existingByEmail,
      blockedEmails: blocked,
    });

    setLastStats(stats);
    onImportBatch(stats);

    toast.success(
      `Lote ${stats.batchFinalCount} destinatário(s) · ${stats.newlyAdded} novos · ${stats.alreadyInSystem} já no sistema`,
      { icon: "📥" }
    );
  }

  const handlePasteImport = () => {
    const tokens = pasteText
      .split(/[\n,;]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const result = parseEmailList(pasteText);
    if (result.leads.length === 0) {
      toast.error(result.errors[0] ?? "Nenhum email válido na lista.");
      return;
    }
    finalizeFromParsed(result.leads, result.skipped, tokens.length);
    setPasteText("");
  };

  const handleCsvText = (text: string, filename?: string) => {
    const lines = text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const result = parseLeadsCsv(text);
    if (result.leads.length === 0) {
      toast.error(result.errors[0] ?? "CSV sem emails válidos.");
      return;
    }
    finalizeFromParsed(
      result.leads,
      result.skipped,
      Math.max(0, lines.length - 1),
      filename
    );
  };

  const handleFile = (file: File) => {
    if (!file.name.match(/\.(csv|txt)$/i)) {
      toast.error("Use arquivo .csv ou .txt");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      handleCsvText(text, file.name);
    };
    reader.readAsText(file);
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Cada upload cria um lote isolado. Importações antigas não entram
          automaticamente neste lote.
        </p>
        {currentBatchCount > 0 && (
          <Badge variant="secondary" className="tabular-nums">
            Lote atual: {currentBatchCount}
          </Badge>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("paste")}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all",
            mode === "paste"
              ? "border-violet-400/50 bg-violet-500/15 text-violet-100"
              : "border-border/60 text-muted-foreground hover:border-violet-400/30"
          )}
        >
          <ClipboardPaste className="size-3.5" />
          Colar emails
        </button>
        <button
          type="button"
          onClick={() => setMode("csv")}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all",
            mode === "csv"
              ? "border-blue-400/50 bg-blue-500/15 text-blue-100"
              : "border-border/60 text-muted-foreground hover:border-blue-400/30"
          )}
        >
          <FileSpreadsheet className="size-3.5" />
          Upload CSV
        </button>
      </div>

      {mode === "paste" ? (
        <div className="space-y-3">
          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={
              "contato@empresa.com\noutro@dominio.co.uk\ninfo@startup.io"
            }
            className="min-h-[120px] font-mono text-sm"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handlePasteImport}
            disabled={!pasteText.trim()}
          >
            <Upload className="size-4" />
            Importar lista
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileRef.current?.click()}
          >
            <FileSpreadsheet className="size-4" />
            Escolher arquivo CSV/TXT
          </Button>
        </div>
      )}

      {lastStats && (
        <div className="space-y-2 rounded-xl border border-border/60 bg-background/40 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="size-4 text-emerald-400" />
            Resultado do lote
            {lastStats.filename ? ` · ${lastStats.filename}` : ""}
          </div>
          <div className="grid gap-1 sm:grid-cols-2">
            <StatRow label="Total de linhas/tokens" value={lastStats.totalLines} />
            <StatRow label="E-mails encontrados" value={lastStats.emailsFound} />
            <StatRow label="E-mails válidos (únicos no arquivo)" value={lastStats.validEmails} />
            <StatRow label="Duplicados no arquivo" value={lastStats.duplicatesInFile} />
            <StatRow label="Já existentes no sistema" value={lastStats.alreadyInSystem} />
            <StatRow label="Bloqueados" value={lastStats.blocked} />
            <StatRow label="Inválidos" value={lastStats.invalid} />
            <StatRow label="Novos adicionados" value={lastStats.newlyAdded} />
            <StatRow
              label="Total final deste lote"
              value={lastStats.batchFinalCount}
              accent
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Lote id: <code className="text-[10px]">{lastStats.importBatchId}</code>
            {" · "}
            “Importados” no seletor = apenas este lote ({lastStats.batchFinalCount}
            ), não o histórico global.
          </p>
          {lastStats.invalid > 0 && (
            <p className="flex items-center gap-1 text-xs text-amber-200/90">
              <AlertCircle className="size-3.5" />
              {lastStats.invalid} linha(s) inválidas ou sem e-mail válido.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
