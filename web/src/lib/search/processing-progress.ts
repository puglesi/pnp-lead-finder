import type { Lead } from "../../types/lead.ts";

export interface LeadProcessingProgress {
  total: number;
  enrichmentCompleted: number;
  validationCompleted: number;
  scoringCompleted: number;
  pending: number;
  failed: number;
}

export function getLeadProcessingProgress(leads: readonly Lead[]): LeadProcessingProgress {
  const enrichmentCompleted = leads.filter(
    (lead) => lead.enrichmentStatus === "completed" || lead.enrichmentStatus === "skipped"
  ).length;
  const validationCompleted = leads.filter(
    (lead) => !lead.email || Boolean(lead.emailValidatedAt)
  ).length;
  const scoringCompleted = leads.filter(
    (lead) => lead.scoringStatus === "completed" || Number.isFinite(lead.aiScore)
  ).length;
  const failed = leads.filter(
    (lead) =>
      lead.enrichmentStatus === "failed" ||
      lead.scoringStatus === "failed" ||
      lead.emailValidationReason === "validation_error" ||
      lead.emailValidationReason === "dns_error"
  ).length;
  return {
    total: leads.length,
    enrichmentCompleted,
    validationCompleted,
    scoringCompleted,
    pending: Math.max(0, leads.length - validationCompleted - failed),
    failed,
  };
}
