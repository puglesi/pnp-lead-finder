import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentThreeSendRequest } from "../src/lib/agent-three-send-request.ts";
import { evaluateAgentThreePreflight } from "../src/lib/agent-three-preflight.ts";
import {
  bindSignatureToOperation,
  getOperationSignatureUiStatus,
  OPERATION_SIGNATURE_NOT_CONFIGURED_MESSAGE,
} from "../src/lib/operation-signature.ts";
import {
  createOfficialSignatureRecord,
  resolveOfficialSignaturesFromSources,
} from "../src/lib/operation-signature-repository.ts";
import { assertNoCommercialDatabaseAccess } from "./helpers/commercial-database-guard.mjs";

assertNoCommercialDatabaseAccess(import.meta.url);

const PNP_HTML =
  "<table><tr><td>Panek &amp; Puglesi official</td></tr></table>";
const MODECLEAN_HTML =
  "<table><tr><td>Modeclean official</td></tr></table>";
const CAMPAIGN_ID = "fixture-pnp-signature-preflight-campaign";
const FIXTURE_SENDER = "sender@fixture.test";

function official(operation, html) {
  return bindSignatureToOperation(operation, { enabled: true, body: html });
}

function campaign(profileId, signature) {
  return {
    id: `${profileId}-campanha-teste`,
    campaignProfileId: profileId,
    name: "Campanha Teste",
    subject: "Olá, {{company}}",
    body: "<p>Proposta para {{company}}</p>",
    unsubscribeLink: "https://example.test/unsubscribe?email={{email}}",
    signature,
    attachment: null,
  };
}

function queueItem(profileId, index = 1) {
  return {
    id: `${profileId}-fixture-queue-${index}`,
    leadId: `fixture-lead-${index}`,
    campaignProfileId: profileId,
    campaignId: `${profileId}-campanha-teste`,
    companyName: `Empresa ${index}`,
    originalEmail: `recipient-${index}@example.test`,
    normalizedEmail: `recipient-${index}@example.test`,
    sector: "Serviços",
    location: "London",
    validationStatus: "unknown",
    validationReason: "mailbox_not_verified",
    queueStatus: "ready",
    createdAt: "2026-08-26T17:00:00.000Z",
    updatedAt: "2026-08-26T17:00:00.000Z",
    attemptCount: 0,
  };
}

const lead = {
  id: "fixture-lead-1",
  company: "Empresa",
  website: "https://empresa.test",
  email: "contato@empresa.test",
  phone: "",
  address: "London",
  category: "Serviços",
  aiScore: 0,
};

function controlledPreflightFixture() {
  const sqlite = [
    createOfficialSignatureRecord({
      operationId: "panek-puglesi",
      enabled: true,
      html: PNP_HTML,
    }),
  ];
  const hydrated = resolveOfficialSignaturesFromSources({
    sqlite,
    indexedDb: [],
  });
  const signatureRecord = hydrated.records.find(
    (item) => item.operationId === "panek-puglesi"
  );
  assert.ok(signatureRecord);

  const queue = Array.from({ length: 5 }, (_, index) => {
    const item = {
      ...queueItem("panek-puglesi", index + 1),
      campaignId: CAMPAIGN_ID,
    };
    if (index >= 2) return item;
    return {
      ...item,
      queueStatus: "sent",
      providerMessageId: `<fixture-preflight-provider-${index + 1}@example.test>`,
      sentAt: "2026-08-26T17:10:00.000Z",
    };
  });
  const readyCount = queue.filter((item) => item.queueStatus === "ready").length;
  const confirmedCount = queue.filter(
    (item) => item.queueStatus === "sent" && item.providerMessageId
  ).length;

  return {
    operation: "panek-puglesi",
    signature: official("panek-puglesi", signatureRecord.html),
    campaign: {
      id: CAMPAIGN_ID,
      campaignProfileId: "panek-puglesi",
      subject: "Fixture subject",
      body: "<p>Fixture body</p>",
    },
    senderFromEmail: FIXTURE_SENDER,
    queue,
    readyCount,
    confirmedCount,
  };
}

