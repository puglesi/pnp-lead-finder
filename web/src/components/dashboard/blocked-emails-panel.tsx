"use client";

import { useMemo, useState } from "react";
import { Ban, Plus, Search, Trash2, Unlock } from "lucide-react";
import toast from "react-hot-toast";
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardHeader,
} from "@/components/ui/collapsible-card";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EMAIL_BLOCK_OPERATION_LABELS,
  EMAIL_BLOCK_REASON_LABELS,
  EMAIL_BLOCK_REASONS,
  type EmailBlockOperationScope,
  type EmailBlockReason,
} from "@/lib/email-blocklist";
import { useEmailBlocklistStore } from "@/store/email-blocklist-store";
import { cn } from "@/lib/utils";

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return value;
  }
}

export function BlockedEmailsPanel() {
  const entries = useEmailBlocklistStore((s) => s.entries);
  const addEmail = useEmailBlocklistStore((s) => s.addEmail);
  const addEmails = useEmailBlocklistStore((s) => s.addEmails);
  const removeById = useEmailBlocklistStore((s) => s.removeById);

  const [singleEmail, setSingleEmail] = useState("");
  const [bulkEmails, setBulkEmails] = useState("");
  const [reason, setReason] = useState<EmailBlockReason>("manual");
  const [operation, setOperation] =
    useState<EmailBlockOperationScope>("both");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (entry) =>
        entry.normalizedEmail.includes(q) ||
        entry.reason.includes(q) ||
        (entry.note?.toLowerCase().includes(q) ?? false) ||
        EMAIL_BLOCK_REASON_LABELS[entry.reason].toLowerCase().includes(q) ||
        EMAIL_BLOCK_OPERATION_LABELS[entry.operation]
          .toLowerCase()
          .includes(q)
    );
  }, [entries, filter]);

  function handleAddSingle() {
    const entry = addEmail({
      email: singleEmail,
      reason,
      operation,
      note: note || undefined,
    });
    if (!entry) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    setSingleEmail("");
    setNote("");
    toast.success(`${entry.normalizedEmail} bloqueado.`);
  }

  function handleAddBulk() {
    if (!bulkEmails.trim()) {
      toast.error("Cole uma lista de e-mails.");
      return;
    }
    const result = addEmails({
      raw: bulkEmails,
      reason,
      operation,
      note: note || undefined,
    });
    if (result.added === 0 && result.skipped === 0) {
      toast.error("Nenhum e-mail válido encontrado na lista.");
      return;
    }
    setBulkEmails("");
    setNote("");
    toast.success(
      `${result.added} bloqueado(s)${
        result.skipped ? ` · ${result.skipped} já estavam na lista` : ""
      }.`
    );
  }

  function handleRemove(id: string, email: string) {
    removeById(id);
    toast.success(`${email} desbloqueado.`);
  }

  return (
    <CollapsibleCard
      storageKey="dashboard-blocked-emails"
      defaultOpen={false}
      className="border-border/60 bg-card/80"
    >
      <CollapsibleCardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Ban className="size-5 text-red-400" />
              E-mails bloqueados
            </CardTitle>
            <CardDescription>
              Lista de supressão persistente. Bloqueados podem aparecer como
              empresa encontrada, mas não entram em prospect, campanha ou
              envio.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="tabular-nums">
            {entries.length}
          </Badge>
        </div>
      </CollapsibleCardHeader>
      <CollapsibleCardContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-border/50 bg-background/30 p-4">
            <p className="text-sm font-medium">Adicionar e-mail</p>
            <div className="space-y-1.5">
              <Label htmlFor="block-email-single">E-mail</Label>
              <Input
                id="block-email-single"
                value={singleEmail}
                onChange={(e) => setSingleEmail(e.target.value)}
                placeholder="contato@empresa.com"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Motivo</Label>
                <Select
                  value={reason}
                  onValueChange={(v) => setReason(v as EmailBlockReason)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMAIL_BLOCK_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {EMAIL_BLOCK_REASON_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Operação</Label>
                <Select
                  value={operation}
                  onValueChange={(v) =>
                    setOperation(v as EmailBlockOperationScope)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Ambas</SelectItem>
                    <SelectItem value="panek-puglesi">P&P</SelectItem>
                    <SelectItem value="modeclean">Modeclean</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="block-note">Observação (opcional)</Label>
              <Input
                id="block-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Contexto do bloqueio"
              />
            </div>
            <Button type="button" onClick={handleAddSingle} className="w-full">
              <Plus className="size-4" />
              Bloquear e-mail
            </Button>
          </div>

          <div className="space-y-3 rounded-xl border border-border/50 bg-background/30 p-4">
            <p className="text-sm font-medium">Colar lista de e-mails</p>
            <Textarea
              value={bulkEmails}
              onChange={(e) => setBulkEmails(e.target.value)}
              placeholder={"um@empresa.com\ndois@outra.com\n..."}
              rows={6}
            />
            <p className="text-xs text-muted-foreground">
              Usa o mesmo motivo e operação selecionados ao lado. Separe por
              linha, vírgula ou espaço.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={handleAddBulk}
              className="w-full"
            >
              <Ban className="size-4" />
              Bloquear lista
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Pesquisar na lista de bloqueados…"
              className="pl-9"
            />
          </div>

          {filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
              {entries.length === 0
                ? "Nenhum e-mail bloqueado ainda."
                : "Nenhum resultado para o filtro."}
            </p>
          ) : (
            <ul className="divide-y divide-border/50 rounded-xl border border-border/60">
              {filtered.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate font-mono text-sm font-medium">
                      {entry.normalizedEmail}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="danger" className="text-[10px]">
                        Bloqueado — não será prospectado
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {EMAIL_BLOCK_REASON_LABELS[entry.reason]}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {EMAIL_BLOCK_OPERATION_LABELS[entry.operation]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Bloqueado em {formatDate(entry.blockedAt)}
                      {entry.note ? ` · ${entry.note}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={cn("shrink-0 text-muted-foreground")}
                    onClick={() =>
                      handleRemove(entry.id, entry.normalizedEmail)
                    }
                    title="Desbloquear"
                  >
                    <Unlock className="size-4" />
                    <span className="sr-only sm:not-sr-only sm:ml-1">
                      Desbloquear
                    </span>
                    <Trash2 className="ml-1 size-3.5 opacity-50 sm:hidden" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CollapsibleCardContent>
    </CollapsibleCard>
  );
}
