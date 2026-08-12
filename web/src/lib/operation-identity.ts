/**
 * Operation-scoped send identity: SMTP account labels + email signatures.
 * P&P and Modeclean never share signatures or account display labels.
 */
import type { CampaignSignature } from "../types/campaign.ts";
import type { CampaignProfileId } from "../types/campaign-profile.ts";
import { getCampaignProfileName } from "../types/campaign-profile.ts";
import { DEFAULT_SIGNATURE_HTML } from "./signature-template.ts";
import { getEmailTemplateSenderName } from "./email-template-library.ts";

export type RecipientSourceMode = "campaign" | "import";

export interface OperationSendAccount {
  fromName: string;
  fromEmail: string;
  replyTo: string;
  /** Human label for preflight UI (never the password). */
  accountLabel: string;
  signatureLabel: string;
  profileName: string;
}

export const PNP_SEND_ACCOUNT = {
  fromName: "Panek Pugliesi",
  fromEmail: "outreach@panekpuglesi.co.uk",
  replyTo: "info@panekpuglesi.co.uk",
} as const;

export const MODECLEAN_SEND_ACCOUNT = {
  fromName: "Modeclean",
  fromEmail: "outreach@modeclean.co.uk",
  replyTo: "info@modeclean.co.uk",
} as const;

/** Default Modeclean HTML signature (separate from P&P). */
export const MODECLEAN_DEFAULT_SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;padding-top:18px;border-top:2px solid #0f766e;font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#1a1a1a;">
<tr>
<td style="padding-bottom:10px;">
<p style="margin:0;font-size:18px;font-weight:700;color:#0f766e;letter-spacing:0.5px;">MODECLEAN</p>
<p style="margin:4px 0 0;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#6b7280;">Commercial Cleaning</p>
</td>
</tr>
<tr>
<td style="padding-bottom:10px;">
<p style="margin:0;font-size:14px;font-weight:600;color:#111827;">Modeclean Team</p>
</td>
</tr>
<tr>
<td style="padding-bottom:10px;">
<p style="margin:0;font-size:12px;line-height:1.7;color:#374151;">
E&nbsp;<a href="mailto:info@modeclean.co.uk" style="color:#0f766e;text-decoration:none;">info@modeclean.co.uk</a>
&nbsp;|&nbsp;
W&nbsp;<a href="https://www.modeclean.co.uk" style="color:#0f766e;text-decoration:none;">www.modeclean.co.uk</a>
</p>
</td>
</tr>
<tr>
<td style="padding-top:10px;border-top:1px solid #e5e7eb;">
<p style="margin:0;font-size:9px;line-height:1.45;color:#9ca3af;">This e-mail and any attachments are confidential. If you are not the intended recipient, please delete this message. Modeclean Ltd.</p>
</td>
</tr>
</table>`;

export function getDefaultSignatureHtml(
  operation: CampaignProfileId
): string {
  return operation === "modeclean"
    ? MODECLEAN_DEFAULT_SIGNATURE_HTML
    : DEFAULT_SIGNATURE_HTML;
}

export function getDefaultOperationSignature(
  operation: CampaignProfileId
): CampaignSignature {
  return {
    enabled: true,
    body: getDefaultSignatureHtml(operation),
  };
}

export function getOperationSendAccount(
  operation: CampaignProfileId
): OperationSendAccount {
  const base =
    operation === "modeclean" ? MODECLEAN_SEND_ACCOUNT : PNP_SEND_ACCOUNT;
  const profileName = getCampaignProfileName(operation);
  return {
    fromName: getEmailTemplateSenderName(operation),
    fromEmail: base.fromEmail,
    replyTo: base.replyTo,
    accountLabel: base.fromEmail,
    signatureLabel: profileName,
    profileName,
  };
}

/**
 * Pure rules for Agent 3 step-2 UI.
 * Campaign mode → campaign picker; Import mode → template picker.
 * Never both at once.
 */
export function agentThreeStepTwoKind(
  mode: RecipientSourceMode
): "campaign" | "template" {
  return mode === "import" ? "template" : "campaign";
}

export function isImportRecipientMode(mode: RecipientSourceMode): boolean {
  return mode === "import";
}

/**
 * Import-mode campaigns must only keep leadIds from the import set.
 * Used by tests and guards — never merge old campaign recipients.
 */
export function filterLeadIdsToImportSet(
  campaignLeadIds: readonly string[] | null | undefined,
  importLeadIds: readonly string[]
): string[] {
  const allowed = new Set(importLeadIds);
  return (Array.isArray(campaignLeadIds) ? campaignLeadIds : []).filter((id) =>
    allowed.has(id)
  );
}

export function templatesBelongToOperation(
  templates: readonly { id: string; operation: CampaignProfileId }[],
  operation: CampaignProfileId
): boolean {
  return templates.every((t) => t.operation === operation);
}
