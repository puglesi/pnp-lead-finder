import { decodeHtmlEntities, fetchSearchHtml } from "./fetch-html.ts";

const EMAIL_REGEX =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const UK_PHONE_REGEX =
  /(?:\+44\s?\(?0\)?\s?|0)(?:\d\s?){9,12}/g;
const CONTACT_PATH_REGEX =
  /(?:^|[-_/])(contact|contact-us|get-in-touch|about|about-us|enquiries)(?:[-_/]|$)/i;

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

export interface WebsiteContactInfo {
  email: string | null;
  phone: string | null;
}

export interface WebsiteLeadContactUpdate extends WebsiteContactInfo {
  id: string;
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

function pickBestPhone(matches: string[]): string | null {
  const cleaned = matches
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.replace(/\D/g, "").length >= 10);
  return cleaned[0] ?? null;
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
    urls.push(new URL("/contact", baseUrl.origin).toString());
  }

  return urls.slice(0, 1);
}

function extractContactsFromHtml(
  html: string,
  preferredDomain: string
): WebsiteContactInfo {
  const normalized = normalizeContactText(html);
  return {
    email: pickBestEmail(normalized.match(EMAIL_REGEX) ?? [], preferredDomain),
    phone: pickBestPhone(normalized.match(UK_PHONE_REGEX) ?? []),
  };
}

export async function enrichWebsiteContacts(
  websiteUrl: string
): Promise<WebsiteContactInfo> {
  const url = normalizeWebsiteUrl(websiteUrl);
  if (!url) return { email: null, phone: null };
  const preferredDomain = url.hostname.toLowerCase().replace(/^www\./, "");

  try {
    const html = await fetchSearchHtml(url.toString(), {
      timeoutMs: 4_500,
      maxLength: 750_000,
      isUrlAllowed: isEnrichableWebsiteUrl,
    });
    const homepageContacts = extractContactsFromHtml(html, preferredDomain);
    if (homepageContacts.email) return homepageContacts;

    for (const contactUrl of extractContactUrls(html, url)) {
      try {
        const contactHtml = await fetchSearchHtml(contactUrl, {
          timeoutMs: 4_500,
          maxLength: 750_000,
          isUrlAllowed: isEnrichableWebsiteUrl,
        });
        const contactPageContacts = extractContactsFromHtml(
          contactHtml,
          preferredDomain
        );
        if (contactPageContacts.email || contactPageContacts.phone) {
          return {
            email: contactPageContacts.email,
            phone: homepageContacts.phone ?? contactPageContacts.phone,
          };
        }
      } catch {
        // Um contact page ausente não invalida o resultado da homepage.
      }
    }

    return homepageContacts;
  } catch {
    return { email: null, phone: null };
  }
}

export async function enrichWebsiteLeadBatch<
  T extends { id: string; website: string }
>(
  items: T[],
  options: { concurrency?: number } = {}
): Promise<WebsiteLeadContactUpdate[]> {
  if (items.length === 0) return [];

  const concurrency = Math.min(
    items.length,
    Math.max(1, Math.floor(options.concurrency ?? 4))
  );
  const results = new Array<WebsiteLeadContactUpdate>(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        const item = items[index];
        const contacts = await enrichWebsiteContacts(item.website);
        results[index] = { id: item.id, ...contacts };
      }
    })
  );

  return results;
}

export async function enrichLeadsBatch<T extends { url: string }>(
  items: T[],
  options: { maxEnrich?: number; delayMs?: number } = {}
): Promise<
  (T & { enrichedEmail?: string | null; enrichedPhone?: string | null })[]
> {
  const maxEnrich = options.maxEnrich ?? 40;
  const delayMs = options.delayMs ?? 350;
  const enriched: (T & {
    enrichedEmail?: string | null;
    enrichedPhone?: string | null;
  })[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i < maxEnrich) {
      const contacts = await enrichWebsiteContacts(item.url);
      enriched.push({
        ...item,
        enrichedEmail: contacts.email,
        enrichedPhone: contacts.phone,
      });
      if (i < maxEnrich - 1 && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    } else {
      enriched.push({ ...item, enrichedEmail: null, enrichedPhone: null });
    }
  }

  return enriched;
}
