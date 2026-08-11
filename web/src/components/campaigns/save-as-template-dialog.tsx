"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEmailTemplateStore } from "@/store/email-template-store";
import {
  getEmailTemplatesForOperation,
} from "@/lib/email-template-library";
import type { CampaignProfileId } from "@/types/campaign-profile";

interface SaveAsTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operation: CampaignProfileId;
  subject: string;
  body: string;
  sender?: string;
  replyTo?: string;
}

export function SaveAsTemplateDialog({
  open,
  onOpenChange,
  operation,
  subject,
  body,
  sender,
  replyTo,
}: SaveAsTemplateDialogProps) {
  const templates = useEmailTemplateStore((s) => s.templates);
  const saveAsTemplate = useEmailTemplateStore((s) => s.saveAsTemplate);
  const scoped = useMemo(
    () => getEmailTemplatesForOperation(templates, operation),
    [templates, operation]
  );

  const [name, setName] = useState("");
  const [mode, setMode] = useState<"new" | "replace">("new");
  const [replaceId, setReplaceId] = useState<string>("");
  const [setAsDefault, setSetAsDefault] = useState(false);

  function handleSave() {
    if (!name.trim()) {
      toast.error("Informe o nome do modelo.");
      return;
    }
    if (mode === "replace" && !replaceId) {
      toast.error("Selecione o modelo a substituir.");
      return;
    }
    const result = saveAsTemplate({
      name: name.trim(),
      operation,
      subject,
      body,
      sender,
      replyTo,
      replaceId: mode === "replace" ? replaceId : null,
      setAsDefault,
    });
    if (!result) {
      toast.error("Não foi possível salvar o modelo.");
      return;
    }
    toast.success(
      setAsDefault
        ? `Modelo “${result.name}” salvo e definido como padrão.`
        : `Modelo “${result.name}” salvo.`
    );
    onOpenChange(false);
    setName("");
    setMode("new");
    setReplaceId("");
    setSetAsDefault(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Salvar como modelo</DialogTitle>
          <DialogDescription>
            Escolha criar um novo modelo ou substituir um existente. Nada é
            sobrescrito sem confirmação explícita.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome do modelo</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Proposta Q3"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ação</Label>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as "new" | "replace")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Criar novo modelo</SelectItem>
                <SelectItem value="replace">Substituir existente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === "replace" && (
            <div className="space-y-1.5">
              <Label>Modelo a substituir</Label>
              <Select value={replaceId} onValueChange={setReplaceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {scoped.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={setAsDefault}
              onCheckedChange={(v) => setSetAsDefault(v === true)}
            />
            Salvar como padrão desta operação
          </label>
          <Button type="button" onClick={handleSave} className="w-full">
            Confirmar e salvar modelo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
