/**
 * XLSX → rows via SheetJS (xlsx). Kept separate so unit tests for CSV/TXT
 * do not need the binary dependency graph.
 */
import type { ColumnMapping, ListImportParseResult } from "./list-import.ts";
import {
  detectColumnMapping,
  leadsFromMappedRows,
} from "./list-import.ts";

export async function parseXlsxArrayBuffer(
  buffer: ArrayBuffer,
  mappingOverride?: ColumnMapping
): Promise<ListImportParseResult> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      leads: [],
      headers: [],
      mapping: {},
      needsManualMapping: true,
      rawRowCount: 0,
      errors: ["Planilha XLSX sem abas."],
    };
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as string[][];

  const normalized = rows.map((row) =>
    (row ?? []).map((cell) => String(cell ?? "").trim())
  );
  const nonEmpty = normalized.filter((row) => row.some((c) => c));
  if (nonEmpty.length === 0) {
    return {
      leads: [],
      headers: [],
      mapping: {},
      needsManualMapping: true,
      rawRowCount: 0,
      errors: ["Planilha vazia."],
    };
  }

  const headers = nonEmpty[0] ?? [];
  const detected = detectColumnMapping(headers);
  const mapping = mappingOverride ?? detected.mapping;

  if (detected.needsManualMapping && !mappingOverride) {
    const fallback: ColumnMapping = { 0: "email" };
    const parsed = leadsFromMappedRows(nonEmpty, fallback, { hasHeader: false });
    if (parsed.leads.length > 0) return parsed;
    return {
      leads: [],
      headers,
      mapping: detected.mapping,
      needsManualMapping: true,
      rawRowCount: Math.max(0, nonEmpty.length - 1),
      errors: [
        "Não foi possível detectar a coluna de e-mail. Mapeie manualmente.",
      ],
    };
  }

  return leadsFromMappedRows(nonEmpty, mapping, { hasHeader: true });
}

export async function parseImportFile(
  file: File,
  mappingOverride?: ColumnMapping
): Promise<ListImportParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    return parseXlsxArrayBuffer(buffer, mappingOverride);
  }
  const text = await file.text();
  const { parseDelimitedText } = await import("./list-import.ts");
  return parseDelimitedText(text, mappingOverride);
}
