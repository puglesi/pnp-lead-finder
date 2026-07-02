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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { parseEmailList, parseLeadsCsv } from "@/lib/import-leads";
import type { Lead } from "@/types/lead";
import { cn } from "@/lib/utils";

type ImportMode = "paste" | "csv";

interface ImportExternalLeadsProps {
  onImport: (leads: Lead[]) => void;
  importedCount?: number;
  className?: string;
}

export function ImportExternalLeads({
  onImport,
  importedCount = 0,
  className,
}: ImportExternalLeadsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>("paste");
  const [pasteText, setPasteText] = useState("");
  const [lastResult, setLastResult] = useState<{
    added: number;
    skipped: number;
  } | null>(null);

  const handlePasteImport = () => {
    const result = parseEmailList(pasteText);
    if (result.leads.length === 0) {
      toast.error(result.errors[0] ?? "Nenhum email válido na lista.");
      return;
    }
    onImport(result.leads);
    setLastResult({ added: result.leads.length, skipped: result.skipped });
    setPasteText("");
    toast.success(
      `${result.leads.length} leads importados${
        result.skipped ? ` · ${result.skipped} ignorados` : ""
      }`,
      { icon: "📥" }
    );
  };

  const handleCsvText = (text: string, filename?: string) => {
    const result = parseLeadsCsv(text);
    if (result.leads.length === 0) {
      toast.error(result.errors[0] ?? "CSV sem emails válidos.");
      return;
    }
    onImport(result.leads);
    setLastResult({ added: result.leads.length, skipped: result.skipped });
    toast.success(
      `${result.leads.length} leads de ${filename ?? "CSV"}${
        result.skipped ? ` · ${result.skipped} duplicados/inválidos` : ""
      }`,
      { icon: "📊" }
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
    <Card className={cn("border-border/60 border-dashed", className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="size-4 text-violet-400" />
            Importar Leads Externos
          </CardTitle>
          {importedCount > 0 && (
            <Badge variant="secondary" className="tabular-nums">
              {importedCount} importados
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          CSV com colunas email/empresa ou cole uma lista de emails
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
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
              className="w-full"
            >
              <ClipboardPaste className="size-4" />
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
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border/60 bg-background/30 px-6 py-8 transition-colors hover:border-blue-400/40 hover:bg-blue-500/5"
            >
              <FileSpreadsheet className="size-8 text-blue-400/70" />
              <span className="text-sm font-medium">
                Clique para enviar CSV
              </span>
              <span className="text-xs text-muted-foreground">
                Colunas: email, empresa, telefone, website (opcionais)
              </span>
            </button>
          </div>
        )}

        {lastResult && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
            <span>
              <strong>{lastResult.added}</strong> leads adicionados
              {lastResult.skipped > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {lastResult.skipped} ignorados
                </span>
              )}
            </span>
          </div>
        )}

        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Leads importados aparecem na aba <strong>Importados</strong> do
            seletor abaixo. Empresa é inferida do domínio se não informada.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}