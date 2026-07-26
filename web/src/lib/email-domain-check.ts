import {
  resolve4,
  resolve6,
  resolveMx,
} from "node:dns/promises";
import type { MxRecord } from "node:dns";
import type { EmailDomainCheckResult } from "../types/email-validation.ts";

export interface EmailDnsResolver {
  resolveMx(domain: string): Promise<MxRecord[]>;
  resolve4(domain: string): Promise<string[]>;
  resolve6(domain: string): Promise<string[]>;
}

const nativeResolver: EmailDnsResolver = { resolveMx, resolve4, resolve6 };

class DnsTimeoutError extends Error {}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  const code = (error as { code: unknown }).code;
  return typeof code === "string" ? code : null;
}

function isMissingRecordError(error: unknown): boolean {
  const code = errorCode(error);
  return code === "ENODATA" || code === "ENOTFOUND" || code === "NXDOMAIN";
}

async function domainHasAddress(
  domain: string,
  resolver: EmailDnsResolver
): Promise<boolean> {
  const results = await Promise.allSettled([
    resolver.resolve4(domain),
    resolver.resolve6(domain),
  ]);
  if (
    results.some(
      (result) => result.status === "fulfilled" && result.value.length > 0
    )
  ) {
    return true;
  }

  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (failures.every((result) => isMissingRecordError(result.reason))) {
    return false;
  }
  throw failures[0]?.reason ?? new Error("DNS lookup failed");
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
    if (!isMissingRecordError(error)) throw error;
    const exists = await domainHasAddress(domain, resolver);
    return {
      domain,
      exists,
      hasMxRecords: false,
      reason: exists ? "no_mx_records" : "domain_not_found",
    };
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
      reason: error instanceof DnsTimeoutError ? "dns_error" : "dns_error",
    };
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
