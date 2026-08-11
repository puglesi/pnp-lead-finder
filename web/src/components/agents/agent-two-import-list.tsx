"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Download,
  Loader2,
  Save,
  Send,
  ShieldCheck,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardHeader,
} from "@/components/ui/collapsible-card";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListFileImportCard } from "@/components/import/list-file-import-card";
import {
  analyzeImportedList,
  downloadTextFile,
  exportLeadsAsCsv,
  type ListImportAnalysis,
} from "@/lib/list-import";
import type { ListImportParseResult } from "@/lib/list-import";
import { useEmailBlocklistStore } from "@/store/email-blocklist-store";
import { useLeadStore } from "@/store/lead-store";
import { useAgentTwoStore } from "@/store/agent-two-store";
import { useAgentTwoRunner } from "@/hooks/use-agent-two-runner";
import type { Lead } from "@/types/lead";
import { normalizeEmail } from "@/lib/email-validation";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function AgentTwoImportList() {
  const router = useRouter();
  const blockedEntries = useEmailBlocklistStore((s) => s.entries);
  const savedLeads = useLeadStore((s) => s.savedLeads);
  const importedLeads = useLeadStore((s) => s.importedLeads);
  const importExternalLeads = useLeadStore((s) => s.importExternalLeads);
  const loadQueue = useAgentTwoStore((s) => s.loadQueue);
  const start = useAgentTwoStore((s) => s.start);
  const status = useAgentTwoStore((s) => s.status);
  const queue = useAgentTwoStore((s) => s.queue);
  const { runQueue } = useAgentTwoRunner();

  const [imported, setImported] = useState<Lead[]>([]);
  const [analysis, setAnalysis] = useState<ListImportAnalysis | null>(null);
  const [validating, setValidating] = useState(false);

  const existingPool = useMemo(
    () => [...savedLeads, ...importedLeads],
    [savedLeads, importedLeads]
  );

  function handleParsed(result: ListImportParseResult) {
    if (result.needsManualMapping && result.leads.length === 0) return;
    const next = analyzeImportedList({
      leads: result.leads,
      existingLeads: existingPool,
      blockedEntries,
    });
    setImported(result.leads);
    setAnalysis(next);
  }

  async function handleValidate() {
    if (!analysis || analysis.readyLeads.length === 0) {
      toast.error("Nenhum e-mail pronto para validação (verifique blocklist/duplicados).");
      return;
    }
    // Persist into store first so Agent 2 runner can update validation fields.
    const added = importExternalLeads(analysis.readyLeads);
    const toValidate = added.length > 0 ? added : analysis.readyLeads;
    loadQueue(toValidate, true);
    setValidating(true);
    if (start()) {
      toast.success(
        `Validando ${toValidate.length} e-mail(s) com o Agente 2…`
      );
      await runQueue();
    } else {
      toast.error("Não foi possível iniciar a validação.");
    }
    setValidating(false);
  }

  const validatedFromImport = useMemo(() => {
    const emails = new Set(
      imported
        .map((l) => normalizeEmail(l.email))
        .filter(Boolean) as string[]
    );
    if (emails.size === 0) return { valid: [] as Lead[], invalid: [] as Lead[] };
    const pool = [...savedLeads, ...importedLeads];
    const matched = pool.filter((l) => {
      const e = normalizeEmail(l.normalizedEmail) ?? normalizeEmail(l.email);
      return e && emails.has(e);
    });
    const valid = matched.filter(
      (l) =>
        l.emailValidationStatus === "valid" ||
        l.emailValidationStatus === "unknown" ||
        l.emailValidationStatus === "risky" ||
        l.emailValidationStatus === "catch_all"
    );
    const invalid = matched.filter(
      (l) =>
        l.emailValidationStatus === "invalid" ||
        l.emailValidationStatus === "no_email" ||
        l.emailValidationStatus === "duplicate"
    );
    return { valid, invalid };
  }, [imported, savedLeads, importedLeads]);

  function handleSaveValids() {
    if (validatedFromImport.valid.length === 0) {
      toast.error("Nenhum válido para salvar ainda. Valide a lista primeiro.");
      return;
    }
    const added = importExternalLeads(validatedFromImport.valid);
    toast.success(`${added.length || validatedFromImport.valid.length} lead(s) em Meus Leads.`);
  }

  function handleExport(kind: "valid" | "invalid") {
    const list =
      kind === "valid" ? validatedFromImport.valid : validatedFromImport.invalid;
    if (list.length === 0) {
      toast.error(`Nenhum ${kind === "valid" ? "válido" : "inválido"} para exportar.`);
      return;
    }
    const csv = exportLeadsAsCsv(list, kind);
    downloadTextFile(
      csv,
      `pnp-agente2-${kind}-${new Date().toISOString().slice(0, 10)}.csv`
    );
    toast.success(`Exportados ${list.length} ${kind === "valid" ? "válidos" : "inválidos"}.`);
  }

  function handleSendToAgent3() {
    if (validatedFromImport.valid.length === 0) {
      toast.error("Valide a lista e salve os válidos antes de enviar ao Agente 3.");
      return;
    }
    importExternalLeads(validatedFromImport.valid);
    toast.success("Válidos disponíveis no Agente 3 (crie/selecione campanha).");
    router.push("/agente-3");
  }

  const isRunning = status === "running" || validating;

  return (
    <div className="space-y-4">
      <ListFileImportCard
        storageKey="agent-2-validate-my-list-upload"
        title="Validar minha lista"
        description="Envie CSV, TXT ou XLSX com pelo menos uma coluna de e-mail. Usa o mesmo validador do Agente 2 (sintaxe, domínio, MX)."
        onParsed={handleParsed}
        defaultOpen
      />

      {analysis && (
        <CollapsibleCard
          storageKey="agent-2-import-analysis"
          defaultOpen
        >
          <CollapsibleCardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="size-5 text-primary" />
              Resultado da importação
            </CardTitle>
            <CardDescription>
              Blocklist e e-mails duplicados não entram na fila ativa de
              validação/prospecção.
            </CardDescription>
          </CollapsibleCardHeader>
          <CollapsibleCardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Importados" value={analysis.totalImported} />
              <Stat label="Únicos" value={analysis.uniqueEmails} />
              <Stat label="Duplicados" value={analysis.duplicates} />
              <Stat label="Bloqueados" value={analysis.blocked} />
              <Stat label="Já existentes" value={analysis.alreadyExisting} />
              <Stat label="Prontos" value={analysis.readyForValidation} />
            </div>

            {analysis.blocked > 0 && (
              <Badge variant="danger" className="text-[10px]">
                {analysis.blocked} bloqueado(s) — não será prospectado
              </Badge>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void handleValidate()}
                disabled={isRunning || analysis.readyForValidation === 0}
              >
                {isRunning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                Validar lista
              </Button>
              <Button
                variant="outline"
                onClick={handleSaveValids}
                disabled={validatedFromImport.valid.length === 0}
              >
                <Save className="size-4" />
                Salvar válidos
              </Button>
              <Button
                variant="outline"
                onClick={() => handleExport("valid")}
                disabled={validatedFromImport.valid.length === 0}
              >
                <Download className="size-4" />
                Exportar válidos
              </Button>
              <Button
                variant="outline"
                onClick={() => handleExport("invalid")}
                disabled={validatedFromImport.invalid.length === 0}
              >
                <Download className="size-4" />
                Exportar inválidos
              </Button>
              <Button
                variant="secondary"
                onClick={handleSendToAgent3}
                disabled={validatedFromImport.valid.length === 0}
              >
                <Send className="size-4" />
                Enviar válidos ao Agente 3
              </Button>
            </div>

            {queue.length > 0 && status !== "idle" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-emerald-400" />
                Fila do Agente 2: {queue.length} item(ns) · status {status}
              </p>
            )}
          </CollapsibleCardContent>
        </CollapsibleCard>
      )}
    </div>
  );
}