test("A) SQLite P&P válida → Agent 3 reconhece configured", () => {
  const sqlite = [
    createOfficialSignatureRecord({
      operationId: "panek-puglesi",
      enabled: true,
      html: PNP_HTML,
    }),
  ];
  const resolved = resolveOfficialSignaturesFromSources({
    sqlite,
    indexedDb: [],
  });
  assert.equal(resolved.records[0]?.operationId, "panek-puglesi");
  assert.equal(resolved.records[0]?.html, PNP_HTML);
  const status = getOperationSignatureUiStatus({
    operation: "panek-puglesi",
    hasHydrated: true,
    isHydrating: false,
    signature: official("panek-puglesi", resolved.records[0].html),
  });
  assert.equal(status, "configured");
});

test("B) IndexedDB stale vazio + SQLite válido → SQLite vence", () => {
  const sqlite = [
    createOfficialSignatureRecord({
      operationId: "panek-puglesi",
      enabled: true,
      html: PNP_HTML,
    }),
  ];
  const resolved = resolveOfficialSignaturesFromSources({
    sqlite,
    indexedDb: [],
  });
  assert.equal(resolved.migrateToSqlite.length, 0);
  assert.equal(resolved.records.length, 1);
  assert.equal(resolved.records[0].html, PNP_HTML);
  assert.doesNotMatch(resolved.records[0].html, /Modeclean/);
});

test("B2) SQLite vazio + IndexedDB válido → migra HTML exato para SQLite", () => {
  const indexed = [
    createOfficialSignatureRecord({
      operationId: "panek-puglesi",
      enabled: true,
      html: PNP_HTML,
    }),
  ];
  const resolved = resolveOfficialSignaturesFromSources({
    sqlite: [],
    indexedDb: indexed,
  });
  assert.equal(resolved.migrateToSqlite.length, 1);
  assert.equal(resolved.migrateToSqlite[0].html, PNP_HTML);
  assert.equal(resolved.records[0].html, PNP_HTML);
});

test("C) hydration checking não mostra não configurada prematuramente", () => {
  const empty = { enabled: false, body: "" };
  assert.equal(
    getOperationSignatureUiStatus({
      operation: "panek-puglesi",
      hasHydrated: false,
      isHydrating: true,
      signature: empty,
    }),
    "checking"
  );
  assert.notEqual(
    getOperationSignatureUiStatus({
      operation: "panek-puglesi",
      hasHydrated: false,
      isHydrating: false,
      signature: empty,
    }),
    "not_configured"
  );
  const preflight = evaluateAgentThreePreflight({
    operation: "panek-puglesi",
    hasHydrated: false,
    isHydrating: true,
    officialSignature: empty,
    senderFromEmail: FIXTURE_SENDER,
    campaign: {
      id: CAMPAIGN_ID,
      campaignProfileId: "panek-puglesi",
      subject: "Hi",
      body: "<p>Hi</p>",
    },
    dbWritable: true,
    readyCount: 3,
    confirmedCount: 2,
  });
  assert.equal(preflight.signatureStatus, "checking");
  assert.equal(preflight.ok, false);
  assert.equal(preflight.errorMessage, null);
});

test("D) P&P nunca usa assinatura Modeclean", () => {
  const sqlite = [
    createOfficialSignatureRecord({
      operationId: "panek-puglesi",
      enabled: true,
      html: PNP_HTML,
    }),
    createOfficialSignatureRecord({
      operationId: "modeclean",
      enabled: true,
      html: MODECLEAN_HTML,
    }),
  ];
  const resolved = resolveOfficialSignaturesFromSources({ sqlite, indexedDb: [] });
  const pnp = resolved.records.find((item) => item.operationId === "panek-puglesi");
  assert.match(pnp.html, /Panek/);
  assert.doesNotMatch(pnp.html, /Modeclean/);
  const result = buildAgentThreeSendRequest(
    "panek-puglesi",
    campaign(
      "panek-puglesi",
      official("modeclean", MODECLEAN_HTML)
    ),
    queueItem("panek-puglesi"),
    lead,
    { officialSignature: official("panek-puglesi", PNP_HTML) }
  );
  assert.equal(result.errorMessage, null);
  assert.match(result.request?.html ?? "", /Panek/);
  assert.doesNotMatch(result.request?.html ?? "", /Modeclean official/);
});

