import {
  emailValidationResultToLeadUpdate,
  isEmailSyntaxValid,
  normalizeEmail,
  validateEmailLocally,
} from "./email-validation.ts";
import type {
  EmailValidationResult,
  LeadEmailValidationUpdate,
} from "../types/email-validation.ts";
import type { Lead } from "../types/lead.ts";

const DEFINITIVE_INVALID_REASONS = new Set([
  "no_email",
  "invalid_syntax",
  "domain_not_found",
  "no_mx_records",
  "duplicate",
]);

export const AGENT_THREE_VALIDATING_MESSAGE =
  "Validando leads da campanha…";
export const AGENT_THREE_LEAD_READY_MESSAGE = "Lead pronto para envio.";
export const AGENT_THREE_DNS_INCOMPLETE_MESSAGE =
  "Não foi possível concluir a validação DNS.";

export type AgentThreeLeadValidator = (
  email: string | null | undefined
) => Promise<EmailValidationResult>;

export interface AgentThreeAutomaticValidationUpdate {
  leadId: string;
  validation: LeadEmailValidationUpdate;
}

export interface AgentThreeAutomaticValidationResult {
  leads: Lead[];
  updates: AgentThreeAutomaticValidationUpdate[];
  validatedCount: number;
  invalidCount: number;
  dnsErrorCount: number;
}

export interface AgentThreeAutomaticValidationOptions {
  shouldSkip?: (lead: Lead) => boolean;
  now?: () => string;
}

export function hasSufficientLocalEmailEvidence(lead: Lead): boolean {
  const normalizedEmail =
    normalizeEmail(lead.normalizedEmail) ?? normalizeEmail(lead.email);
  const reason = lead.emailValidationReason ?? "";

  if (
    lead.emailValidationStatus === "duplicate" ||
    DEFINITIVE_INVALID_REASONS.has(reason)
  ) {
    return true;
  }
  if (!normalizedEmail || !isEmailSyntaxValid(normalizedEmail)) {
    return false;
  }
  if (lead.emailValidationStatus === "valid") return true;
  if (lead.hasMxRecords === true) return true;
  return (
    lead.emailValidationStatus === "unknown" &&
    reason === "mailbox_not_verified"
  );
}

function isDefinitivelyInvalid(result: EmailValidationResult): boolean {
  return (
    result.status === "invalid" ||
    result.status === "no_email" ||
    result.status === "duplicate" ||
    DEFINITIVE_INVALID_REASONS.has(result.reason)
  );
}

export async function validateAgentThreeCampaignLeads(
  leads: Lead[],
  validate: AgentThreeLeadValidator,
  options: AgentThreeAutomaticValidationOptions = {}
): Promise<AgentThreeAutomaticValidationResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const updatedLeads: Lead[] = [];
  const updates: AgentThreeAutomaticValidationUpdate[] = [];
  let validatedCount = 0;
  let invalidCount = 0;
  let dnsErrorCount = 0;

  for (const lead of leads) {
    if (
      options.shouldSkip?.(lead) ||
      hasSufficientLocalEmailEvidence(lead)
    ) {
      updatedLeads.push(lead);
      continue;
    }

    let result: EmailValidationResult;
    try {
      result = await validate(lead.email);
    } catch {
      result = await validateEmailLocally(
        lead.email,
        async () => {
          throw new Error("DNS validation failed");
        },
        now()
      );
    }

    const validation = emailValidationResultToLeadUpdate(result);
    updatedLeads.push({ ...lead, ...validation });
    updates.push({ leadId: lead.id, validation });
    validatedCount += 1;
    if (isDefinitivelyInvalid(result)) invalidCount += 1;
    if (result.reason === "dns_error") dnsErrorCount += 1;
  }

  return {
    leads: updatedLeads,
    updates,
    validatedCount,
    invalidCount,
    dnsErrorCount,
  };
}
