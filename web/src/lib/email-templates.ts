import type { Lead } from "@/types/lead";

export const DEFAULT_FROM_NAME = "Panek Pugliesi";
export const DEFAULT_FROM_EMAIL = "outreach@panekpuglesi.co.uk";
export const DEFAULT_REPLY_TO = "info@panekpuglesi.co.uk";

export const EMAIL_VARIABLES = [
  { key: "{{company}}", label: "Empresa" },
  { key: "{{name}}", label: "Nome" },
  { key: "{{email}}", label: "Email" },
  { key: "{{phone}}", label: "Telefone" },
  { key: "{{website}}", label: "Website" },
  { key: "{{address}}", label: "Endereço" },
] as const;

export const FONT_FAMILY_OPTIONS = [
  { label: "Padrão", value: "" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
  { label: "Segoe UI", value: "'Segoe UI', Tahoma, sans-serif" },
  { label: "Calibri", value: "Calibri, 'Segoe UI', sans-serif" },
] as const;

export const FONT_SIZE_OPTIONS = [
  { label: "10px", value: "10px" },
  { label: "12px", value: "12px" },
  { label: "14px", value: "14px" },
  { label: "16px", value: "16px" },
  { label: "18px", value: "18px" },
  { label: "20px", value: "20px" },
  { label: "24px", value: "24px" },
  { label: "28px", value: "28px" },
  { label: "32px", value: "32px" },
  { label: "36px", value: "36px" },
] as const;

export const TEXT_COLOR_OPTIONS = [
  { color: "#111827", label: "Preto" },
  { color: "#374151", label: "Cinza escuro" },
  { color: "#6b7280", label: "Cinza" },
  { color: "#1e40af", label: "Azul" },
  { color: "#059669", label: "Verde" },
  { color: "#7c3aed", label: "Roxo" },
  { color: "#dc2626", label: "Vermelho" },
  { color: "#d97706", label: "Laranja" },
] as const;

export const BACKGROUND_COLOR_OPTIONS = [
  { color: "#ffffff", label: "Branco" },
  { color: "#f3f4f6", label: "Cinza claro" },
  { color: "#dbeafe", label: "Azul claro" },
  { color: "#d1fae5", label: "Verde claro" },
  { color: "#fef3c7", label: "Amarelo claro" },
  { color: "#fce7f3", label: "Rosa claro" },
  { color: "#ede9fe", label: "Lilás claro" },
  { color: "#fee2e2", label: "Vermelho claro" },
] as const;

const PARTNERSHIP_BODY_HTML = `<p>Olá equipe da <strong>{{company}}</strong>,</p>
<p>Somos a <strong>Panek Pugliesi</strong> (<a href="https://panekpuglesi.co.uk">panekpuglesi.co.uk</a>) e acompanhamos empresas em <em>{{address}}</em>.</p>
<p>Identificamos sinergias com o perfil de vocês em <a href="{{website}}">{{website}}</a>.</p>
<ul>
<li>Conversa de 15 minutos</li>
<li>Sem compromisso</li>
<li>Foco em parceria B2B</li>
</ul>
<p>Podemos falar esta semana, {{name}}?</p>
<p>Atenciosamente,<br><strong>Equipe Panek Pugliesi</strong><br>info@panekpuglesi.co.uk</p>`;

export const EMAIL_TEMPLATE_PRESETS = [
  {
    id: "partnership",
    label: "Parceria B2B",
    subject: "Oportunidade de parceria — {{company}}",
    body: PARTNERSHIP_BODY_HTML,
  },
  {
    id: "introduction",
    label: "Apresentação",
    subject: "{{company}} — apresentação Panek Pugliesi",
    body: `<p>Prezados da <strong>{{company}}</strong>,</p>
<p>Meu nome é da equipe Panek Pugliesi. Trabalhamos com soluções para negócios locais.</p>
<p>Notei o trabalho de vocês e acredito que podemos agregar valor.</p>
<p>Contato: <strong>{{phone}}</strong><br>Site: <a href="{{website}}">{{website}}</a></p>
<p>Fico à disposição para uma breve chamada.</p>
<p>Cordialmente,<br>Panek Pugliesi</p>`,
  },
  {
    id: "followup",
    label: "Follow-up",
    subject: "Re: {{company}} — seguindo nossa proposta",
    body: `<p>Olá <strong>{{name}}</strong>,</p>
<p>Espero que estejam bem. Escrevo para dar seguimento à nossa mensagem anterior.</p>
<p>Ainda temos interesse em conversar sobre como podemos apoiar <strong>{{company}}</strong> em {{address}}.</p>
<p>Responda a este email (<a href="mailto:{{email}}">{{email}}</a>) ou ligue para {{phone}}.</p>
<p>Obrigado,<br>Equipe Panek Pugliesi</p>`,
  },
] as const;

export const DEFAULT_SUBJECT = EMAIL_TEMPLATE_PRESETS[0].subject;
export const DEFAULT_BODY_HTML = EMAIL_TEMPLATE_PRESETS[0].body;

export const PREVIEW_SAMPLE_LEAD: Lead = {
  id: "preview-sample",
  company: "Smith & Partners Estate Agents",
  website: "https://smithpartners.co.uk",
  email: "contact@smithpartners.co.uk",
  phone: "+44 20 7946 0958",
  address: "42 High Street, London, UK",
  category: "Estate Agents",
  aiScore: 87,
};

export type EmailTemplateLead = Pick<
  Lead,
  "company" | "email" | "phone" | "website" | "category" | "address"
>;

export function getLeadContactName(lead: Pick<Lead, "company">): string {
  const primary = lead.company.split(/[&|,]/)[0]?.trim();
  return primary || lead.company;
}

export function isHtmlBody(body: string): boolean {
  return /<[a-z][\s\S]*>/i.test(body);
}

export function plainTextToHtml(text: string): string {
  if (!text.trim()) return "<p></p>";
  return text
    .split(/\n\n+/)
    .map((block) => {
      const inner = block.split("\n").join("<br>");
      return `<p>${inner}</p>`;
    })
    .join("");
}

export function normalizeEmailBody(body: string): string {
  if (!body.trim()) return "<p></p>";
  return isHtmlBody(body) ? body : plainTextToHtml(body);
}

export function renderEmailTemplate(
  template: string,
  lead: EmailTemplateLead
): string {
  const name = getLeadContactName(lead);
  return template
    .replace(/\{\{company\}\}/g, lead.company)
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{email\}\}/g, lead.email ?? "")
    .replace(/\{\{phone\}\}/g, lead.phone)
    .replace(/\{\{website\}\}/g, lead.website)
    .replace(/\{\{category\}\}/g, lead.category)
    .replace(/\{\{address\}\}/g, lead.address);
}

export function renderEmailHtml(
  html: string,
  lead: EmailTemplateLead
): string {
  return renderEmailTemplate(normalizeEmailBody(html), lead);
}

export function renderFullCampaignEmail(
  body: string,
  signature: { enabled: boolean; body: string } | null | undefined,
  lead: EmailTemplateLead
): string {
  const main = renderEmailHtml(body, lead);
  if (!signature?.enabled || !signature.body.trim()) return main;
  const sig = renderEmailHtml(signature.body, lead);
  return `${main}<div data-email-signature="true" style="margin-top:8px;">${sig}</div>`;
}

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hasValidEmail(email: string | null | undefined): boolean {
  if (!email || email === "—") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function formatFromHeader(fromName: string, fromEmail: string): string {
  if (fromName && fromEmail) return `${fromName} <${fromEmail}>`;
  return fromEmail || fromName || "";
}

export function appendUnsubscribeFooter(
  html: string,
  unsubscribeLink: string,
  lead: EmailTemplateLead
): string {
  if (!unsubscribeLink.trim()) return html;
  const link = renderEmailTemplate(unsubscribeLink, lead);
  return `${html}<p style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><a href="${link}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a> from future emails</p>`;
}