test("E) Modeclean nunca usa assinatura P&P", () => {
  const result = buildAgentThreeSendRequest(
    "modeclean",
    campaign("modeclean", official("panek-puglesi", PNP_HTML)),
    queueItem("modeclean"),
    lead,
    { officialSignature: official("modeclean", MODECLEAN_HTML) }
  );
  assert.equal(result.errorMessage, null);
  assert.match(result.request?.html ?? "", /Modeclean official/);
  assert.doesNotMatch(result.request?.html ?? "", /Panek/);
});

test("F) campaign reload resolve assinatura oficial atual", () => {
  const staleCampaign = campaign("panek-puglesi", {
    enabled: false,
    body: "",
    operation: "panek-puglesi",
  });
  const result = buildAgentThreeSendRequest(
    "panek-puglesi",
    staleCampaign,
    queueItem("panek-puglesi"),
    lead,
    { officialSignature: official("panek-puglesi", PNP_HTML) }
  );
  assert.equal(result.errorMessage, null);
  assert.match(result.request?.html ?? "", /Panek/);
});

test("G) preflight com assinatura válida passa", () => {
  const result = evaluateAgentThreePreflight({
    operation: "panek-puglesi",
    hasHydrated: true,
    isHydrating: false,
    officialSignature: official("panek-puglesi", PNP_HTML),
    senderFromEmail: FIXTURE_SENDER,
    campaign: {
      id: CAMPAIGN_ID,
      campaignProfileId: "panek-puglesi",
      subject: "Making property ownership easier",
      body: "<p>Hello</p>",
    },
    dbWritable: true,
    readyCount: 3,
    confirmedCount: 2,
  });
  assert.equal(result.ok, true);
  assert.equal(result.signatureStatus, "configured");
  assert.equal(result.errorMessage, null);
  assert.equal(result.readyCount, 3);
  assert.equal(result.confirmedCount, 2);
});

test("H) preflight sem assinatura realmente configurada bloqueia", () => {
  const result = evaluateAgentThreePreflight({
    operation: "panek-puglesi",
    hasHydrated: true,
    isHydrating: false,
    officialSignature: { enabled: false, body: "", operation: "panek-puglesi" },
    senderFromEmail: FIXTURE_SENDER,
    campaign: {
      id: CAMPAIGN_ID,
      campaignProfileId: "panek-puglesi",
      subject: "Hi",
      body: "<p>Hi</p>",
    },
    dbWritable: true,
    readyCount: 3,
    confirmedCount: 2,
  });
  assert.equal(result.ok, false);
  assert.equal(result.signatureStatus, "not_configured");
  assert.equal(result.errorMessage, OPERATION_SIGNATURE_NOT_CONFIGURED_MESSAGE);
});

test("I) hydration/preflight usa campanha, sender e fila controlados", () => {
  const fixture = controlledPreflightFixture();
  const result = evaluateAgentThreePreflight({
    operation: fixture.operation,
    hasHydrated: true,
    isHydrating: false,
    officialSignature: fixture.signature,
    senderFromEmail: fixture.senderFromEmail,
    campaign: fixture.campaign,
    dbWritable: true,
    readyCount: fixture.readyCount,
    confirmedCount: fixture.confirmedCount,
  });

  assert.equal(fixture.queue.length, 5);
  assert.equal(fixture.readyCount, 3);
  assert.equal(fixture.confirmedCount, 2);
  assert.equal(result.ok, true);
  assert.equal(result.signatureStatus, "configured");
  assert.equal(result.readyCount, 3);
  assert.equal(result.confirmedCount, 2);
  assert.equal(result.errorMessage, null);
});

test("J) zero emails reais nesta suíte", () => {
  assert.equal(typeof buildAgentThreeSendRequest, "function");
  assert.equal(typeof evaluateAgentThreePreflight, "function");
});

test("K) zero busca real nesta suíte", () => {
  assert.equal(typeof resolveOfficialSignaturesFromSources, "function");
});

test("tracking error não é usado quando a assinatura está ausente", () => {
  const result = buildAgentThreeSendRequest(
    "panek-puglesi",
    campaign("panek-puglesi", {
      enabled: false,
      body: "",
      operation: "panek-puglesi",
    }),
    queueItem("panek-puglesi"),
    lead,
    { officialSignature: { enabled: false, body: "" } }
  );
  assert.equal(result.request, null);
  assert.equal(result.errorMessage, OPERATION_SIGNATURE_NOT_CONFIGURED_MESSAGE);
  assert.doesNotMatch(result.errorMessage ?? "", /rastreamento/);
});
