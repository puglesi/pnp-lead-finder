import type {
  EmailDomainCheckResult,
  EmailValidationProvider,
  EmailValidationResult,
} from "../types/email-validation.ts";

export type EmailDomainChecker = (
  domain: string
) => Promise<EmailDomainCheckResult>;

const ROLE_BASED_LOCAL_PARTS = new Set([
  "info",
  "contact",
  "office",
  "sales",
  "admin",
  "support",
  "hello",
  "enquiries",
  "reception",
  "accounts",
]);

const LOCAL_PART_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i;
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export function normalizeEmail(
  email: string | null | undefined
): string | null {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase().replace(/\s+/g, "");
  return normalized || null;
}

export function isEmailSyntaxValid(email: string): boolean {
  if (email.length > 254 || email.includes("..")) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [localPart, domain] = parts;
  if (
    !localPart ||
    localPart.length > 64 ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    !LOCAL_PART_PATTERN.test(localPart)
  ) {
    return false;
  }

  const labels = domain.split(".");
  return (
    domain.length <= 253 &&
    labels.length >= 2 &&
    labels.every((label) => DOMAIN_LABEL_PATTERN.test(label)) &&
    labels.at(-1)!.length >= 2
  );
}

export function isRoleBasedEmail(email: string): boolean {
  const localPart = email.split("@")[0]?.split("+")[0] ?? "";
  return ROLE_BASED_LOCAL_PARTS.has(localPart);
}

export async function validateEmailLocally(
  email: string | null | undefined,
  checkDomain: EmailDomainChecker,
  validatedAt = new Date().toISOString()
): Promise<EmailValidationResult> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return {
      status: "no_email",
      reason: "no_email",
      normalizedEmail: null,
      domain: null,
      hasMxRecords: null,
      isRoleBasedEmail: false,
      provider: "local_dns",
      validatedAt,
    };
  }

  const domain = normalizedEmail.split("@")[1] ?? null;
  const roleBased = isRoleBasedEmail(normalizedEmail);
  if (!domain || !isEmailSyntaxValid(normalizedEmail)) {
    return {
      status: "invalid",
      reason: "invalid_syntax",
      normalizedEmail,
      domain,
      hasMxRecords: null,
      isRoleBasedEmail: roleBased,
      provider: "local_dns",
      validatedAt,
    };
  }

  let domainResult: EmailDomainCheckResult;
  try {
    domainResult = await checkDomain(domain);
  } catch {
    return {
      status: "unknown",
      reason: "dns_error",
      normalizedEmail,
      domain,
      hasMxRecords: null,
      isRoleBasedEmail: roleBased,
      provider: "local_dns",
      validatedAt,
      errorMessage: "Falha técnica na resolução DNS. Tente novamente.",
    };
  }

  if (domainResult.reason === "dns_error") {
    return {
      status: "unknown",
      reason: "dns_error",
      normalizedEmail,
      domain,
      hasMxRecords: null,
      isRoleBasedEmail: roleBased,
      provider: "local_dns",
      validatedAt,
      errorMessage:
        domainResult.errorMessage ??
        "Falha técnica na resolução DNS. Tente novamente.",
    };
  }

  if (!domainResult.exists || domainResult.reason === "domain_not_found") {
    return {
      status: "invalid",
      reason: "domain_not_found",
      normalizedEmail,
      domain,
      hasMxRecords: false,
      isRoleBasedEmail: roleBased,
      provider: "local_dns",
      validatedAt,
    };
  }

  if (!domainResult.hasMxRecords) {
    return {
      status: "invalid",
      reason: "no_mx_records",
      normalizedEmail,
      domain,
      hasMxRecords: false,
      isRoleBasedEmail: roleBased,
      provider: "local_dns",
      validatedAt,
    };
  }

  return {
    status: "unknown",
    reason: "mailbox_not_verified",
    normalizedEmail,
    domain,
    hasMxRecords: true,
    isRoleBasedEmail: roleBased,
    provider: "local_dns",
    validatedAt,
  };
}

export function createLocalEmailValidationProvider(
  checkDomain: EmailDomainChecker
): EmailValidationProvider {
  return {
    id: "local_dns",
    validate: (email) => validateEmailLocally(email, checkDomain),
  };
}
