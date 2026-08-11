import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createEmailBlocklistEntry,
  emailBlocklistToPermanentBlocks,
  isEmailBlocked,
  parseEmailListInput,
} from "../src/lib/email-blocklist.ts";
import { auditGlobalEmailRecipients } from "../src/lib/global-email-deduplication.ts";
import {
  computeLifetimeStats,
  raiseLifetimeFloors,
} from "../src/lib/lifetime-stats.ts";
import { searchGlobalHistory } from "../src/lib/global-history-search.ts";
import { getClearUiPreserveContract } from "../src/lib/clear-ui-session.ts";

const readSource = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("KPI lifetime: floors never decrease when UI data is cleared", () => {
  const floors = raiseLifetimeFloors(
    {
      companiesFound: 500,
      leadsFound: 200,
      validEmailsFound: 120,
      campaignsSent: 3,
    },
    {
      companiesFound: 10,
      leadsFound: 5,
      validEmailsFound: 2,
      campaignsSent: 0,
    }
  );
  assert.equal(floors.companiesFound, 500);
  assert.equal(floors.leadsFound, 200);
  assert.equal(floors.validEmailsFound, 120);
  assert.equal(floors.campaignsSent, 3);
});

test("KPI lifetime: uses full history, not only current batch", () => {
  const stats = computeLifetimeStats({
    fullSearchHistory: [
      { id: "s1", keyword: "Accountants", location: "London", resultsCount: 40, date: "2026-01-01" },
      { id: "s2", keyword: "Builders", location: "Leeds", resultsCount: 25, date: "2026-02-01" },
    ],
    recentSearches: [
      // same s1 must not double-count
      { id: "s1", keyword: "Accountants", location: "London", resultsCount: 40, date: "2026-01-01" },
    ],
    savedLeads: [
      {
        id: "l1",
        company: "A Ltd",
        website: "https://a.com",
        email: "a@a.com",
        phone: "",
        address: "London",
        category: "Accountants",
        aiScore: 90,
      },
    ],
    campaigns: [
      {
        id: "c1",
        name: "Camp 1",
        status: "completed",
        campaignProfileId: "panek-puglesi",
        subject: "Hi",
        body: "",
        leadIds: ["l1"],
        leadStatuses: [
          {
            leadId: "l1",
            status: "sent",
            sentAt: "2026-03-01T00:00:00.000Z",
            providerMessageId: "msg-real-1",
          },
        ],
        sendErrors: [],
        updatedAt: "2026-03-01T00:00:00.000Z",
      },
      {
        id: "c2",
        name: "Active only",
        status: "active",
        campaignProfileId: "panek-puglesi",
        subject: "Hi",
        body: "",
        leadIds: [],
        leadStatuses: [],
        sendErrors: [],
        updatedAt: "2026-03-02T00:00:00.000Z",
      },
    ],
  });
  assert.equal(stats.companiesFound, 65);
  assert.equal(stats.leadsFound, 1);
  assert.equal(stats.validEmailsFound, 1);
  assert.equal(stats.campaignsSent, 1);
  assert.equal(stats.campaignsActive, 1);
});

test("block list: normalize trim + lowercase and add/remove", () => {
  const entry = createEmailBlocklistEntry({
    email: "  Info@Empresa.COM ",
    reason: "nao_interessado",
    operation: "both",
  });
  assert.ok(entry);
  assert.equal(entry.normalizedEmail, "info@empresa.com");

  const list = [entry];
  assert.equal(isEmailBlocked(list, "INFO@empresa.com"), true);
  assert.equal(isEmailBlocked(list, "other@empresa.com"), false);

  const remaining = list.filter((e) => e.normalizedEmail !== entry.normalizedEmail);
  assert.equal(remaining.length, 0);
});

test("block list: bulk paste parse and permanent block exclusion from send", () => {
  const emails = parseEmailListInput(
    "one@a.com\ntwo@b.com, THREE@c.com  one@a.com"
  );
  assert.deepEqual(emails, ["one@a.com", "two@b.com", "three@c.com"]);

  const entry = createEmailBlocklistEntry({
    email: "person@example.com",
    reason: "unsubscribe",
    operation: "panek-puglesi",
  });
  const permanent = emailBlocklistToPermanentBlocks([entry]);
  const result = auditGlobalEmailRecipients({
    operation: "panek-puglesi",
    campaignId: "camp-new",
    contactKind: "first_contact",
    companiesFound: 1,
    recipients: [
      { leadId: "lead-1", company: "Example", email: "PERSON@example.com" },
    ],
    history: [],
    permanentBlocks: permanent,
  });
  assert.equal(result.finalSendCount, 0);
  assert.equal(result.blockedContacts, 1);
  assert.equal(result.decisions[0].code, "permanently_blocked");
});

test("block list: same list is consulted for both operations when scope is both", () => {
  const entry = createEmailBlocklistEntry({
    email: "shared@corp.com",
    reason: "manual",
    operation: "both",
  });
  const permanent = emailBlocklistToPermanentBlocks([entry]);
  assert.equal(permanent.length, 2);
  assert.ok(permanent.some((b) => b.operation === "panek-puglesi"));
  assert.ok(permanent.some((b) => b.operation === "modeclean"));
});

