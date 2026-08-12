"use client";

import { useState } from "react";
import { PenLine, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SignatureHtmlEditor } from "@/components/settings/signature-html-editor";
import type { CampaignSignature } from "@/types/campaign";
import type { CampaignProfileId } from "@/types/campaign-profile";
import { getOperationSendAccount } from "@/lib/operation-identity";
import { sanitizeSignatureHtml } from "@/lib/signature-html";
import { cn } from "@/lib/utils";

interface CampaignSignatureSettingsProps {
  signature: CampaignSignature;
  onChange: (patch: Partial<CampaignSignature>) => void;
  disabled?: boolean;
  className?: string;
  operation?: CampaignProfileId;
}

/**
 * Campaign-level signature editor. Paste from Gmail is preserved.
 * “Descartar alterações” returns to the last value passed as props (saved campaign).
 */
export function CampaignSignatureSettings({
  signature,
  onChange,
  disabled = false,
  className,
  operation = "panek-puglesi",
}: CampaignSignatureSettingsProps) {
  const account = getOperationSendAccount(operation);
  const savedKey = `${signature.enabled}::${signature.body}`;
  const [baselineKey, setBaselineKey] = useState(savedKey);
  const [baseline, setBaseline] = useState(signature);
  const [dirty, setDirty] = useState(false);

  if (baselineKey !== savedKey && !dirty) {
    setBaselineKey(savedKey);
    setBaseline(signature);
  }

  const discard = () => {
    onChange({ body: baseline.body, enabled: baseline.enabled });
    setDirty(false);
    toast.success("Alterações descartadas — última assinatura salva.");
  };

  return (
    <Card className={cn("border-border/60", className)}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <PenLine className="size-4 text-emerald-400" />
            Assinatura ({account.signatureLabel})
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Cole a assinatura do Gmail. Layout, logo e estilos são preservados.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="signature-enabled"
              checked={signature.enabled}
              disabled={disabled}
              onCheckedChange={(v) => {
                onChange({ enabled: v === true });
                setDirty(true);
              }}
            />
            <Label
              htmlFor="signature-enabled"
              className="cursor-pointer text-sm font-medium"
            >
              Ativar assinatura
            </Label>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || !dirty}
            onClick={discard}
          >
            <RotateCcw className="size-3.5" />
            Descartar alterações
          </Button>
        </div>
      </CardHeader>

      <CardContent className={cn("space-y-4", !signature.enabled && "opacity-50")}>
        <SignatureHtmlEditor
          value={signature.body}
          disabled={disabled || !signature.enabled}
          minHeight={260}
          onChange={(body) => {
            onChange({ body: sanitizeSignatureHtml(body) });
            setDirty(true);
          }}
        />
        <div className="rounded-lg border border-border/50 bg-white p-3 dark:bg-background/30">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Preview
          </p>
          <div
            data-signature-preview="true"
            className="overflow-x-auto text-sm"
            dangerouslySetInnerHTML={{
              __html: signature.enabled
                ? sanitizeSignatureHtml(signature.body)
                : "<span style='color:#9ca3af'>(desativada)</span>",
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
