import { resolveMx } from "node:dns/promises";
import type { MxRecord } from "node:dns";
import type { EmailDomainCheckResult } from "../types/email-validation.ts";

export interface EmailDnsResolver {
  resolveMx(domain: string): Promise<MxRecord[]>;
}

const nativeResolver: EmailDnsResolver = { resolveMx };

class DnsTimeoutError extends Error {}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  const code = (error as { code: unknown }).code;
  return typeof code === "string" ? code.toUpperCase() : null;
}

function technicalDnsErrorMessage(error: unknown): string {
  if (error instanceof DnsTimeoutError || errorCode(error) === "ETIMEOUT") {
    return "Tempo limite excedido na consulta DNS. Tente novamente.";
  }

  switch (errorCode(error)) {
    case "EAI_AGAIN":
      return "O serviço DNS está temporariamente indisponível. Tente novamente.";
    case "SERVFAIL":
    case "ESERVFAIL":
      return "O servidor DNS não conseguiu concluir a consulta. Tente novamente.";
    case "ECONNRESET":
      return "A conexão com o serviço DNS foi interrompida. Tente novamente.";
    default:
      return "Falha técnica na resolução DNS. Tente novamente.";
  }
}

async function checkWithoutTimeout(
  domain: string,
  resolver: EmailDnsResolver
): Promise<EmailDomainCheckResult> {
  try {
    const records = await resolver.resolveMx(domain);
    const hasMxRecords = records.some(
      (record) => Boolean(record.exchange) && record.exchange !== "."
    );
    return {
      domain,
      exists: true,
      hasMxRecords,
      reason: hasMxRecords ? null : "no_mx_records",
    };
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOTFOUND" || code === "NXDOMAIN") {
      return {
        domain,
        exists: false,
        hasMxRecords: false,
        reason: "domain_not_found",
      };
    }
    if (code === "ENODATA") {
      return {
        domain,
        exists: true,
        hasMxRecords: false,
        reason: "no_mx_records",
      };
    }
    throw error;
  }
}

export async function checkEmailDomain(
  domain: string,
  resolver: EmailDnsResolver = nativeResolver,
  timeoutMs = 4_000
): Promise<EmailDomainCheckResult> {
  const cleanDomain = domain.trim().toLowerCase();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      checkWithoutTimeout(cleanDomain, resolver),
      new Promise<EmailDomainCheckResult>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new DnsTimeoutError("DNS lookup timed out")),
          timeoutMs
        );
      }),
    ]);
  } catch (error) {
    return {
      domain: cleanDomain,
      exists: false,
      hasMxRecords: false,
      reason: "dns_error",
      errorMessage: technicalDnsErrorMessage(error),
    };
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
