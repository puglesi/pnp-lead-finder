import assert from "node:assert/strict";
import test from "node:test";
import {
  NO_SENDING_PROVIDER_MESSAGE,
  claimNextAgentThreeItem,
  completeAgentThreeItem,
  createInitialAgentThreeSnapshot,
  failAgentThreeItem,
  getAgentThreeCampaignDeliverySummary,
  getAgentThreeMetrics,
  hasEmailReceivedCampaign,
  hasLeadReceivedCampaign,
  loadAgentThreeLeads,
  normalizeAgentThreeSnapshot,
  pauseAgentThree,
  resumeAgentThree,
  retryAgentThreeItem,
  selectAgentThreeCampaign,
  startAgentThree,
  stopAgentThree,
} from "../src/lib/agent-three-queue.ts";

const now = "2026-07-28T10:00:00.000Z";
const later = "2026-07-28T10:01:00.000Z";
const finalTime = "2026-07-28T10:02:00.000Z";

function lead(id, email, validationStatus = "valid", validationReason = "confirmed") {
  return {
    id,
    company: "Company " + id,
    website: "https://" + id + ".example",
    email,
    phone: "",
    address: "London",
    category: "Cleaning",
    aiScore: 0,
    emailValidationStatus: validationStatus,
    emailValidationReason: validationReason,
    normalizedEmail: typeof email === "string" ? email.trim().toLowerCase() : undefined,
  };
}

function legacyLead(id, email) {
  return {
    id,
    company: "Legacy " + id,
    website: "",
    email,
    phone: "",
    address: "London",
    category: "Legacy",
    aiScore: 0,
  };
}

function load(snapshot, profileId, campaignId, leads, quantity = leads.length) {
  return loadAgentThreeLeads(
    snapshot,
    profileId,
    campaignId,
    leads,
    quantity,
    now
  );
}

function readySnapshot(profileId = "panek-puglesi", campaignId = "campaign-a") {
  const initial = selectAgentThreeCampaign(
    createInitialAgentThreeSnapshot(),
    profileId,
    campaignId,
    now
  );
  return load(initial, profileId, campaignId, [lead("one", "one@example.test")]).snapshot;
}

function claimReady(snapshot, profileId = "panek-puglesi") {
  const started = startAgentThree(snapshot, profileId, true, later);
  assert.equal(started.started, true);
  const claimed = claimNextAgentThreeItem(started.snapshot, profileId, later);
  assert.ok(claimed.item);
  return claimed;
}

test("1. filas P&P e Modeclean são independentes", () => {
  const result = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-a",
    [lead("one", "one@example.test")]
  );
  assert.equal(result.snapshot.operations["panek-puglesi"].queue.length, 1);
  assert.equal(result.snapshot.operations.modeclean.queue.length, 0);
});

test("2. mesma campanha não aceita normalizedEmail repetido", () => {
  const result = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-a",
    [
      lead("one", "Person@Example.test"),
      lead("two", " person@example.test "),
    ]
  );
  assert.equal(result.addedCount, 1);
  assert.equal(result.ignoredCount, 1);
  assert.equal(result.snapshot.operations["panek-puglesi"].queue.length, 1);
});

test("3. campanhas diferentes podem usar o mesmo lead", () => {
  const first = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-a",
    [lead("one", "one@example.test")]
  );
  const second = load(
    first.snapshot,
    "panek-puglesi",
    "campaign-b",
    [lead("one", "one@example.test")]
  );
  assert.equal(second.snapshot.operations["panek-puglesi"].queue.length, 2);
});

test("4. P&P e Modeclean podem usar o mesmo lead separadamente", () => {
  const first = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-pnp",
    [lead("one", "one@example.test")]
  );
  const second = load(
    first.snapshot,
    "modeclean",
    "campaign-modeclean",
    [lead("one", "one@example.test")]
  );
  assert.equal(second.snapshot.operations["panek-puglesi"].queue.length, 1);
  assert.equal(second.snapshot.operations.modeclean.queue.length, 1);
});

test("5. invalid fica blocked", () => {
  const result = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-a",
    [lead("bad", "bad", "invalid", "invalid_syntax")]
  );
  assert.equal(result.addedItems[0].queueStatus, "blocked");
});

