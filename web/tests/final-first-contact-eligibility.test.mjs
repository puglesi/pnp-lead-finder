import assert from "node:assert/strict";
import test from "node:test";
import { auditGlobalEmailRecipients } from "../src/lib/global-email-deduplication.ts";
import {
  createInitialAgentThreeSnapshot,
  loadAgentThreeLeads,
  prepareAgentThreeCampaign,
  selectAgentThreeCampaign,
} from "../src/lib/agent-three-queue.ts";
import { assertNoCommercialDatabaseAccess } from "./helpers/commercial-database-guard.mjs";

assertNoCommercialDatabaseAccess(import.meta.url);

const at = "2026-09-02T10:00:00.000Z";
function readyLead(index) {
  return {
    id: `lead-${index}`,
    company: `Company ${index}`,
    website: `https://company-${index}.example`,
    email: `person-${index}@company-${index}.example`,
    normalizedEmail: `person-${index}@company-${index}.example`,
    phone: "",
    address: "London",
    category: "Medical",
    aiScore: 90,
    emailValidationStatus: "unknown",
    emailValidationReason: "mailbox_not_verified",
    hasMxRecords: true,
    emailSourceUrl: `https://company-${index}.example/contact`,
    emailSourceType: "website_contact",
    emailDiscoveryMethod: "website_contact",
    emailIsGuessed: false,
    synthetic: false,
    sourceKind: "serpapi",
    locationMatch: "verified",
    requestedLocation: "",
  };
}

function recipients(leads) {
  return leads.map((lead) => ({ leadId: lead.id, company: lead.company, email: lead.email, lead }));
}

test("F: confirmed de outra operação alerta e não bloqueia", () => {
  const leads = Array.from({ length: 75 }, (_, index) => readyLead(index));
  const history = [0, 1].map((index) => ({ operation: "modeclean", normalizedEmail: leads[index].email, campaignId: "modeclean-old", campaignName: "Modeclean", sentAt: at, providerMessageId: `provider-${index}` }));
  const result = auditGlobalEmailRecipients({ operation: "panek-puglesi", campaignId: "current", contactKind: "first_contact", companiesFound: 75, recipients: recipients(leads), history });
  assert.equal(result.otherOperationWarnings, 2);
  assert.equal(result.finalSendCount, 75);
  assert.equal(result.qualityExcluded, 0);
});

test("G: confirmed da mesma operação bloqueia first_contact", () => {
  const lead = readyLead(1);
  const result = auditGlobalEmailRecipients({ operation: "panek-puglesi", campaignId: "current", contactKind: "first_contact", companiesFound: 1, recipients: recipients([lead]), history: [{ operation: "panek-puglesi", normalizedEmail: lead.email, campaignId: "old", campaignName: "Old", sentAt: at, providerMessageId: "provider-same" }] });
  assert.equal(result.finalSendCount, 0);
  assert.equal(result.decisions[0].code, "same_operation_contacted");
});

test("H: 75 contatos atuais → 74 elegíveis, 1 same-operation blocked, 2 other-operation alerts", () => {
  const leads = Array.from({ length: 75 }, (_, index) => readyLead(index));
  const history = [
    {
      operation: "panek-puglesi",
      normalizedEmail: leads[10].email,
      campaignId: "old-pnp",
      campaignName: "Old P&P",
      sentAt: at,
      providerMessageId: "provider-same-op",
    },
    {
      operation: "modeclean",
      normalizedEmail: leads[20].email,
      campaignId: "modeclean-old",
      campaignName: "Modeclean",
      sentAt: at,
      providerMessageId: "provider-other-1",
    },
    {
      operation: "modeclean",
      normalizedEmail: leads[21].email,
      campaignId: "modeclean-old",
      campaignName: "Modeclean",
      sentAt: at,
      providerMessageId: "provider-other-2",
    },
  ];
  const result = auditGlobalEmailRecipients({
    operation: "panek-puglesi",
    campaignId: "current",
    contactKind: "first_contact",
    companiesFound: 75,
    recipients: recipients(leads),
    history,
  });
  assert.equal(result.companiesFound, 75);
  assert.equal(result.alreadyContactedSameOperation, 1);
  assert.equal(result.otherOperationWarnings, 2);
  assert.equal(result.finalSendCount, 74);
  assert.equal(result.decisions[10].included, false);
  assert.equal(result.decisions[10].code, "same_operation_contacted");
  assert.equal(result.decisions[20].included, true);
  assert.ok(result.decisions[20].otherOperationContact);
  assert.equal(result.decisions[21].included, true);
});

test("H: 75 novos, zero same-operation e zero blocked não viram zero", () => {
  const leads = Array.from({ length: 75 }, (_, index) => readyLead(index));
  const result = auditGlobalEmailRecipients({ operation: "panek-puglesi", campaignId: "current", contactKind: "first_contact", companiesFound: 75, recipients: recipients(leads), history: [], permanentBlocks: [] });
  assert.equal(result.newRecipients, 75);
  assert.equal(result.finalSendCount, 75);
  assert.equal(result.decisions.filter((item) => !item.included && !item.reason).length, 0);
});

test("qualidade excluída sempre tem código e motivo exatos", () => {
  const guessed = { ...readyLead(1), emailSourceUrl: null, emailSourceType: null, emailDiscoveryMethod: null, emailIsGuessed: true };
  const result = auditGlobalEmailRecipients({ operation: "panek-puglesi", campaignId: "current", contactKind: "first_contact", companiesFound: 1, recipients: recipients([guessed]), history: [] });
  assert.equal(result.finalSendCount, 0);
  assert.equal(result.qualityExcluded, 1);
  assert.equal(result.decisions[0].code, "guess_not_verified");
  assert.match(result.decisions[0].reason, /proveniência/);
});

test("J: trocar campanha pausada não reutiliza fila stale e permite preparar 75", () => {
  const leads = Array.from({ length: 75 }, (_, index) => readyLead(index));
  const initial = createInitialAgentThreeSnapshot();
  initial.operations["panek-puglesi"].status = "paused";
  initial.operations["panek-puglesi"].currentCampaignId = "old";
  const selected = selectAgentThreeCampaign(initial, "panek-puglesi", "current", at);
  assert.equal(selected.operations["panek-puglesi"].status, "idle");
  const loaded = loadAgentThreeLeads(selected, "panek-puglesi", "current", leads, 75, at);
  const prepared = prepareAgentThreeCampaign(loaded.snapshot, "panek-puglesi", "current", leads, at);
  assert.equal(prepared.eligibleCount, 75);
});
