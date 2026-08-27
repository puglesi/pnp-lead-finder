"use client";

import { useState } from "react";
import { Eye, FileText, Mail, Monitor, Paperclip, Reply, Smartphone, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  appendUnsubscribeFooter,
  formatFromHeader,
  renderFullCampaignEmail,
  renderEmailTemplate,
  PREVIEW_SAMPLE_LEAD,
} from "@/lib/email-templates";
import type {
  CampaignAttachment,
  CampaignSendConfig,
  CampaignSignature,
} from "@/types/campaign";
import type { Lead } from "@/types/lead";
import { cn } from "@/lib/utils";

interface EmailPreviewPanelProps {
  subject: string;
  body: string;
  signature?: CampaignSignature | null;
  sendConfig?: Partial<CampaignSendConfig>;
  previewLead?: Lead | null;
  availableLeads?: Lead[];
  onPreviewLeadChange?: (leadId: string) => void;
  attachment?: CampaignAttachment | null;
  className?: string;
}

export function EmailPreviewPanel({
  subject,
  body,
  signature,
  sendConfig,
  previewLead,
  availableLeads = [],
  onPreviewLeadChange,
  attachment,
  className,
}: EmailPreviewPanelProps) {
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
  const lead = previewLead ?? PREVIEW_SAMPLE_LEAD;

  const fromName = sendConfig?.fromName ?? "Panek Pugliesi";
  const fromEmail = sendConfig?.fromEmail ?? "outreach@panekpuglesi.co.uk";
  const replyTo = sendConfig?.replyTo ?? "info@panekpuglesi.co.uk";
  const unsubscribeLink = sendConfig?.unsubscribeLink ?? "";

  const renderedSubject = renderEmailTemplate(subject, lead);
  const renderedBodyHtml = appendUnsubscribeFooter(
    renderFullCampaignEmail(body, signature, lead),
    unsubscribeLink,
    lead
  );
  const fromHeader = formatFromHeader(fromName, fromEmail);

  return (
    <Card
      className={cn(
        "border-border/60 bg-gradient-to-br from-card via-card to-slate-500/5",
        className
      )}
    >
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye className="size-4 text-emerald-400" />
          Preview do email
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border/60 bg-background/40 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("desktop")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors",
                viewMode === "desktop"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Monitor className="size-3.5" />
              Desktop
            </button>
            <button
              type="button"
              onClick={() => setViewMode("mobile")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors",
                viewMode === "mobile"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Smartphone className="size-3.5" />
              Mobile
            </button>
          </div>
          <Badge variant="outline" className="text-[10px]">
            Ao vivo
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {availableLeads.length > 1 && onPreviewLeadChange && (
          <div className="flex flex-wrap gap-1.5">
            {availableLeads.slice(0, 6).map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => onPreviewLeadChange(l.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-all",
                  lead.id === l.id
                    ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100"
                    : "border-border/60 text-muted-foreground hover:border-emerald-400/30"
                )}
              >
                {l.company.slice(0, 20)}
                {l.company.length > 20 ? "…" : ""}
              </button>
            ))}
          </div>
        )}

        <div className="email-inbox-tray">
          <div
            className={cn(
              "email-frame transition-all duration-300",
              viewMode === "mobile" && "email-frame--mobile"
            )}
          >
            <div className="flex items-center gap-2 border-b border-[#e5e7eb] bg-[#f9fafb] px-4 py-2">
              <div className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-[#fca5a5]" />
                <span className="size-2.5 rounded-full bg-[#fcd34d]" />
                <span className="size-2.5 rounded-full bg-[#86efac]" />
              </div>
              <span className="text-xs text-[#6b7280]">
                {viewMode === "mobile" ? "Mail · iPhone" : "Inbox · 680px"}
              </span>
            </div>

            <div
              className={cn(
                "email-meta-header space-y-2.5 text-sm",
                viewMode === "mobile" ? "px-4 py-3" : "px-6 py-4"
              )}
            >
              <PreviewRow icon={User} label="De" value={fromHeader} />
              <PreviewRow
                icon={User}
                label="Para"
                value={lead.email ?? ""}
                sub={lead.company}
              />
              <PreviewRow icon={Reply} label="Reply-To" value={replyTo} muted />
              <PreviewRow
                icon={Mail}
                label="Assunto"
                value={renderedSubject || "—"}
                bold
              />
            </div>

            <div
              className={cn(
                "email-canvas",
                viewMode === "mobile" ? "px-4 py-5" : "px-8 py-7"
              )}
            >
              {renderedBodyHtml ? (
                <div
                  className="email-preview-content"
                  dangerouslySetInnerHTML={{ __html: renderedBodyHtml }}
                />
              ) : (
                <p className="italic text-[#9ca3af]">Corpo vazio...</p>
              )}
              {attachment && (
                <div className="mt-6 flex items-center gap-3 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3">
                  <FileText className="size-5 shrink-0 text-red-500" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-[#111827]">
                      <Paperclip className="size-3.5 text-[#6b7280]" />
                      {attachment.name}
                    </p>
                    <p className="text-xs text-[#6b7280]">
                      Anexo PDF · {(attachment.sizeBytes / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewRow({
  icon: Icon,
  label,
  value,
  sub,
  bold,
  muted,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  sub?: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex gap-2.5">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-[#9ca3af]" />
      <div className="min-w-0 flex-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[#9ca3af]">
          {label}
        </span>
        <p
          className={cn(
            "truncate text-[#111827]",
            bold && "text-[15px] font-semibold",
            muted && "text-[#6b7280]"
          )}
        >
          {value}
        </p>
        {sub && (
          <p className="truncate text-xs text-[#6b7280]">{sub}</p>
        )}
      </div>
    </div>
  );
}
