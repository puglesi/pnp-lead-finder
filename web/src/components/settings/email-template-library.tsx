"use client";

import { useMemo, useState } from "react";
import { Copy, FileText, Mail, Pencil, Plus, Star, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CollapsibleCard, CollapsibleCardContent, CollapsibleCardHeader } from "@/components/ui/collapsible-card";
import { CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getDefaultEmailTemplate,
  getEmailTemplatesForOperation,
  type EmailTemplate,
  type EmailTemplateInput,
} from "@/lib/email-template-library";
import { useEmailTemplateStore } from "@/store/email-template-store";
import { CAMPAIGN_PROFILES, type CampaignProfileId } from "@/types/campaign-profile";

const VARIABLES = ["{{company}}", "{{name}}", "{{email}}", "{{website}}"];

function emptyDraft(operation: CampaignProfileId, reference?: EmailTemplate): EmailTemplateInput {
  return {
    name: "",
    operation,
    subject: "",
    body: "",
    sender: reference?.sender ?? "",
    replyTo: reference?.replyTo ?? "",
    contactKind: "first_contact",
    isDefault: false,
  };
}

export function EmailTemplateLibrary() {
  const templates = useEmailTemplateStore((state) => state.templates);
  const addTemplate = useEmailTemplateStore((state) => state.addTemplate);
  const updateTemplate = useEmailTemplateStore((state) => state.updateTemplate);
  const duplicateTemplate = useEmailTemplateStore((state) => state.duplicateTemplate);
  const deleteTemplate = useEmailTemplateStore((state) => state.deleteTemplate);
  const setDefaultTemplate = useEmailTemplateStore((state) => state.setDefaultTemplate);
  const [operation, setOperation] = useState<CampaignProfileId>("panek-puglesi");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EmailTemplateInput | null>(null);

  const visibleTemplates = useMemo(
    () => getEmailTemplatesForOperation(templates, operation),
    [templates, operation]
  );

  const closeEditor = () => {
    setEditingId(null);
    setDraft(null);
  };

  const openNew = () => {
    setEditingId(null);
    setDraft(emptyDraft(operation, getDefaultEmailTemplate(templates, operation)));
  };

  const openEdit = (template: EmailTemplate) => {
    setEditingId(template.id);
    setDraft({
      name: template.name,
      operation: template.operation,
      subject: template.subject,
      body: template.body,
      sender: template.sender,
      replyTo: template.replyTo,
      contactKind: template.contactKind,
      isDefault: template.isDefault,
    });
  };

  const save = () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.subject.trim() || !draft.body.trim() || !draft.sender.trim() || !draft.replyTo.trim()) {
      toast.error("Preencha todos os campos do modelo.");
      return;
    }
    const input: EmailTemplateInput = {
      ...draft,
      name: draft.name.trim(),
      subject: draft.subject.trim(),
      body: draft.body,
      sender: draft.sender.trim(),
      replyTo: draft.replyTo.trim(),
    };
    if (editingId) {
      updateTemplate(editingId, input);
      toast.success("Modelo atualizado.");
    } else {
      addTemplate(input);
      toast.success("Modelo criado.");
    }
    setOperation(input.operation);
    closeEditor();
  };

  const remove = (template: EmailTemplate) => {
    if (!window.confirm(`Excluir o modelo “${template.name}”?`)) return;
    if (!deleteTemplate(template.id)) {
      toast.error("Mantenha pelo menos um modelo nesta operação.");
      return;
    }
    toast.success("Modelo excluído.");
  };

  return (
    <>
      <CollapsibleCard storageKey="settings-email-templates" className="border-border/60" defaultOpen>
        <CollapsibleCardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Mail className="size-5 text-violet-400" /> Modelos de e-mail
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Biblioteca persistente e independente por operação.</p>
            </div>
            <Button type="button" onClick={openNew}><Plus className="size-4" /> Novo modelo</Button>
          </div>
        </CollapsibleCardHeader>
        <CollapsibleCardContent className="space-y-4">
          <div className="max-w-xs space-y-2">
            <Label>Operação</Label>
            <Select value={operation} onValueChange={(value) => setOperation(value as CampaignProfileId)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CAMPAIGN_PROFILES.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3">
            {visibleTemplates.map((template) => (
              <div key={template.id} className="rounded-xl border border-border/60 bg-background/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="size-4 text-violet-300" />
                      <p className="font-semibold">{template.name}</p>
                      {template.isDefault && <Badge className="gap-1 bg-amber-500/15 text-amber-200"><Star className="size-3 fill-current" /> Padrão</Badge>}
                    </div>
                    <p className="mt-2 truncate text-sm text-muted-foreground">{template.subject}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Remetente: {template.sender} · Reply-To: {template.replyTo}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {!template.isDefault && (
                      <Button type="button" size="sm" variant="outline" onClick={() => setDefaultTemplate(template.id)}>
                        <Star className="size-3.5" /> Definir como padrão
                      </Button>
                    )}
                    <Button type="button" size="icon" variant="ghost" aria-label={`Editar ${template.name}`} onClick={() => openEdit(template)}><Pencil className="size-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label={`Duplicar ${template.name}`} onClick={() => {
                      const copy = duplicateTemplate(template.id);
                      if (copy) toast.success(`Modelo “${copy.name}” criado.`);
                    }}><Copy className="size-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label={`Excluir ${template.name}`} className="text-red-300 hover:text-red-200" onClick={() => remove(template)}><Trash2 className="size-4" /></Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleCardContent>
      </CollapsibleCard>

      <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar modelo" : "Novo modelo de e-mail"}</DialogTitle>
            <DialogDescription>As variáveis são guardadas exatamente como foram escritas.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="template-name">Nome</Label>
                  <Input id="template-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Operação</Label>
                  <Select value={draft.operation} onValueChange={(value) => setDraft({ ...draft, operation: value as CampaignProfileId })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CAMPAIGN_PROFILES.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-subject">Assunto</Label>
                <Input id="template-subject" value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} />
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="template-body">Corpo</Label>
                  <div className="flex flex-wrap gap-1">
                    {VARIABLES.map((variable) => (
                      <button key={variable} type="button" className="rounded border border-border/60 px-2 py-1 font-mono text-xs text-muted-foreground hover:text-foreground" onClick={() => setDraft({ ...draft, body: `${draft.body}${variable}` })}>{variable}</button>
                    ))}
                  </div>
                </div>
                <Textarea id="template-body" value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} className="min-h-64 font-mono text-sm" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="template-sender">Remetente</Label><Input id="template-sender" type="email" value={draft.sender} onChange={(event) => setDraft({ ...draft, sender: event.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="template-reply-to">Reply-To</Label><Input id="template-reply-to" type="email" value={draft.replyTo} onChange={(event) => setDraft({ ...draft, replyTo: event.target.value })} /></div>
              </div>
              <div className="space-y-2">
                <Label>Classificação do contato</Label>
                <Select
                  value={draft.contactKind}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      contactKind: value as EmailTemplateInput["contactKind"],
                    })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first_contact">Primeiro contato</SelectItem>
                    <SelectItem value="follow_up">Follow-up explícito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={draft.isDefault} onCheckedChange={(checked) => setDraft({ ...draft, isDefault: checked === true })} />
                Definir como padrão desta operação
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeEditor}>Cancelar</Button>
                <Button type="button" onClick={save}>Salvar modelo</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
