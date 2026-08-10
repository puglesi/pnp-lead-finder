import assert from "node:assert/strict";
import test from "node:test";
import {
  acquireGlobalEmailSendLock,
  auditGlobalEmailRecipients,
  buildGlobalEmailHistory,
} from "../src/lib/global-email-deduplication.ts";
import {
  createInitialAgentThreeSnapshot,
  normalizeAgentThreeSnapshot,
} from "../src/lib/agent-three-queue.ts";

const sentAt = "2026-08-01T10:00:00.000Z";

function lead(id, email, company = "Example Ltd") {
  return { id, email, normalizedEmail: email, company };
}

function campaign(id, operation, name, leadStatuses = []) {
  return {
    id,
    campaignProfileId: operation,
    name,
    leadStatuses,
    sendErrors: [],
    updatedAt: sentAt,
  };
}

function confirmedRecord(overrides = {}) {
  return {
    queueItemId: "queue-previous",
    leadId: "lead-previous",
    normalizedEmail: "person@example.com",
    campaignProfileId: "panek-puglesi",
    campaignId: "campaign-previous",
    sentAt,
    providerMessageId: "provider-message-123",
    ...overrides,
  };
}

function evidence({ sentRecords = [], campaigns = [], leads = [] } = {}) {
  const snapshot = createInitialAgentThreeSnapshot();
  for (const record of sentRecords) {
    snapshot.operations[record.campaignProfileId].sentIndex.push(record);
  }
  return {
    snapshot,
    campaigns,
    leads,
    history: buildGlobalEmailHistory({
      campaigns,
      leads,
      operations: snapshot.operations,
    }),
  };
}

function preview(history, options = {}) {
  return auditGlobalEmailRecipients({
    operation: "panek-puglesi",
    campaignId: "campaign-new",
    contactKind: "first_contact",
    companiesFound: 1,
    recipients: [
      { leadId: "lead-new", company: "Example Ltd", email: "person@example.com" },
    ],
    history,
    ...options,
  });
}

test("deduplicação 1. bloqueia o mesmo e-mail em duas campanhas da mesma operação", () => {
  const { history } = evidence({
    sentRecords: [confirmedRecord()],
    campaigns: [campaign("campaign-previous", "panek-puglesi", "Campanha anterior")],
  });
  const result = preview(history);
  assert.equal(result.finalSendCount, 0);
  assert.equal(result.alreadyContactedSameOperation, 1);
  assert.equal(result.decisions[0].code, "same_operation_contacted");
  assert.match(result.decisions[0].reason, /01\/08\/2026.*Campanha anterior/);
});

test("deduplicação 2. normaliza maiúsculas e espaços antes de comparar", () => {
  const { history } = evidence({
    sentRecords: [confirmedRecord({ normalizedEmail: " Person@Example.COM " })],
  });
  const result = preview(history, {
    recipients: [
      { leadId: "lead-new", company: "Example Ltd", email: "  PERSON@example.com  " },
    ],
  });
  assert.equal(result.finalSendCount, 0);
  assert.equal(result.decisions[0].normalizedEmail, "person@example.com");
});

test("deduplicação 3. contato entre P&P e Modeclean gera alerta sem bloqueio", () => {
  const { history } = evidence({
    sentRecords: [
      confirmedRecord({
        campaignProfileId: "modeclean",
        campaignId: "modeclean-previous",
      }),
    ],
  });
  const result = preview(history);
  assert.equal(result.finalSendCount, 1);
  assert.equal(result.otherOperationWarnings, 1);
  assert.equal(result.decisions[0].included, true);
});

test("deduplicação 4. autoriza repetição somente como follow-up explícito", () => {
  const { history } = evidence({ sentRecords: [confirmedRecord()] });
  const result = preview(history, { contactKind: "follow_up" });
  assert.equal(result.finalSendCount, 1);
  assert.equal(result.authorizedFollowUps, 1);
  assert.equal(result.decisions[0].previousContact?.campaignId, "campaign-previous");
});

test("deduplicação 5. template comum é bloqueado como novo primeiro contato", () => {
  const { history } = evidence({ sentRecords: [confirmedRecord()] });
  const result = preview(history, { contactKind: "first_contact" });
  assert.equal(result.finalSendCount, 0);
  assert.equal(result.decisions[0].code, "same_operation_contacted");
});

test("deduplicação 6. falha sem providerMessageId pode ser tentada novamente", () => {
  const campaigns = [
    campaign("campaign-previous", "panek-puglesi", "Falha anterior", [
      { leadId: "lead-previous", status: "failed", sentAt },
    ]),
  ];
  const { history } = evidence({
    campaigns,
    leads: [lead("lead-previous", "person@example.com")],
  });
  assert.equal(history.length, 0);
  assert.equal(preview(history).finalSendCount, 1);
});

test("deduplicação 7. envio confirmado com providerMessageId nunca se repete", () => {
  const campaigns = [
    campaign("campaign-previous", "panek-puglesi", "Confirmada", [
      {
        leadId: "lead-previous",
        status: "sent",
        sentAt,
        providerMessageId: "provider-message-456",
      },
    ]),
  ];
  const { history } = evidence({
    campaigns,
    leads: [lead("lead-previous", "person@example.com")],
  });
  assert.equal(history.length, 1);
  assert.equal(preview(history).finalSendCount, 0);
});

test("deduplicação 8. remove e identifica duplicado dentro do mesmo lote", () => {
  const result = preview([], {
    companiesFound: 2,
    recipients: [
      { leadId: "lead-a", company: "A Ltd", email: "person@example.com" },
      { leadId: "lead-b", company: "B Ltd", email: " PERSON@example.com " },
    ],
  });
  assert.equal(result.finalSendCount, 1);
  assert.equal(result.duplicatesInBatch, 1);
  assert.equal(result.decisions[1].reason, "Duplicado dentro deste lote");
});

test("deduplicação 9. retomada após reload mantém o histórico confirmado", () => {
  const original = createInitialAgentThreeSnapshot();
  original.operations["panek-puglesi"].sentIndex.push(confirmedRecord());
  const reloaded = normalizeAgentThreeSnapshot(JSON.parse(JSON.stringify(original)));
  const history = buildGlobalEmailHistory({
    campaigns: [],
    leads: [],
    operations: reloaded.operations,
  });
  assert.equal(preview(history).finalSendCount, 0);
});

test("deduplicação 10. dois cliques simultâneos adquirem somente uma trava", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const first = acquireGlobalEmailSendLock({
    operation: "panek-puglesi",
    email: " Person@Example.com ",
    owner: "click-one",
    nowMs: 1_000,
    storage,
  });
  const second = acquireGlobalEmailSendLock({
    operation: "panek-puglesi",
    email: "person@example.com",
    owner: "click-two",
    nowMs: 1_000,
    storage,
  });
  assert.equal(first.acquired, true);
  assert.equal(second.acquired, false);
  first.release();
  assert.equal(
    acquireGlobalEmailSendLock({
      operation: "panek-puglesi",
      email: "person@example.com",
      owner: "retry",
      nowMs: 2_000,
      storage,
    }).acquired,
    true
  );
});
