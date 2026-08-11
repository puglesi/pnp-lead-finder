"use client";

import { useRef, useState } from "react";
import {
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardHeader,
} from "@/components/ui/collapsible-card";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  detectColumnMapping,
  leadsFromMappedRows,
  parseDelimitedText,
  type ColumnMapping,
  type ListImportField,
  type ListImportParseResult,
} from "@/lib/list-import";
import { parseImportFile } from "@/lib/list-import-xlsx";
import { parseCsvLine } from "@/lib/import-leads";

const FIELD_OPTIONS: { value: ListImportField; label: string }[] = [
  { value: "email", label: "E-mail" },
  { value: "company", label: "Empresa" },
  { value: "name", label: "Nome" },
  { value: "website", label: "Website" },
  { value: "domain", label: "Domínio" },
  { value: "phone", label: "Telefone" },
  { value: "address", label: "Endereço" },
  { value: "ignore", label: "Ignorar" },
];

interface ListFileImportCardProps {
  storageKey: string;
  title: string;
  description: string;
  onParsed: (result: ListImportParseResult) => void;
  defaultOpen?: boolean;
}

export function ListFileImportCard({
  storageKey,
  title,
  description,
  onParsed,
  defaultOpen = true,
}: ListFileImportCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pendingRows, setPendingRows] = useState<string[][] | null>(null);
  const [pendingHeaders, setPendingHeaders] = useState<string[]>([]);
  const [manualMapping, setManualMapping] = useState<ColumnMapping>({});
  const [fileLabel, setFileLabel] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setFileLabel(file.name);
    try {
      const result = await parseImportFile(file);
      if (result.needsManualMapping) {
        // Keep raw rows for remapping: re-parse text if possible.
        if (
          file.name.toLowerCase().endsWith(".csv") ||
          file.name.toLowerCase().endsWith(".txt")
        ) {
          const text = await file.text();
          const lines = text
            .replace(/^\uFEFF/, "")
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
          const rows = lines.map((line) => parseCsvLine(line));
          const headers = rows[0] ?? [];
          const detected = detectColumnMapping(headers);
          setPendingRows(rows);
          setPendingHeaders(headers);
          setManualMapping(detected.mapping);
          toast("Mapeie a coluna de e-mail para continuar.", { icon: "🗺️" });
          return;
        }
        // XLSX with no email: expose headers only
        setPendingRows(null);
        setPendingHeaders(result.headers);
        setManualMapping(result.mapping);
        toast("Mapeie a coluna de e-mail para continuar.", { icon: "🗺️" });
        // Store buffer path not available — ask user to map using headers + re-upload
        if (result.headers.length > 0) {
          onParsed(result);
        }
        return;
      }
      if (result.leads.length === 0) {
        toast.error(result.errors[0] ?? "Nenhum e-mail válido no arquivo.");
        return;
      }
      setPendingRows(null);
      onParsed(result);
      toast.success(`${result.leads.length} e-mail(s) importado(s) de ${file.name}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao ler o arquivo."
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function applyManualMapping() {
    if (!pendingRows) {
      toast.error("Reenvie o arquivo após mapear as colunas.");
      return;
    }
    if (!Object.values(manualMapping).includes("email")) {
      toast.error("Selecione qual coluna é o e-mail.");
      return;
    }
    const parsed = leadsFromMappedRows(pendingRows, manualMapping, {
      hasHeader: true,
    });
    if (parsed.leads.length === 0) {
      toast.error(parsed.errors[0] ?? "Nenhum e-mail válido com este mapeamento.");
      return;
    }
    setPendingRows(null);
    onParsed({ ...parsed, needsManualMapping: false });
    toast.success(`${parsed.leads.length} e-mail(s) mapeados.`);
  }

  return (
    <CollapsibleCard storageKey={storageKey} defaultOpen={defaultOpen}>
      <CollapsibleCardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Upload className="size-5 text-violet-400" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CollapsibleCardHeader>
      <CollapsibleCardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="size-4" />
            )}
            {busy ? "Lendo…" : "Enviar CSV / TXT / XLSX"}
          </Button>
          {fileLabel && (
            <span className="text-xs text-muted-foreground">{fileLabel}</span>
          )}
        </div>

        {pendingRows && pendingHeaders.length > 0 && (
          <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-sm font-medium">Mapeamento manual de colunas</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {pendingHeaders.map((header, index) => (
                <div key={`${header}-${index}`} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Coluna: {header || `(vazia ${index + 1})`}
                  </Label>
                  <Select
                    value={manualMapping[index] ?? "ignore"}
                    onValueChange={(value) =>
                      setManualMapping((prev) => ({
                        ...prev,
                        [index]: value as ListImportField,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <Button type="button" onClick={applyManualMapping}>
              Aplicar mapeamento
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Detecta automaticamente: email, e-mail, mail, company, empresa, name,
          nome, website, site, domain, domínio. Blocklist e deduplicação global
          continuam obrigatórias após o upload.
        </p>
      </CollapsibleCardContent>
    </CollapsibleCard>
  );
}

/** Helper for paste-only text import (tests + optional UX). */
export function parsePastedList(text: string): ListImportParseResult {
  return parseDelimitedText(text);
}
