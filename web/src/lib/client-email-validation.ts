import {
  createLocalEmailValidationProvider,
  type EmailDomainChecker,
} from "./email-validation.ts";
import type { EmailDomainCheckResult } from "../types/email-validation.ts";

function isDomainCheckResult(
  value: unknown
): value is EmailDomainCheckResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "domain" in value &&
    typeof value.domain === "string" &&
    "exists" in value &&
    typeof value.exists === "boolean" &&
    "hasMxRecords" in value &&
    typeof value.hasMxRecords === "boolean" &&
    "reason" in value &&
    (value.reason === null ||
      value.reason === "domain_not_found" ||
      value.reason === "no_mx_records" ||
      value.reason === "dns_error") &&
    (!("errorMessage" in value) ||
      typeof value.errorMessage === "string")
  );
}

export const checkEmailDomainFromApi: EmailDomainChecker = async (
  domain
) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8_000);
  let response: Response;
  try {
    response = await fetch("/api/email-validation/domain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ domain }),
    });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response.ok) {
    throw new Error("Falha ao verificar o domínio do e-mail");
  }
  const result: unknown = await response.json();
  if (!isDomainCheckResult(result)) {
    throw new Error("Resposta inválida da verificação de domínio");
  }
  return result;
};

export const localEmailValidationProvider =
  createLocalEmailValidationProvider(checkEmailDomainFromApi);
