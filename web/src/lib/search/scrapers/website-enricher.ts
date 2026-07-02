import { fetchSearchHtml } from "./fetch-html";

const EMAIL_REGEX =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const UK_PHONE_REGEX =
  /(?:\+44\s?\(?0\)?\s?|0)(?:\d\s?){9,12}/g;

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
];

export interface WebsiteContactInfo {
  email: string | null;
  phone: string | null;
}

function pickBestEmail(matches: string[]): string | null {
  const filtered = matches
    .map((e) => e.toLowerCase())
    .filter(
      (e) =>
        !SKIP_EMAIL_FRAGMENTS.some((f) => e.includes(f)) &&
        e.length < 80 &&
        e.includes(".")
    );
  const preferred = filtered.find(
    (e) =>
      e.startsWith("info@") ||
      e.startsWith("contact@") ||
      e.startsWith("hello@") ||
      e.startsWith("enquiries@")
  );
  return preferred ?? filtered[0] ?? null;
}

function pickBestPhone(matches: string[]): string | null {
  const cleaned = matches
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.replace(/\D/g, "").length >= 10);
  return cleaned[0] ?? null;
}

export async function enrichWebsiteContacts(
  websiteUrl: string
): Promise<WebsiteContactInfo> {
  const skipDomains = [
    "google.com/maps",
    "company-information.service.gov.uk",
    "yell.com/biz",
    "192.com/businesses",
    "thomsonlocal.com",
    "freeindex.co.uk/profile",
    "cylex-uk.co.uk/company",
    "touchlocal.com",
  ];
  if (skipDomains.some((d) => websiteUrl.includes(d))) {
    return { email: null, phone: null };
  }

  try {
    const html = await fetchSearchHtml(websiteUrl);
    const emails = html.match(EMAIL_REGEX) ?? [];
    const phones = html.match(UK_PHONE_REGEX) ?? [];
    return {
      email: pickBestEmail(emails),
      phone: pickBestPhone(phones),
    };
  } catch {
    return { email: null, phone: null };
  }
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