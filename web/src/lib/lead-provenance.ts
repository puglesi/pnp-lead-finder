import type {
  EmailDiscoveryMethod,
  EmailQualityClass,
  Lead,
} from "../types/lead.ts";
import { isSyntheticLead } from "./search/real-search-guard.ts";
import { classifyLocationMatch, extractUkPostcode } from "./location-match.ts";
import { normalizeEmail } from "./email-validation.ts";

const GUESSED_LOCAL_PARTS = new Set([
  "info",
  "hello",
  "contact",
  "enquiries",
  "office",
  "sales",
  "team",
  "admin",
  "support",
]);

const GARBAGE_EMAIL_DOMAINS = new Set([
  "email.com",
  "domain.com",
  "doe.com",
  "example.com",
  "test.com",
]);

function websiteHost(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(website) ? website : "https://" + website
    );
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function hasDiscoveredEmail(lead: Pick<Lead, "email" | "normalizedEmail" | "emailIsGuessed" | "emailSourceUrl" | "emailDiscoveryMethod" | "emailSourceType" | "importBatchId">): boolean {
  const email = normalizeEmail(lead.normalizedEmail) ?? normalizeEmail(lead.email);
  if (!email) return false;
  if (lead.emailIsGuessed === true) return false;
  return Boolean(
    (lead.emailSourceUrl && lead.emailSourceUrl.trim()) ||
      lead.emailDiscoveryMethod ||
      lead.emailSourceType ||
      (typeof lead.importBatchId === "string" && lead.importBatchId.trim())
  );
}

export function hasDiscoveredPhone(lead: Pick<Lead, "phone" | "phoneSourceUrl">): boolean {
  const phone = (lead.phone ?? "").trim();
  if (!phone || phone === "—") return false;
  return Boolean(lead.phoneSourceUrl && lead.phoneSourceUrl.trim());
}

export function looksLikeGuessedEmail(
  email: string | null | undefined,
  website: string | null | undefined
): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const [local, domain] = normalized.split("@");
  if (!domain) return false;
  if (GARBAGE_EMAIL_DOMAINS.has(domain)) return true;
  const host = websiteHost(website);
  if (host && domain === host && GUESSED_LOCAL_PARTS.has(local ?? "")) {
    return true;
  }
  return false;
}

export function classifyEmailQuality(lead: Lead): EmailQualityClass {
  const stamped = stampLegacyLeadQuality(lead);
  if (!hasDiscoveredEmail(stamped)) {
    if (normalizeEmail(stamped.email) || normalizeEmail(stamped.normalizedEmail)) {
      return "GUESS_NOT_VERIFIED";
    }
    return "NO_EMAIL";
  }
  const status = stamped.emailValidationStatus;
  const reason = stamped.emailValidationReason ?? "";
  if (status === "valid") return "VALID_CONFIRMED";
  if (reason === "invalid_syntax") return "INVALID_SYNTAX";
  if (reason === "domain_not_found") return "DOMAIN_NOT_FOUND";
  if (reason === "no_mx_records") return "NO_MX";
  if (
    status === "unknown" &&
    (reason === "mailbox_not_verified" || stamped.hasMxRecords === true)
  ) {
    return "VALID_MX_UNVERIFIED";
  }
  if (status === "invalid") {
    if (reason === "invalid_syntax") return "INVALID_SYNTAX";
    if (reason === "domain_not_found") return "DOMAIN_NOT_FOUND";
    if (reason === "no_mx_records") return "NO_MX";
  }
  return "UNKNOWN";
}

export function emailQualityLabel(quality: EmailQualityClass): string {
  switch (quality) {
    case "VALID_CONFIRMED":
      return "Caixa confirmada";
    case "VALID_MX_UNVERIFIED":
      return "Domínio/MX válido — caixa postal não confirmada.";
    case "UNKNOWN":
      return "Validação desconhecida";
    case "INVALID_SYNTAX":
      return "Sintaxe inválida";
    case "DOMAIN_NOT_FOUND":
      return "Domínio não encontrado";
    case "NO_MX":
      return "Sem registros MX";
    case "GUESS_NOT_VERIFIED":
      return "E-mail presumido — sem fonte real";
    case "NO_EMAIL":
      return "Sem e-mail";
  }
}

function inferSourceKind(lead: Lead): NonNullable<Lead["sourceKind"]> {
  if (lead.sourceKind) return lead.sourceKind;
  const id = String(lead.id ?? "");
  if (id.startsWith("serp-")) return "serpapi";
  if (id.startsWith("auto-") && !id.startsWith("auto-sup-")) return "autonomous";
  if (id.startsWith("gcs-")) return "google-custom";
  if (id.startsWith("auto-sup-") || id.startsWith("mock-")) return "mock";
  return "unknown";
}

/**
 * Annotate persisted/legacy leads without deleting them.
 * Guessed emails stay on the record but are not campaign-discovered.
 */
export function stampLegacyLeadQuality(lead: Lead, requestedLocation?: string): Lead {
  const sourceKind = inferSourceKind(lead);
  const synthetic = isSyntheticLead({ ...lead, sourceKind });
  const email = normalizeEmail(lead.normalizedEmail) ?? normalizeEmail(lead.email);
  const hasSource = Boolean(
    (lead.emailSourceUrl && lead.emailSourceUrl.trim()) ||
      lead.emailDiscoveryMethod ||
      lead.emailSourceType ||
      (typeof lead.importBatchId === "string" && lead.importBatchId.trim())
  );
  let emailIsGuessed = lead.emailIsGuessed === true;
  if (email && !hasSource) {
    emailIsGuessed = true;
  } else if (email && looksLikeGuessedEmail(email, lead.website) && !hasSource) {
    emailIsGuessed = true;
  }

  const location = requestedLocation ?? lead.requestedLocation ?? "";
  const address = lead.discoveredAddress || lead.address || "";
  const postcode = lead.postcode ?? extractUkPostcode(address);
  const locationMatch =
    lead.locationMatch ??
    (location
      ? classifyLocationMatch({
          requestedLocation: location,
          address,
          postcode,
        })
      : lead.locationMatch);

  return {
    ...lead,
    synthetic,
    syntheticReason:
      lead.syntheticReason ??
      (synthetic ? "mock_or_padding" : undefined),
    sourceKind,
    emailIsGuessed: email ? emailIsGuessed : false,
    requestedLocation: location || lead.requestedLocation,
    discoveredAddress: lead.discoveredAddress || (lead.address ? lead.address : undefined),
    postcode: postcode ?? lead.postcode ?? null,
    locationMatch,
  };
}

export function discoveryMethodFromUrl(
  pageUrl: string,
  fallback: EmailDiscoveryMethod = "website_home"
): EmailDiscoveryMethod {
  try {
    const path = new URL(pageUrl).pathname.toLowerCase();
    if (/(^|\/)(contact|contact-us|get-in-touch|enquiries)(\/|$)/.test(path)) {
      return "website_contact";
    }
    if (/(^|\/)(about|about-us)(\/|$)/.test(path)) return "website_about";
    if (/(^|\/)team(\/|$)/.test(path)) return "website_team";
    if (path === "/" || path === "") return "website_home";
  } catch {
    // keep fallback
  }
  return fallback;
}
