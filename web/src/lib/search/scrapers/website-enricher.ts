import { decodeHtmlEntities, fetchSearchHtml } from "./fetch-html.ts";
import { pickBestPhoneFromHtml, type ExtractedPhone } from "../../uk-phone.ts";

const EMAIL_REGEX =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const CONTACT_PATH_REGEX =
  /(?:^|[-_/])(contact|contact-us|get-in-touch|about|about-us|enquiries|team)(?:[-_/]|$)/i;

const DEFAULT_CONTACT_PATHS = [
  "/contact",
  "/contact-us",
  "/about",
  "/about-us",
  "/team",
];

const MAILTO_REGEX =
  /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;

const SKIP_EMAIL_FRAGMENTS = [
  "example.com",
  "sentry.io",
  "wixpress",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "noreply",
  "no-reply",
  "wordpress.org",
  "cloudflare.com",
];

export type WebsiteEmailSourceType =
  | "website_home"
  | "website_contact"
  | "website_footer"
  | "website_about"
  | "website_team";

export interface WebsiteContactInfo {
  email: string | null;
  phone: string | null;
  emailSourceUrl?: string | null;
  emailSourceType?: WebsiteEmailSourceType | null;
  phoneSourceUrl?: string | null;
  phoneRaw?: string | null;
  phoneDiscoveryMethod?: ExtractedPhone["discoveryMethod"] | null;
  phoneConfidence?: ExtractedPhone["confidence"] | null;
  contactPageUrl?: string | null;
  discoveredAddress?: string | null;
  discoveredCompanyName?: string | null;
}

export interface WebsiteLeadContactUpdate extends WebsiteContactInfo {
  id: string;
  enrichmentStatus: "completed" | "failed";
  error?: string;
}

const ENRICHMENT_ITEM_TIMEOUT_MS = 11_000;

async function withItemTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`Enrichment timeout after ${timeoutMs}ms`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

const SKIP_WEBSITE_HOSTS = [
  "google.com",
  "company-information.service.gov.uk",
  "yell.com",
  "192.com",
  "thomsonlocal.com",
  "freeindex.co.uk",
  "cylex-uk.co.uk",
  "touchlocal.com",
];

function decodeNumericEntity(
  match: string,
  decimal: string | undefined,
  hexadecimal: string | undefined
): string {
  const codePoint = Number.parseInt(
    decimal ?? hexadecimal ?? "",
    hexadecimal ? 16 : 10
  );
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return match;
  }
  return String.fromCodePoint(codePoint);
}

