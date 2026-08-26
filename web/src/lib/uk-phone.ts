import type { PhoneConfidence, PhoneDiscoveryMethod } from "../types/lead.ts";

export type { PhoneConfidence, PhoneDiscoveryMethod };

export interface ExtractedPhone {
  phone: string;
  phoneRaw: string;
  discoveryMethod: PhoneDiscoveryMethod;
  confidence: PhoneConfidence;
}

const TEL_HREF_RE = /href\s*=\s*["']tel:([^"']+)["']/gi;
const LABELED_PHONE_RE =
  /(?:phone|tel(?:ephone)?|call|contact)\s*[:#-]?\s*(\+?\d[\d\s().-]{8,18}\d)/gi;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function stripNonContentHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");
}

/**
 * National significant number after +44 / 0044 / trunk 0.
 * Handles the common `+44 (0)20 …` form by dropping the leftover 0.
 */
function toNationalSignificantNumber(raw: string): string | null {
  const compact = raw.trim();
  if (!compact) return null;
  if (/[a-z]/i.test(compact)) return null;
  const digits = digitsOnly(compact);
  if (digits.length < 10 || digits.length > 14) return null;
  if (/^0{2,}/.test(digits) && !digits.startsWith("0044")) return null;

  let national = digits;
  if (national.startsWith("0044")) national = national.slice(4);
  else if (national.startsWith("44")) national = national.slice(2);
  if (national.startsWith("0")) national = national.slice(1);

  if (national.length < 9 || national.length > 10) return null;
  if (!/^[123578]/.test(national)) return null;
  if (/^0+$/.test(national)) return null;
  return national;
}

/**
 * UK numbers after removing a leading country/trunk prefix are 9–10 digits.
 * National display includes a leading 0 (10–11 digits total).
 */
export function isPlausibleUkPhone(raw: string): boolean {
  return toNationalSignificantNumber(raw) !== null;
}

export function normalizeUkPhone(raw: string): string | null {
  const national = toNationalSignificantNumber(raw);
  if (!national) return null;

  if (national.startsWith("20") && national.length === 10) {
    return `+44 20 ${national.slice(2, 6)} ${national.slice(6)}`;
  }
  if (national.startsWith("7") && national.length === 10) {
    return `+44 7${national.slice(1, 4)} ${national.slice(4, 7)} ${national.slice(7)}`;
  }
  return `+44 ${national}`;
}

function fromCandidate(
  raw: string,
  discoveryMethod: PhoneDiscoveryMethod,
  confidence: PhoneConfidence
): ExtractedPhone | null {
  const phone = normalizeUkPhone(raw);
  if (!phone) return null;
  return {
    phone,
    phoneRaw: raw.trim(),
    discoveryMethod,
    confidence,
  };
}

export function extractPhonesFromHtml(html: string): ExtractedPhone[] {
  const found: ExtractedPhone[] = [];
  const seen = new Set<string>();

  const add = (candidate: ExtractedPhone | null) => {
    if (!candidate || seen.has(candidate.phone)) return;
    seen.add(candidate.phone);
    found.push(candidate);
  };

  for (const match of html.matchAll(TEL_HREF_RE)) {
    add(fromCandidate(decodeURIComponent(match[1]), "tel_href", "high"));
  }

  const content = stripNonContentHtml(html);
  for (const match of content.matchAll(LABELED_PHONE_RE)) {
    add(fromCandidate(match[1], "labeled_text", "medium"));
  }

  return found;
}

export function pickBestPhoneFromHtml(html: string): ExtractedPhone | null {
  const ranked = extractPhonesFromHtml(html);
  return ranked[0] ?? null;
}

export function parsePublishedPhone(
  raw: string | null | undefined,
  discoveryMethod: PhoneDiscoveryMethod = "website_plain"
): ExtractedPhone | null {
  if (!raw) return null;
  const confidence =
    discoveryMethod === "tel_href"
      ? "high"
      : discoveryMethod === "labeled_text" || discoveryMethod === "serp_result"
        ? "medium"
        : "low";
  return fromCandidate(raw, discoveryMethod, confidence);
}
