import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  analyzeImportedList,
  detectColumnMapping,
  leadsFromMappedRows,
  parseDelimitedText,
  previewImportedSendList,
} from "../src/lib/list-import.ts";
import {
  createEmailBlocklistEntry,
} from "../src/lib/email-blocklist.ts";
import {
  configureExistingEmailTemplates,
  createInitialEmailTemplates,
  getOriginalEmailTemplateContent,
  getEmailTemplatesForOperation,
  normalizeEmailTemplateDefaults,
} from "../src/lib/email-template-library.ts";
import { getClearUiPreserveContract } from "../src/lib/clear-ui-session.ts";
import { createInitialAgentThreeSnapshot } from "../src/lib/agent-three-queue.ts";
import { isCampaignFullyDelivered, getCampaignEffectiveStatus } from "../src/lib/campaign-completion.ts";

const readSource = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("upload CSV: detecta coluna email e importa leads", () => {
  const csv = `email,company,website
a@one.com,One Ltd,https://one.com
b@two.com,Two Ltd,https://two.com
a@one.com,Dup,https://dup.com`;
  const result = parseDelimitedText(csv);
  assert.equal(result.needsManualMapping, false);
  assert.equal(result.leads.length, 2);
  assert.equal(result.leads[0].email, "a@one.com");
  assert.equal(result.leads[0].company, "One Ltd");
});

test("upload TXT: lista simples de e-mails", () => {
  const txt = `info@a.com
contato@b.com
invalid-line
sales@c.com`;
  const result = parseDelimitedText(txt);
  assert.equal(result.leads.length, 3);
  assert.ok(result.leads.every((l) => l.email?.includes("@")));
});

test("upload XLSX path: leadsFromMappedRows simula planilha tabular", () => {
  const rows = [
    ["E-mail", "Empresa", "Site"],
    ["x@sheet.com", "Sheet Co", "sheet.com"],
    ["y@sheet.com", "Other", "https://other.com"],
  ];
  const detected = detectColumnMapping(rows[0]);
  assert.equal(detected.emailColumn, 0);
  assert.equal(detected.mapping[0], "email");
  const parsed = leadsFromMappedRows(rows, detected.mapping, { hasHeader: true });
  assert.equal(parsed.leads.length, 2);
  assert.equal(parsed.leads[0].email, "x@sheet.com");
});

test("detecção automática de aliases comuns de coluna", () => {
  const detected = detectColumnMapping([
    "Company",
    "Mail",
    "Domain",
    "Nome",
  ]);
  assert.equal(detected.mapping[1], "email");
  assert.equal(detected.mapping[0], "company");
  assert.equal(detected.mapping[2], "domain");
  assert.equal(detected.mapping[3], "name");
  assert.equal(detected.needsManualMapping, false);
});

test("lista manual usa análise com blocklist e duplicados", () => {
  const leads = [
    {
      id: "1",
      company: "A",
      website: "—",
      email: "a@test.com",
      phone: "—",
      address: "—",
      category: "Importado",
      aiScore: 70,
    },
    {
      id: "2",
      company: "A2",
      website: "—",
      email: "a@test.com",
      phone: "—",
      address: "—",
      category: "Importado",
      aiScore: 70,
    },
    {
      id: "3",
      company: "B",
      website: "—",
      email: "blocked@test.com",
      phone: "—",
      address: "—",
      category: "Importado",
      aiScore: 70,
    },
    {
      id: "4",
      company: "C",
      website: "—",
      email: "new@test.com",
      phone: "—",
      address: "—",
      category: "Importado",
      aiScore: 70,
    },
  ];
  const block = createEmailBlocklistEntry({
    email: "blocked@test.com",
    reason: "manual",
  });
  const analysis = analyzeImportedList({
    leads,
    existingLeads: [
      {
        id: "ex",
        company: "A",
        website: "—",
        email: "a@test.com",
        phone: "—",
        address: "—",
        category: "X",
        aiScore: 80,
      },
    ],
    blockedEntries: [block],
  });
  assert.equal(analysis.duplicates, 1);
  assert.equal(analysis.blocked, 1);
  assert.ok(analysis.alreadyExisting >= 1);
  assert.ok(
    analysis.readyLeads.every(
      (l) => l.email !== "blocked@test.com"
    )
  );
  assert.ok(analysis.readyLeads.some((l) => l.email === "new@test.com"));
});

