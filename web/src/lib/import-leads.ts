import { hasValidEmail } from "./email-templates.ts";
import type { Lead } from "../types/lead.ts";

export interface ImportLeadsResult {
  leads: Lead[];
  skipped: number;
  errors: string[];
}

function domainToCompany(email: string): string {
  const domain = (email.split("@")[1] ?? "").split(".")[0] ?? "";
  if (!domain) return "Contato Externo";
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

export function leadFromEmail(
  email: string,
  extras?: Partial<Pick<Lead, "company" | "phone" | "website" | "address" | "category">>
): Lead | null {
  const trimmed = email.trim().toLowerCase();
  if (!hasValidEmail(trimmed)) return null;

  const company = extras?.company?.trim() || domainToCompany(trimmed);
  return {
    id: `import-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    company,
    website: extras?.website?.trim() || "—",
    email: trimmed,
    phone: extras?.phone?.trim() || "—",
    address: extras?.address?.trim() || "—",
    category: extras?.category?.trim() || "Importado",
    aiScore: 70,
  };
}

export function parseEmailList(text: string): ImportLeadsResult {
  const errors: string[] = [];
  const seen = new Set<string>();
  const leads: Lead[] = [];
  let skipped = 0;

  const tokens = text
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const emailMatch = token.match(/<?([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>?/i);
    const email = emailMatch?.[1] ?? token;
    const lead = leadFromEmail(email);
    if (!lead) {
      skipped++;
      if (token.includes("@")) errors.push(`Email inválido: ${token}`);
      continue;
    }
    const key = lead.email!.toLowerCase();
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    leads.push(lead);
  }

  return { leads, skipped, errors };
}

export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === "," || ch === ";") && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map((h) => h.toLowerCase().trim());
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx >= 0) return idx;
  }
  for (let i = 0; i < normalized.length; i++) {
    if (aliases.some((a) => normalized[i].includes(a))) return i;
  }
  return -1;
}

export function parseLeadsCsv(text: string): ImportLeadsResult {
  const errors: string[] = [];
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { leads: [], skipped: 0, errors: ["Arquivo CSV vazio."] };
  }

  const headers = parseCsvLine(lines[0]);
  const emailIdx = findColumnIndex(headers, [
    "email",
    "e-mail",
    "e mail",
    "correio",
    "mail",
  ]);
  const companyIdx = findColumnIndex(headers, [
    "empresa",
    "company",
    "business",
    "organização",
    "organization",
    "nome empresa",
  ]);
  const nameIdx = findColumnIndex(headers, ["nome", "name", "contact", "contato"]);
  const phoneIdx = findColumnIndex(headers, ["telefone", "phone", "tel", "mobile"]);
  const websiteIdx = findColumnIndex(headers, ["website", "site", "url", "web"]);
  const addressIdx = findColumnIndex(headers, ["endereço", "endereco", "address", "location"]);

  const dataStart = emailIdx >= 0 || companyIdx >= 0 ? 1 : 0;
  const fallbackEmailIdx =
    emailIdx >= 0
      ? emailIdx
      : headers.findIndex((h) => /@/.test(h)) >= 0
        ? headers.findIndex((h) => /@/.test(h))
        : 0;

  const seen = new Set<string>();
  const leads: Lead[] = [];
  let skipped = 0;

  for (let i = dataStart; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.every((c) => !c)) continue;

    const rawEmail = cells[emailIdx >= 0 ? emailIdx : fallbackEmailIdx] ?? "";
    const emailMatch = rawEmail.match(
      /<?([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>?/i
    );
    const email = emailMatch?.[1] ?? rawEmail;

    const company =
      (companyIdx >= 0 ? cells[companyIdx] : "") ||
      (nameIdx >= 0 ? cells[nameIdx] : "") ||
      undefined;

    const lead = leadFromEmail(email, {
      company,
      phone: phoneIdx >= 0 ? cells[phoneIdx] : undefined,
      website: websiteIdx >= 0 ? cells[websiteIdx] : undefined,
      address: addressIdx >= 0 ? cells[addressIdx] : undefined,
      category: "Importado",
    });

    if (!lead) {
      skipped++;
      continue;
    }

    if (nameIdx >= 0 && cells[nameIdx] && !companyIdx) {
      lead.company = cells[nameIdx];
    } else if (nameIdx >= 0 && cells[nameIdx] && companyIdx < 0) {
      lead.company = cells[nameIdx];
    }

    const key = lead.email!.toLowerCase();
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    leads.push(lead);
  }

  if (leads.length === 0) {
    errors.push(
      "Nenhum email válido encontrado. Use colunas: email, empresa (opcional)."
    );
  }

  return { leads, skipped, errors };
}