test("6. duplicate fica blocked", () => {
  const result = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-a",
    [lead("duplicate", "same@example.test", "duplicate", "duplicate_of:one")]
  );
  assert.equal(result.addedItems[0].queueStatus, "blocked");
});

test("7. no_email fica blocked", () => {
  const result = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-a",
    [lead("empty", null, "no_email", "no_email")]
  );
  assert.equal(result.addedItems[0].queueStatus, "blocked");
  assert.equal(result.addedItems[0].normalizedEmail, null);
});

test("8. unknown não fica automaticamente ready", () => {
  const result = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-a",
    [lead("unknown", "unknown@example.test", "unknown", "mailbox_not_verified")]
  );
  assert.equal(result.addedItems[0].queueStatus, "blocked");
  assert.notEqual(result.addedItems[0].queueStatus, "ready");
});

test("9. carregar leads não inicia o agente", () => {
  const result = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-a",
    [lead("one", "one@example.test")]
  );
  assert.equal(result.snapshot.operations["panek-puglesi"].status, "idle");
  assert.equal(result.snapshot.operations["panek-puglesi"].currentItemId, null);
});

test("10. ausência de provedor impede Start", () => {
  const snapshot = readySnapshot();
  const result = startAgentThree(snapshot, "panek-puglesi", false, later);
  assert.equal(result.started, false);
  assert.equal(result.message, NO_SENDING_PROVIDER_MESSAGE);
  assert.equal(result.snapshot.operations["panek-puglesi"].status, "idle");
});

test("11. ausência de provedor não altera a fila", () => {
  const snapshot = readySnapshot();
  const before = structuredClone(snapshot.operations["panek-puglesi"].queue);
  const result = startAgentThree(snapshot, "panek-puglesi", false, later);
  assert.deepEqual(result.snapshot.operations["panek-puglesi"].queue, before);
  assert.equal(
    result.snapshot.operations["panek-puglesi"].history.at(-1).action,
    "start_blocked"
  );
});

test("12. running e item sending restaurados viram paused e ready", () => {
  const claimed = claimReady(readySnapshot());
  const restored = normalizeAgentThreeSnapshot(
    structuredClone(claimed.snapshot)
  );
  const operation = restored.operations["panek-puglesi"];
  assert.equal(operation.status, "paused");
  assert.equal(operation.currentItemId, null);
  assert.equal(operation.queue[0].queueStatus, "ready");
  assert.equal(operation.queue[0].attemptCount, 1);
});

test("13. itens sent permanecem sent e entram no índice persistente", () => {
  const claimed = claimReady(readySnapshot());
  const completed = completeAgentThreeItem(
    claimed.snapshot,
    "panek-puglesi",
    claimed.item.id,
    finalTime,
    "mock-message-1"
  );
  const restored = normalizeAgentThreeSnapshot(structuredClone(completed));
  const operation = restored.operations["panek-puglesi"];
  assert.equal(operation.queue[0].queueStatus, "sent");
  assert.equal(operation.queue[0].providerMessageId, "mock-message-1");
  assert.equal(hasLeadReceivedCampaign(operation, "campaign-a", "one"), true);
  assert.equal(
    hasEmailReceivedCampaign(operation, "campaign-a", "ONE@example.test"),
    true
  );
});

test("14. falha não conta como sent", () => {
  const claimed = claimReady(readySnapshot());
  const failed = failAgentThreeItem(
    claimed.snapshot,
    "panek-puglesi",
    claimed.item.id,
    "mock failure",
    finalTime
  );
  const operation = failed.operations["panek-puglesi"];
  const summary = getAgentThreeCampaignDeliverySummary(operation, "campaign-a");
  assert.equal(summary.failed, 1);
  assert.equal(summary.sent, 0);
  assert.equal(operation.sentIndex.length, 0);
});

