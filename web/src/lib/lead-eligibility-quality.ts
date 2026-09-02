import type { EmailValidationStatus } from "../types/email-validation.ts";
import type { Lead } from "../types/lead.ts";
import { isEmailSyntaxValid, normalizeEmail } from "./email-validation.ts";
import { hasDiscoveredEmail, stampLegacyLeadQuality } from "./lead-provenance.ts";
import {
  DEFAULT_LOCATION_FILTER,
  isGeographicallyEligible,
  shouldApplyGeoLocationFilter,
  type LocationFilterOptions,
} from "./location-match.ts";
import { isSyntheticLead } from "./search/real-search-guard.ts";

export type LeadQualityExclusionCode =
  | "no_email"
  | "invalid_syntax"
  | "domain_not_found"
  | "no_mx_records"
  | "duplicate_validation"
  | "synthetic"
  | "guess_not_verified"
  | "outside_target"
  | "unknown_location"
  | "validation_pending";

export interface LeadQualityEligibility {
  eligible: boolean;
  exclusionCode: LeadQualityExclusionCode | null;
  reason: string;
  validationStatus: EmailValidationStatus;
  validationReason: string;
  normalizedEmail: string | null;
  lead: Lead;
}

/** Canonical quality gate shared by preflight, queue and UI counters. */
export function evaluateLeadQualityEligibility(
  lead: Lead,
  locationFilter: LocationFilterOptions = DEFAULT_LOCATION_FILTER
): LeadQualityEligibility {
  const stamped = stampLegacyLeadQuality(lead);
  const normalizedEmail =
    normalizeEmail(stamped.normalizedEmail) ?? normalizeEmail(stamped.email);
  const validationStatus = stamped.emailValidationStatus ?? "pending";
  const validationReason =
    stamped.emailValidationReason ??
    (stamped.emailValidationStatus ? "reason_not_recorded" : "awaiting_validation");
  const result = (
    eligible: boolean,
    exclusionCode: LeadQualityExclusionCode | null,
    reason: string
  ): LeadQualityEligibility => ({
    eligible,
    exclusionCode,
    reason,
    validationStatus,
    validationReason,
    normalizedEmail,
    lead: stamped,
  });

  if (
    shouldApplyGeoLocationFilter(stamped.requestedLocation) &&
    !isGeographicallyEligible(stamped.locationMatch, locationFilter)
  ) {
    return stamped.locationMatch === "outside_target"
      ? result(false, "outside_target", "Fora da área geográfica alvo")
      : result(false, "unknown_location", "Localização não confirmada");
  }
  if (isSyntheticLead(stamped)) {
    return result(false, "synthetic", "Lead sintético/mock");
  }
  if (!normalizedEmail) return result(false, "no_email", "Sem e-mail");
  if (!isEmailSyntaxValid(normalizedEmail)) {
    return result(false, "invalid_syntax", "Sintaxe de e-mail inválida");
  }
  if (!hasDiscoveredEmail(stamped) || stamped.emailIsGuessed === true) {
    return result(false, "guess_not_verified", "E-mail presumido sem proveniência verificável");
  }
  if (validationStatus === "duplicate" || validationReason.startsWith("duplicate")) {
    return result(false, "duplicate_validation", "Duplicado marcado na validação deste lead");
  }
  if (validationReason === "domain_not_found") {
    return result(false, "domain_not_found", "Domínio não encontrado");
  }
  if (validationReason === "no_mx_records") {
    return result(false, "no_mx_records", "Domínio sem registros MX");
  }
  if (validationReason === "invalid_syntax" || validationStatus === "invalid") {
    return result(false, "invalid_syntax", "Sintaxe de e-mail inválida");
  }
  if (validationStatus === "valid") return result(true, null, "E-mail validado");
  if (
    validationStatus === "unknown" &&
    validationReason === "mailbox_not_verified"
  ) {
    return result(true, null, "MX válido; caixa postal não confirmada");
  }
  if (stamped.hasMxRecords === true) {
    return result(true, null, "Domínio com MX válido");
  }
  return result(false, "validation_pending", "Validação de e-mail inconclusiva");
}