function normalizeContactText(html: string): string {
  return decodeHtmlEntities(html)
    .replace(/&#(\d+);|&#x([0-9a-f]+);/gi, decodeNumericEntity)
    .replace(/&commat;/gi, "@")
    .replace(/&period;/gi, ".")
    .replace(/\\u0040/gi, "@")
    .replace(/\\u002e/gi, ".")
    .replace(/\s*(?:\[|\()at(?:\]|\))\s*/gi, "@")
    .replace(/\s*(?:\[|\()dot(?:\]|\))\s*/gi, ".");
}

function emailScore(email: string, preferredDomain?: string): number {
  const [localPart, domain = ""] = email.split("@");
  let score = 0;

  if (preferredDomain && domain === preferredDomain) score += 50;
  if (
    preferredDomain &&
    (domain.endsWith(`.${preferredDomain}`) ||
      preferredDomain.endsWith(`.${domain}`))
  ) {
    score += 25;
  }

  const roleOrder = [
    "info",
    "contact",
    "hello",
    "enquiries",
    "sales",
    "office",
    "admin",
    "reception",
    "support",
  ];
  const roleIndex = roleOrder.indexOf(localPart);
  if (roleIndex >= 0) score += 20 - roleIndex;
  if (domain.endsWith(".uk")) score += 2;

  return score;
}

function pickBestEmail(
  matches: string[],
  preferredDomain?: string
): string | null {
  const filtered = [...new Set(matches.map((email) => email.toLowerCase()))]
    .filter(
      (e) =>
        !SKIP_EMAIL_FRAGMENTS.some((f) => e.includes(f)) &&
        e.length < 80 &&
        e.includes(".") &&
        !/[._-](?:png|jpe?g|gif|webp|svg|woff2?)$/i.test(e)
    );

  return (
    filtered.sort(
      (a, b) =>
        emailScore(b, preferredDomain) - emailScore(a, preferredDomain)
    )[0] ?? null
  );
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) {
    return false;
  }

  const octets = parts.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return true;

  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function normalizeWebsiteUrl(value: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—") return null;

  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`
    );
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;

    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      !hostname ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".test") ||
      hostname.endsWith(".invalid") ||
      hostname.includes(":") ||
      isPrivateIpv4(hostname)
    ) {
      return null;
    }

    if (
      SKIP_WEBSITE_HOSTS.some(
        (host) => hostname === host || hostname.endsWith(`.${host}`)
      )
    ) {
      return null;
    }

    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export function isEnrichableWebsiteUrl(value: string): boolean {
  return normalizeWebsiteUrl(value) !== null;
}

function extractContactUrls(html: string, baseUrl: URL): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const hrefRegex = /href\s*=\s*["']([^"'#]+)["']/gi;

  for (const match of normalizeContactText(html).matchAll(hrefRegex)) {
    try {
      const candidate = new URL(match[1], baseUrl);
      if (
        candidate.hostname !== baseUrl.hostname ||
        !["http:", "https:"].includes(candidate.protocol) ||
        !CONTACT_PATH_REGEX.test(candidate.pathname)
      ) {
        continue;
      }

      candidate.hash = "";
      const value = candidate.toString();
      if (value === baseUrl.toString() || seen.has(value)) continue;
      seen.add(value);
      urls.push(value);
    } catch {
      // Ignora hrefs malformados encontrados no HTML.
    }
  }

  if (urls.length === 0) {
    for (const path of DEFAULT_CONTACT_PATHS) {
      urls.push(new URL(path, baseUrl.origin).toString());
    }
  }

  return urls.slice(0, 4);
}

function sourceTypeFromUrl(pageUrl: string): WebsiteEmailSourceType {
  try {
    const path = new URL(pageUrl).pathname.toLowerCase();
    if (/(contact|enquiries|get-in-touch)/.test(path)) return "website_contact";
    if (/about/.test(path)) return "website_about";
    if (/team/.test(path)) return "website_team";
  } catch {
    // homepage fallback
  }
  return "website_home";
}

function extractContactsFromHtml(
  html: string,
  preferredDomain: string,
  pageUrl: string
): WebsiteContactInfo {
  const normalized = normalizeContactText(html);
  const mailto = [...normalized.matchAll(MAILTO_REGEX)].map((match) => match[1]);
  const emails = [
    ...(normalized.match(EMAIL_REGEX) ?? []),
    ...mailto,
  ];
  const email = pickBestEmail(emails, preferredDomain);
  const extractedPhone = pickBestPhoneFromHtml(html);
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return {
    email,
    phone: extractedPhone?.phone ?? null,
    emailSourceUrl: email ? pageUrl : null,
    emailSourceType: email ? sourceTypeFromUrl(pageUrl) : null,
    phoneSourceUrl: extractedPhone ? pageUrl : null,
    phoneRaw: extractedPhone?.phoneRaw ?? null,
    phoneDiscoveryMethod: extractedPhone?.discoveryMethod ?? null,
    phoneConfidence: extractedPhone?.confidence ?? null,
    contactPageUrl: sourceTypeFromUrl(pageUrl) === "website_contact" ? pageUrl : null,
    discoveredCompanyName: titleMatch?.[1]?.trim() || null,
  };
}

export async function enrichWebsiteContacts(
  websiteUrl: string
): Promise<WebsiteContactInfo> {
  const url = normalizeWebsiteUrl(websiteUrl);
  if (!url) {
    return {
      email: null,
      phone: null,
      emailSourceUrl: null,
      emailSourceType: null,
      phoneSourceUrl: null,
    };
  }
  const preferredDomain = url.hostname.toLowerCase().replace(/^www\./, "");
  const homepageUrl = url.toString();

  try {
    const html = await fetchSearchHtml(homepageUrl, {
      timeoutMs: 4_500,
      maxLength: 750_000,
      isUrlAllowed: isEnrichableWebsiteUrl,
    });
    const homepageContacts = extractContactsFromHtml(
      html,
      preferredDomain,
      homepageUrl
    );
    if (homepageContacts.email && homepageContacts.phone) return homepageContacts;

    for (const contactUrl of extractContactUrls(html, url)) {
      try {
        const contactHtml = await fetchSearchHtml(contactUrl, {
          timeoutMs: 4_500,
          maxLength: 750_000,
          isUrlAllowed: isEnrichableWebsiteUrl,
        });
        const contactPageContacts = extractContactsFromHtml(
          contactHtml,
          preferredDomain,
          contactUrl
        );
        if (contactPageContacts.email || contactPageContacts.phone) {
          return {
            email: homepageContacts.email ?? contactPageContacts.email,
            phone: homepageContacts.phone ?? contactPageContacts.phone,
            emailSourceUrl:
              (homepageContacts.email
                ? homepageContacts.emailSourceUrl
                : contactPageContacts.emailSourceUrl) ?? null,
            emailSourceType:
              (homepageContacts.email
                ? homepageContacts.emailSourceType
                : contactPageContacts.emailSourceType) ?? null,
            phoneSourceUrl:
              (homepageContacts.phone
                ? homepageContacts.phoneSourceUrl
                : contactPageContacts.phoneSourceUrl) ?? null,
            phoneRaw:
              (homepageContacts.phone
                ? homepageContacts.phoneRaw
                : contactPageContacts.phoneRaw) ?? null,
            phoneDiscoveryMethod:
              (homepageContacts.phone
                ? homepageContacts.phoneDiscoveryMethod
                : contactPageContacts.phoneDiscoveryMethod) ?? null,
            phoneConfidence:
              (homepageContacts.phone
                ? homepageContacts.phoneConfidence
                : contactPageContacts.phoneConfidence) ?? null,
            contactPageUrl: contactPageContacts.contactPageUrl,
            discoveredCompanyName:
              homepageContacts.discoveredCompanyName ??
              contactPageContacts.discoveredCompanyName,
          };
        }
      } catch {
        // Um contact page ausente não invalida o resultado da homepage.
      }
    }

    return homepageContacts;
  } catch {
    return {
      email: null,
      phone: null,
      emailSourceUrl: null,
      emailSourceType: null,
      phoneSourceUrl: null,
    };
  }
}

export async function enrichWebsiteLeadBatch<
  T extends { id: string; website: string }
>(
  items: T[],
  options: {
    concurrency?: number;
    timeoutMs?: number;
    enrich?: (website: string) => Promise<WebsiteContactInfo>;
  } = {}
): Promise<WebsiteLeadContactUpdate[]> {
  if (items.length === 0) return [];

  const concurrency = Math.min(
    items.length,
    Math.max(1, Math.floor(options.concurrency ?? 4))
  );
  const results = new Array<WebsiteLeadContactUpdate>(items.length);
  let cursor = 0;
  const enrich = options.enrich ?? enrichWebsiteContacts;
  const timeoutMs = Math.max(1, options.timeoutMs ?? ENRICHMENT_ITEM_TIMEOUT_MS);

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        const item = items[index];
        try {
          const contacts = await withItemTimeout(
            enrich(item.website),
            timeoutMs
          );
          results[index] = {
            id: item.id,
            ...contacts,
            enrichmentStatus: "completed",
          };
        } catch (error) {
          results[index] = {
            id: item.id,
            email: null,
            phone: null,
            emailSourceUrl: null,
            emailSourceType: null,
            phoneSourceUrl: null,
            enrichmentStatus: "failed",
            error: error instanceof Error ? error.message : "Enrichment failed",
          };
        }
      }
    })
  );

  return results;
}

export async function enrichLeadsBatch<T extends { url: string }>(
  items: T[],
  options: { maxEnrich?: number; delayMs?: number } = {}
): Promise<
  (T & {
    enrichedEmail?: string | null;
    enrichedPhone?: string | null;
    emailSourceUrl?: string | null;
    emailDiscoveryMethod?: WebsiteEmailSourceType | null;
    phoneSourceUrl?: string | null;
  })[]
> {
  const maxEnrich = options.maxEnrich ?? 40;
  const delayMs = options.delayMs ?? 350;
  const enriched: (T & {
    enrichedEmail?: string | null;
    enrichedPhone?: string | null;
    emailSourceUrl?: string | null;
    emailDiscoveryMethod?: WebsiteEmailSourceType | null;
    phoneSourceUrl?: string | null;
  })[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i < maxEnrich) {
      const contacts = await enrichWebsiteContacts(item.url);
      enriched.push({
        ...item,
        enrichedEmail: contacts.email,
        enrichedPhone: contacts.phone,
        emailSourceUrl: contacts.emailSourceUrl ?? null,
        emailDiscoveryMethod: contacts.emailSourceType ?? null,
        phoneSourceUrl: contacts.phoneSourceUrl ?? null,
      });
      if (i < maxEnrich - 1 && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    } else {
      enriched.push({
        ...item,
        enrichedEmail: null,
        enrichedPhone: null,
        emailSourceUrl: null,
        emailDiscoveryMethod: null,
        phoneSourceUrl: null,
      });
    }
  }

  return enriched;
}