test("lista importada no Agent 3 respeita histórico de envio", () => {
  const snapshot = createInitialAgentThreeSnapshot();
  snapshot.operations["panek-puglesi"].sentIndex.push({
    queueItemId: "q1",
    leadId: "old",
    normalizedEmail: "already@sent.com",
    campaignProfileId: "panek-puglesi",
    campaignId: "camp-old",
    sentAt: "2026-01-01T00:00:00.000Z",
    providerMessageId: "smtp-real-already",
  });
  const leads = [
    {
      id: "n1",
      company: "New",
      website: "—",
      email: "fresh@new.com",
      phone: "—",
      address: "—",
      category: "Importado",
      aiScore: 70,
    },
    {
      id: "n2",
      company: "Old",
      website: "—",
      email: "already@sent.com",
      phone: "—",
      address: "—",
      category: "Importado",
      aiScore: 70,
    },
  ];
  const { preview, eligibleLeads } = previewImportedSendList({
    leads,
    operation: "panek-puglesi",
    campaignId: "camp-new",
    campaigns: [
      {
        id: "camp-old",
        name: "Old",
        campaignProfileId: "panek-puglesi",
        subject: "x",
        body: "",
        status: "completed",
        leadIds: ["old"],
        leadStatuses: [
          {
            leadId: "old",
            status: "sent",
            providerMessageId: "smtp-real-already",
            sentAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        sendErrors: [],
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    allKnownLeads: leads,
    operations: snapshot.operations,
    blockedEntries: [],
  });
  assert.equal(preview.finalSendCount, 1);
  assert.equal(eligibleLeads.length, 1);
  assert.equal(eligibleLeads[0].email, "fresh@new.com");
  assert.ok(preview.alreadyContactedSameOperation >= 1);
});

test("campanha persiste no store e limpar UI não apaga", () => {
  const contract = getClearUiPreserveContract();
  assert.ok(contract.includes("campaigns"));
  assert.ok(contract.includes("templates"));
  assert.ok(contract.includes("emailBlocklist"));
});

test("status de campanha inclui salva e arquivada", () => {
  const archived = {
    id: "c",
    status: "archived",
    leadIds: ["1"],
    leadStatuses: [
      {
        leadId: "1",
        status: "sent",
        providerMessageId: "smtp-real-1",
      },
    ],
  };
  assert.equal(getCampaignEffectiveStatus(archived), "archived");
  const saved = {
    id: "c2",
    status: "saved",
    leadIds: [],
    leadStatuses: [],
  };
  assert.equal(getCampaignEffectiveStatus(saved), "saved");
});

test("campanha nova abre vazia (create form sem default subject/body)", async () => {
  const source = await readSource(
    "src/components/campaigns/create-campaign-form.tsx"
  );
  assert.match(source, /reuseSource\?\.subject \?\? ""/);
  assert.match(source, /reuseSource\?\.body \?\? ""/);
  assert.doesNotMatch(source, /initialEmailTemplate\?\.subject/);
  assert.doesNotMatch(source, /DEFAULT_SUBJECT/);
});

test("três templates editáveis por operação e isolamento P&P/Modeclean", () => {
  const templates = createInitialEmailTemplates();
  const pnp = getEmailTemplatesForOperation(templates, "panek-puglesi");
  const mode = getEmailTemplatesForOperation(templates, "modeclean");
  assert.equal(pnp.length, 3);
  assert.equal(mode.length, 3);
  assert.ok(pnp.some((t) => t.name === "Parceria B2B"));
  assert.ok(mode.some((t) => t.name.includes("Modeclean") || t.name.includes("limpeza")));
  // Edits to P&P must not rewrite Modeclean when configuring
  const edited = templates.map((t) =>
    t.id === "panek-puglesi-partnership"
      ? { ...t, subject: "CUSTOM PNP SUBJECT", body: "<p>custom</p>" }
      : t
  );
  const after = configureExistingEmailTemplates(edited);
  const pnpAfter = after.find((t) => t.id === "panek-puglesi-partnership");
  const modeAfter = after.find((t) => t.id === "modeclean-partnership");
  assert.equal(pnpAfter.subject, "CUSTOM PNP SUBJECT");
  assert.notEqual(modeAfter.subject, "CUSTOM PNP SUBJECT");
  assert.ok(getOriginalEmailTemplateContent("panek-puglesi-partnership"));
});

test("salvar campanha como template e definir padrão", () => {
  let templates = createInitialEmailTemplates();
  const custom = {
    id: "custom-1",
    name: "Meu modelo",
    operation: "panek-puglesi",
    subject: "Hi {{company}}",
    body: "<p>Hello</p>",
    sender: "outreach@panekpuglesi.co.uk",
    replyTo: "info@panekpuglesi.co.uk",
    contactKind: "first_contact",
    isDefault: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  templates = normalizeEmailTemplateDefaults([...templates, custom], "custom-1");
  const defaults = templates.filter(
    (t) => t.operation === "panek-puglesi" && t.isDefault
  );
  assert.equal(defaults.length, 1);
  assert.equal(defaults[0].id, "custom-1");
});

test("estado alterações não salvas na UI de campanha e templates", async () => {
  const detail = await readSource(
    "src/components/campaigns/campaign-detail.tsx"
  );
  const templates = await readSource(
    "src/components/settings/email-template-library.tsx"
  );
  assert.match(detail, /Alterações não salvas/);
  assert.match(detail, /Salvar alterações/);
  assert.match(detail, /Salvar como modelo/);
  assert.match(templates, /Alterações não salvas/);
  assert.match(templates, /Salvar alterações/);
  assert.match(templates, /Restaurar original/);
});

test("Agente 2 e 3 têm cards de importação da lista", async () => {
  const a2 = await readSource("src/app/(dashboard)/agente-2/page.tsx");
  const a3 = await readSource("src/app/(dashboard)/agente-3/page.tsx");
  const a2card = await readSource(
    "src/components/agents/agent-two-import-list.tsx"
  );
  const a3card = await readSource(
    "src/components/agents/agent-three-import-list.tsx"
  );
  assert.match(a2, /AgentTwoImportList/);
  assert.match(a3, /AgentThreeImportList/);
  assert.match(a2card, /Validar minha lista/);
  assert.match(a3card, /Enviar para minha lista/);
  assert.match(a2card, /loadQueue/);
  assert.match(a3card, /previewImportedSendList|auditGlobalEmailRecipients|GlobalDeduplication/);
});

test("campanhas listam Salvar Duplicar Arquivar Apagar", async () => {
  const list = await readSource(
    "src/components/campaigns/campaign-list-table.tsx"
  );
  assert.match(list, /Salvar/);
  assert.match(list, /Duplicar/);
  assert.match(list, /Arquivar/);
  assert.match(list, /Apagar/);
  assert.match(list, /window\.confirm/);
});