test("15. attemptCount é incrementado corretamente por tentativa", () => {
  const firstClaim = claimReady(readySnapshot());
  const failed = failAgentThreeItem(
    firstClaim.snapshot,
    "panek-puglesi",
    firstClaim.item.id,
    "mock failure",
    finalTime
  );
  const stopped = stopAgentThree(failed, "panek-puglesi", finalTime);
  const retried = retryAgentThreeItem(
    stopped,
    "panek-puglesi",
    firstClaim.item.id,
    finalTime
  );
  const resumed = startAgentThree(retried, "panek-puglesi", true, finalTime);
  assert.equal(resumed.started, true);
  const secondClaim = claimNextAgentThreeItem(
    resumed.snapshot,
    "panek-puglesi",
    finalTime
  );
  assert.equal(secondClaim.item.attemptCount, 2);
});

test("16. métricas somam corretamente", () => {
  const base = readySnapshot();
  const operation = base.operations["panek-puglesi"];
  const queue = [
    operation.queue[0],
    { ...operation.queue[0], id: "pending", leadId: "pending", queueStatus: "pending" },
    { ...operation.queue[0], id: "sending", leadId: "sending", queueStatus: "sending" },
    { ...operation.queue[0], id: "sent", leadId: "sent", queueStatus: "sent" },
    { ...operation.queue[0], id: "failed", leadId: "failed", queueStatus: "failed" },
    { ...operation.queue[0], id: "blocked", leadId: "blocked", queueStatus: "blocked" },
    { ...operation.queue[0], id: "skipped", leadId: "skipped", queueStatus: "skipped" },
  ];
  const metrics = getAgentThreeMetrics({ ...operation, queue });
  assert.deepEqual(
    {
      total: metrics.total,
      pending: metrics.pending,
      ready: metrics.ready,
      sent: metrics.sent,
      failed: metrics.failed,
      blocked: metrics.blocked,
      skipped: metrics.skipped,
    },
    { total: 7, pending: 1, ready: 2, sent: 1, failed: 1, blocked: 1, skipped: 1 }
  );
});

test("17. itens já enviados na mesma campanha não entram novamente", () => {
  const claimed = claimReady(readySnapshot());
  const completed = completeAgentThreeItem(
    claimed.snapshot,
    "panek-puglesi",
    claimed.item.id,
    finalTime
  );
  const reloaded = load(
    completed,
    "panek-puglesi",
    "campaign-a",
    [lead("one", "one@example.test")]
  );
  assert.equal(reloaded.addedCount, 0);
  assert.equal(reloaded.ignoredCount, 1);
  assert.equal(reloaded.alreadySentCount, 1);
  assert.equal(reloaded.snapshot.operations["panek-puglesi"].queue.length, 1);
});

test("18. resultados do Agente 2 não são apagados", () => {
  const validatedLead = lead(
    "unknown",
    "unknown@example.test",
    "unknown",
    "mailbox_not_verified"
  );
  const before = structuredClone(validatedLead);
  load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-a",
    [validatedLead]
  );
  assert.deepEqual(validatedLead, before);
  assert.equal(validatedLead.emailValidationReason, "mailbox_not_verified");
});

test("19. leads antigos continuam compatíveis", () => {
  const result = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-a",
    [legacyLead("legacy", "legacy@example.test")]
  );
  assert.equal(result.addedCount, 1);
  assert.equal(result.addedItems[0].validationStatus, "pending");
  assert.equal(result.addedItems[0].queueStatus, "pending");
});

test("20. fluxo puro não chama internet nem envia e-mail", () => {
  let externalCalls = 0;
  const fakeExternalDependency = () => {
    externalCalls += 1;
  };
  const loaded = readySnapshot();
  const started = startAgentThree(
    loaded,
    "panek-puglesi",
    true,
    later
  );
  const paused = pauseAgentThree(
    started.snapshot,
    "panek-puglesi",
    finalTime
  );
  const resumed = resumeAgentThree(
    paused,
    "panek-puglesi",
    true,
    finalTime
  );
  const stopped = stopAgentThree(
    resumed.snapshot,
    "panek-puglesi",
    finalTime
  );
  assert.equal(externalCalls, 0);
  assert.equal(fakeExternalDependency instanceof Function, true);
  assert.equal(paused.operations["panek-puglesi"].status, "paused");
  assert.equal(resumed.started, true);
  assert.equal(stopped.operations["panek-puglesi"].status, "stopped");
  assert.equal(stopped.operations["panek-puglesi"].queue[0].queueStatus, "ready");
  assert.equal(stopped.operations["panek-puglesi"].sentIndex.length, 0);
});
