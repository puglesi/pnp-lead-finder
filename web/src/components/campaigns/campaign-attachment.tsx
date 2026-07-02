"use client";

import { FileText, Paperclip, X } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { CampaignAttachment } from "@/types/campaign";
import { cn } from "@/lib/utils";

const MAX_PDF_BYTES = 2 * 1024 * 1024;

interface CampaignAttachmentFieldProps {
  attachment: CampaignAttachment | null;
  onChange: (attachment: CampaignAttachment | null) => void;
  disabled?: boolean;
  className?: string;
}

export function CampaignAttachmentField({
  attachment,
  onChange,
  disabled = false,
  className,
}: CampaignAttachmentFieldProps) {
  const handleFile = (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Apenas arquivos PDF são aceitos.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      toast.error("PDF muito grande. Máximo 2 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      onChange({
        name: file.name,
        mimeType: file.type,
        dataUrl: String(reader.result ?? ""),
        sizeBytes: file.size,
      });
      toast.success(`PDF anexado: ${file.name}`);
    };
    reader.onerror = () => toast.error("Erro ao ler o arquivo.");
    reader.readAsDataURL(file);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Label className="flex items-center gap-2">
        <Paperclip className="size-3.5 text-muted-foreground" />
        Anexo PDF (opcional)
      </Label>

      {attachment ? (
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 px-4 py-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-red-500/10">
            <FileText className="size-5 text-red-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{attachment.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatSize(attachment.sizeBytes)} · enviado com o email
            </p>
          </div>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      ) : (
        <label
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border/60 bg-background/30 px-4 py-4 transition-colors hover:border-primary/40 hover:bg-primary/5",
            disabled && "pointer-events-none opacity-50"
          )}
        >
          <Paperclip className="size-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Anexar apresentação PDF</p>
            <p className="text-xs text-muted-foreground">Máx. 2 MB</p>
          </div>
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}