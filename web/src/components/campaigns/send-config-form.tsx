"use client";

import { AtSign, Link2, Mail, Reply } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EMAIL_VARIABLES } from "@/lib/email-templates";
import type { CampaignSendConfig } from "@/types/campaign";

interface SendConfigFormProps {
  config: CampaignSendConfig;
  subject: string;
  onConfigChange: (patch: Partial<CampaignSendConfig>) => void;
  onSubjectChange: (subject: string) => void;
  onInsertVariable?: (variable: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function SendConfigForm({
  config,
  subject,
  onConfigChange,
  onSubjectChange,
  onInsertVariable,
  disabled,
  compact,
}: SendConfigFormProps) {
  return (
    <Card className="border-border/60 bg-gradient-to-br from-card to-violet-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="size-4 text-violet-400" />
          Configuração de envio
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fromName" className="flex items-center gap-1.5">
              <AtSign className="size-3.5 text-muted-foreground" />
              From — Nome
            </Label>
            <Input
              id="fromName"
              value={config.fromName}
              disabled={disabled}
              onChange={(e) => onConfigChange({ fromName: e.target.value })}
              placeholder="Panek Pugliesi"
              className="bg-background/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fromEmail">From — Email</Label>
            <Input
              id="fromEmail"
              type="email"
              value={config.fromEmail}
              disabled={disabled}
              onChange={(e) => onConfigChange({ fromEmail: e.target.value })}
              placeholder="outreach@panekpuglesi.co.uk"
              className="bg-background/50"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="replyTo" className="flex items-center gap-1.5">
            <Reply className="size-3.5 text-muted-foreground" />
            Reply-To
          </Label>
          <Input
            id="replyTo"
            type="email"
            value={config.replyTo}
            disabled={disabled}
            onChange={(e) => onConfigChange({ replyTo: e.target.value })}
            className="bg-background/50"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="unsubscribe" className="flex items-center gap-1.5">
            <Link2 className="size-3.5 text-muted-foreground" />
            Unsubscribe link
          </Label>
          <Input
            id="unsubscribe"
            value={config.unsubscribeLink}
            disabled={disabled}
            onChange={(e) => onConfigChange({ unsubscribeLink: e.target.value })}
            placeholder="https://...?email={{email}}"
            className="bg-background/50 font-mono text-xs"
          />
          {!compact && (
            <p className="text-xs text-muted-foreground">
              Exibido no rodapé do email · suporta {"{{email}}"}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="subject">Subject</Label>
          {onInsertVariable && (
            <div className="flex flex-wrap gap-1.5">
              {EMAIL_VARIABLES.map((v) => (
                <button
                  key={`sub-${v.key}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => onInsertVariable(v.key)}
                  className="rounded-md border border-border/60 px-2 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-40"
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}
          <Input
            id="subject"
            value={subject}
            disabled={disabled}
            onChange={(e) => onSubjectChange(e.target.value)}
            className="bg-background/50"
          />
        </div>
      </CardContent>
    </Card>
  );
}