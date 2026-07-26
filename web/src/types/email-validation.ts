export type EmailValidationStatus =
  | "pending"
  | "validating"
  | "valid"
  | "invalid"
  | "duplicate"
  | "risky"
  | "catch_all"
  | "unknown"
  | "no_email";

export type EmailValidationProviderId = "local_dns";

export type EmailDomainCheckReason =
  | "domain_not_found"
  | "no_mx_records"
  | "dns_error";

export interface EmailDomainCheckResult {
  domain: string;
  exists: boolean;
  hasMxRecords: boolean;
  reason: EmailDomainCheckReason | null;
}

export interface EmailValidationResult {
  status: EmailValidationStatus;
  reason: string;
  normalizedEmail: string | null;
  domain: string | null;
  hasMxRecords: boolean | null;
  isRoleBasedEmail: boolean;
  provider: EmailValidationProviderId;
  validatedAt: string;
}

export interface LeadEmailValidationUpdate {
  emailValidationStatus: EmailValidationStatus;
  emailValidationReason: string;
  normalizedEmail?: string;
  emailValidatedAt: string;
  emailValidationProvider: EmailValidationProviderId;
  emailDomain?: string;
  hasMxRecords?: boolean;
  isRoleBasedEmail: boolean;
}

export interface EmailValidationProvider {
  readonly id: EmailValidationProviderId;
  validate(email: string | null | undefined): Promise<EmailValidationResult>;
}