test("busca global encontra setor, e-mail e campanha", () => {
  const hitsSector = searchGlobalHistory({
    query: "accountants",
    fullSearchHistory: [
      {
        id: "s1",
        keyword: "Accountants",
        location: "London",
        resultsCount: 12,
        date: "2026-01-01",
      },
    ],
    savedLeads: [],
    campaigns: [],
    blockedEmails: [],
  });
  assert.ok(hitsSector.some((h) => h.kind === "search"));

  const blocked = createEmailBlocklistEntry({
    email: "info@empresa.com",
    reason: "respondeu",
  });
  const hitsEmail = searchGlobalHistory({
    query: "info@empresa.com",
    fullSearchHistory: [],
    savedLeads: [
      {
        id: "l1",
        company: "Empresa Ltd",
        website: "https://empresa.com",
        email: "info@empresa.com",
        phone: "",
        address: "UK",
        category: "Services",
        aiScore: 80,
        savedAt: "2026-01-02",
      },
    ],
    campaigns: [],
    blockedEmails: [blocked],
  });
  assert.ok(hitsEmail.some((h) => h.kind === "blocked"));
  assert.ok(hitsEmail.some((h) => h.kind === "lead"));
  assert.ok(
    hitsEmail
      .find((h) => h.kind === "lead")
      .badges.some((b) => b.includes("Bloqueado"))
  );

  const hitsCampaign = searchGlobalHistory({
    query: "spring push",
    fullSearchHistory: [],
    savedLeads: [],
    campaigns: [
      {
        id: "c1",
        name: "Spring Push",
        status: "draft",
        campaignProfileId: "panek-puglesi",
        subject: "Hello",
        body: "",
        leadIds: [],
        leadStatuses: [],
        sendErrors: [],
        updatedAt: "2026-01-03",
      },
    ],
    blockedEmails: [],
  });
  assert.ok(hitsCampaign.some((h) => h.kind === "campaign"));
});

test("menu lateral sem Nova Busca / Meus Leads / Histórico de Buscas", async () => {
  const source = await readSource("src/components/layout/sidebar.tsx");
  assert.doesNotMatch(source, /Nova Busca/);
  assert.doesNotMatch(source, /Meus Leads/);
  assert.doesNotMatch(source, /Histórico de Buscas/);
  assert.match(source, /Dashboard/);
  assert.match(source, /Agente 1 — Garimpeiro/);
  assert.match(source, /Agente 2 — Validador/);
  assert.match(source, /Agente 3 — Enviador/);
  assert.match(source, /Campanhas/);
  assert.match(source, /Configurações/);
  assert.doesNotMatch(source, /href: "\/busca"/);
  assert.doesNotMatch(source, /href: "\/leads"/);
  assert.doesNotMatch(source, /href: "\/historico"/);
});

test("One-Click e Busca em Massa somente no Agente 1", async () => {
  const agentOne = await readSource(
    "src/components/agents/agent-one-search-modes.tsx"
  );
  const dashboardTabs = await readSource(
    "src/components/dashboard/dashboard-tabs.tsx"
  );
  const dashboardPage = await readSource("src/app/(dashboard)/page.tsx");
  const buscaPage = await readSource("src/app/(dashboard)/busca/page.tsx");

  assert.match(agentOne, /OneClickOutreach/);
  assert.match(agentOne, /QuickSearch/);
  assert.match(agentOne, /Busca em Massa/);
  assert.match(agentOne, /one-click/);

  assert.doesNotMatch(dashboardTabs, /OneClickOutreach/);
  assert.doesNotMatch(dashboardTabs, /<QuickSearch/);
  assert.doesNotMatch(dashboardTabs, /from "@\/components\/dashboard\/quick-search"/);
  assert.doesNotMatch(dashboardTabs, /BulkSearchProgress/);
  assert.doesNotMatch(dashboardPage, /OneClickOutreach/);
  assert.doesNotMatch(dashboardPage, /from "@\/components\/dashboard\/quick-search"/);
  assert.doesNotMatch(dashboardPage, /from "@\/components\/outreach\/one-click-outreach"/);

  // Old Nova Busca route redirects into Agente 1
  assert.match(buscaPage, /redirect/);
  assert.match(buscaPage, /agente-1/);
});

test("dados anteriores preservados no contrato de limpeza de UI", () => {
  const contract = getClearUiPreserveContract();
  for (const key of [
    "savedLeads",
    "fullSearchHistory",
    "campaigns",
    "batches",
    "templates",
    "deliveryMetrics",
    "emailBlocklist",
    "lifetimeStats",
  ]) {
    assert.ok(contract.includes(key), `missing ${key}`);
  }
});

test("Dashboard é informativo e tem as guias pedidas", async () => {
  const tabs = await readSource("src/components/dashboard/dashboard-tabs.tsx");
  assert.match(tabs, /Visão Geral/);
  assert.match(tabs, /Campanhas/);
  assert.match(tabs, /Leads/);
  assert.match(tabs, /Histórico de Buscas/);
  assert.match(tabs, /E-mails Bloqueados/);
  assert.match(tabs, /StatsCards/);
  assert.match(tabs, /GlobalHistorySearch/);
  assert.match(tabs, /BlockedEmailsPanel/);
  assert.match(tabs, /somente consulta e informação|Busca e prospecção/);
});

test("QuickSearch renomeado para Busca em Massa", async () => {
  const source = await readSource("src/components/dashboard/quick-search.tsx");
  assert.match(source, /Busca em Massa/);
  assert.doesNotMatch(source, /Busca em Volume V2/);
});
