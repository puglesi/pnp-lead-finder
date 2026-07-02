"use client";

import { Clock, MailPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichEmailEditor } from "./rich-email-editor";
import type { CampaignFollowUp } from "@/types/campaign";
import { cn } from "@/lib/utils";

interface FollowUpSettingsProps {
  followUp: CampaignFollowUp;
  onChange: (patch: Partial<CampaignFollowUp>) => void;
  disabled?: boolean;
}

export function FollowUpSettings({
  followUp,
  onChange,
  disabled,
}: FollowUpSettingsProps) {
  return (
    <Card className="border-border/60 bg-gradient-to-br from-card to-amber-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MailPlus className="size-4 text-amber-400" />
            Follow-up automático
          </CardTitle>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ enabled: !followUp.enabled })}
            className={cn(
              "relative h-7 w-12 rounded-full transition-colors",
              followUp.enabled ? "bg-amber-500" : "bg-muted",
              disabled && "opacity-50"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform",
                followUp.enabled ? "translate-x-5" : "translate-x-0.5"
              )}
            />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Segundo email automático para quem abriu mas não respondeu
        </p>
      </CardHeader>
      {followUp.enabled && (
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Clock className="size-4 text-muted-foreground" />
            <Label htmlFor="delayDays" className="shrink-0">
              Enviar após
            </Label>
            <Input
              id="delayDays"
              type="number"
              min={1}
              max={14}
              value={followUp.delayDays}
              disabled={disabled}
              onChange={(e) =>
                onChange({ delayDays: Math.max(1, Number(e.target.value) || 1) })
              }
              className="w-20 bg-background/50"
            />
            <span className="text-sm text-muted-foreground">dias</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="followSubject">Assunto do follow-up</Label>
            <Input
              id="followSubject"
              value={followUp.subject}
              disabled={disabled}
              onChange={(e) => onChange({ subject: e.target.value })}
              className="bg-background/50"
            />
          </div>
          <div className="space-y-2">
            <Label>Corpo do follow-up</Label>
            <RichEmailEditor
              value={followUp.body}
              onChange={(body) => onChange({ body })}
              disabled={disabled}
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}