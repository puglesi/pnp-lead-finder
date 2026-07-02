"use client";

import { PenLine, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RichEmailEditor } from "./rich-email-editor";
import {
  DEFAULT_SIGNATURE,
  type CampaignSignature,
} from "@/types/campaign";
import { cn } from "@/lib/utils";

interface CampaignSignatureSettingsProps {
  signature: CampaignSignature;
  onChange: (patch: Partial<CampaignSignature>) => void;
  disabled?: boolean;
  className?: string;
}

export function CampaignSignatureSettings({
  signature,
  onChange,
  disabled = false,
  className,
}: CampaignSignatureSettingsProps) {
  const resetToDefault = () => {
    onChange({ body: DEFAULT_SIGNATURE.body });
    toast.success("Assinatura padrão restaurada");
  };

  return (
    <Card className={cn("border-border/60", className)}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <PenLine className="size-4 text-emerald-400" />
            Assinatura
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Inserida automaticamente no final de cada email enviado
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="signature-enabled"
              checked={signature.enabled}
              disabled={disabled}
              onCheckedChange={(v) => onChange({ enabled: v === true })}
            />
            <Label htmlFor="signature-enabled" className="cursor-pointer text-sm font-medium">
              Ativar assinatura
            </Label>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={resetToDefault}
          >
            <RotateCcw className="size-3.5" />
            Padrão Panek Pugliesi
          </Button>
        </div>
      </CardHeader>

      <CardContent className={cn(!signature.enabled && "opacity-50")}>
        <RichEmailEditor
          value={signature.body}
          onChange={(body) => onChange({ body })}
          placeholder="Edite sua assinatura..."
          layout="full"
          variant="compact"
          minHeight={320}
          disabled={disabled || !signature.enabled}
          showVariables={false}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          PANE K&amp;PUGLIESI · London Property Services · Carlos Pugliesi — Director ·
          Lettings | Property Management | Investments | Relocation. Editável; inserida
          automaticamente no final do email.
        </p>
      </CardContent>
    </Card>
  );
}