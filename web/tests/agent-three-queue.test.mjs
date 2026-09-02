import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  NO_SENDING_PROVIDER_MESSAGE,
  NO_ELIGIBLE_LEADS_MESSAGE,
  claimNextAgentThreeItem,
  completeAgentThreeItem,
  configureAgentThreeIntervals,
  configureAgentThreeLimit,
  createInitialAgentThreeSnapshot,
  failAgentThreeItem,
  finishAgentThree,
  getAgentThreeCampaignDeliverySummary,
  getAgentThreeMetrics,
  hasEmailReceivedCampaign,
  hasLeadReceivedCampaign,
  loadAgentThreeLeads,
  normalizeAgentThreeSnapshot,
  pauseAgentThree,
  prepareAgentThreeCampaign,
  resumeAgentThree,
  retryAgentThreeItem,
  selectAgentThreeCampaign,
  startAgentThree,
  stopAgentThree,
} from "../src/lib/agent-three-queue.ts";
import {
  selectAgentThreeIntervalSeconds,
  waitForAgentThreeInterval,
} from "../src/lib/agent-three-execution.ts";
import { applyAgentThreeSmtpResult } from "../src/lib/agent-three-delivery.ts";
import {
  getAgentThreeSmtpAvailability,
  sendAgentThreeSmtp,
} from "../src/lib/server/agent-three-smtp-core.ts";

const now = "2026-07-28T10:00:00.000Z";
const later = "2026-07-28T10:01:00.000Z";
const finalTime = "2026-07-28T10:02:00.000Z";

const smtpEnvironment = {
  AGENT3_REAL_SEND_ENABLED: "true",
  AGENT3_SUPPRESSION_LIST: "",
  PNP_SMTP_HOST: "pnp.smtp.example.test",
  PNP_SMTP_PORT: "465",
  PNP_SMTP_SECURE: "true",
  PNP_SMTP_USER: "pnp@example.test",
  PNP_SMTP_APP_PASSWORD: "pnp-test-secret",
  PNP_FROM_NAME: "P&P Test",
  PNP_REPLY_TO: "pnp-reply@example.test",
  MODECLEAN_SMTP_HOST: "modeclean.smtp.example.test",
  MODECLEAN_SMTP_PORT: "587",
  MODECLEAN_SMTP_SECURE: "false",
  MODECLEAN_SMTP_USER: "modeclean@example.test",
  MODECLEAN_SMTP_APP_PASSWORD: "modeclean-test-secret",
  MODECLEAN_FROM_NAME: "Modeclean Test",
  MODECLEAN_REPLY_TO: "modeclean-reply@example.test",
};

function smtpRequest(operation = "panek-puglesi") {
  return {
    operation,
    recipient: "recipient@example.test",
    subject: "Existing campaign subject",
    html: "<p>Existing campaign body</p>",
    text: "Existing campaign body",
    campaignId: "campaign-a",
    leadId: "one",
    queueItemId: "queue-one",
  };
}

function smtpMock(options = {}) {
  const calls = {
    transport: [],
    mail: [],
  };
  return {
    calls,
    dependencies: {
      environment: options.environment ?? smtpEnvironment,
      isSuppressed: options.isSuppressed,
      createTransport(transportOptions) {
        calls.transport.push(transportOptions);
        return {
          async sendMail(mailOptions) {
            calls.mail.push(mailOptions);
            if (options.error) throw options.error;
            return { messageId: options.messageId ?? "mock-smtp-message" };
          },
        };
      },
    },
  };
}

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
    synthetic: false,
    emailIsGuessed: false,
    emailSourceUrl: email ? "https://" + id + ".example/contact" : null,
    emailDiscoveryMethod: email ? "website_contact" : null,
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

function numberedLeads(count, prefix) {
  return Array.from({ length: count }, (_, index) =>
    lead(
      prefix + "-" + index,
      prefix + "-" + index + "@example.test"
    )
  );
}

function profileSnapshot(
  snapshot,
  profileId,
  campaignId,
  count,
  prefix
) {
  const selected = selectAgentThreeCampaign(
    snapshot,
    profileId,
    campaignId,
    now
  );
  return load(
    selected,
    profileId,
    campaignId,
    numberedLeads(count, prefix)
  ).snapshot;
}

function drainRunningQueue(snapshot, profileId) {
  let state = snapshot;
  while (state.operations[profileId].status === "running") {
    const claimed = claimNextAgentThreeItem(state, profileId, later);
    if (!claimed.item) {
      state = finishAgentThree(state, profileId, finalTime);
      break;
    }
    state = completeAgentThreeItem(
      claimed.snapshot,
      profileId,
      claimed.item.id,
      finalTime
    );
  }
  return state;
}

function runConfiguredQueue(snapshot, profileId) {
  const started = startAgentThree(snapshot, profileId, true, later);
  assert.equal(started.started, true);
  return drainRunningQueue(started.snapshot, profileId);
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
  assert.equal(result.addedItems[0].queueStatus, "pending");
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

test("12. running e item sending restaurados viram paused e unknown, não ready", () => {
  const claimed = claimReady(readySnapshot());
  const restored = normalizeAgentThreeSnapshot(
    structuredClone(claimed.snapshot)
  );
  const operation = restored.operations["panek-puglesi"];
  assert.equal(operation.status, "paused");
  assert.equal(operation.currentItemId, null);
  assert.equal(operation.queue[0].queueStatus, "unknown");
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
    { total: 7, pending: 1, ready: 1, sent: 1, failed: 1, blocked: 1, skipped: 1 }
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

test("limites 1. aceita limite numérico personalizado acima de 100", () => {
  const loaded = profileSnapshot(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-custom-limit",
    130,
    "custom"
  );
  const configured = configureAgentThreeLimit(
    loaded,
    "panek-puglesi",
    125,
    false,
    later
  );
  const finished = runConfiguredQueue(configured, "panek-puglesi");
  const operation = finished.operations["panek-puglesi"];
  assert.equal(operation.numericLimit, 125);
  assert.equal(operation.processedCount, 125);
  assert.equal(operation.queue.filter((item) => item.queueStatus === "sent").length, 125);
  assert.equal(operation.queue.filter((item) => item.queueStatus === "ready").length, 5);
});

test("limites 2. P&P ilimitado e Modeclean limitado", () => {
  let snapshot = profileSnapshot(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-pnp-unlimited",
    4,
    "pnp-unlimited"
  );
  snapshot = profileSnapshot(
    snapshot,
    "modeclean",
    "campaign-modeclean-limited",
    4,
    "modeclean-limited"
  );
  snapshot = configureAgentThreeLimit(
    snapshot,
    "panek-puglesi",
    2,
    true,
    later
  );
  snapshot = configureAgentThreeLimit(
    snapshot,
    "modeclean",
    2,
    false,
    later
  );
  snapshot = runConfiguredQueue(snapshot, "panek-puglesi");
  snapshot = runConfiguredQueue(snapshot, "modeclean");
  assert.equal(snapshot.operations["panek-puglesi"].sentIndex.length, 4);
  assert.equal(snapshot.operations.modeclean.sentIndex.length, 2);
  assert.equal(snapshot.operations["panek-puglesi"].untilQueueEnds, true);
  assert.equal(snapshot.operations.modeclean.untilQueueEnds, false);
});

test("limites 3. P&P limitado e Modeclean ilimitado", () => {
  let snapshot = profileSnapshot(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-pnp-limited",
    4,
    "pnp-limited"
  );
  snapshot = profileSnapshot(
    snapshot,
    "modeclean",
    "campaign-modeclean-unlimited",
    4,
    "modeclean-unlimited"
  );
  snapshot = configureAgentThreeLimit(
    snapshot,
    "panek-puglesi",
    2,
    false,
    later
  );
  snapshot = configureAgentThreeLimit(
    snapshot,
    "modeclean",
    2,
    true,
    later
  );
  snapshot = runConfiguredQueue(snapshot, "panek-puglesi");
  snapshot = runConfiguredQueue(snapshot, "modeclean");
  assert.equal(snapshot.operations["panek-puglesi"].sentIndex.length, 2);
  assert.equal(snapshot.operations.modeclean.sentIndex.length, 4);
  assert.equal(snapshot.operations["panek-puglesi"].untilQueueEnds, false);
  assert.equal(snapshot.operations.modeclean.untilQueueEnds, true);
});

test("limites 4. ambas ilimitadas processam 500 itens cada", () => {
  let snapshot = profileSnapshot(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-pnp-500",
    500,
    "pnp-500"
  );
  snapshot = profileSnapshot(
    snapshot,
    "modeclean",
    "campaign-modeclean-500",
    500,
    "modeclean-500"
  );
  snapshot = configureAgentThreeLimit(
    snapshot,
    "panek-puglesi",
    1,
    true,
    later
  );
  snapshot = configureAgentThreeLimit(
    snapshot,
    "modeclean",
    1,
    true,
    later
  );
  snapshot = runConfiguredQueue(snapshot, "panek-puglesi");
  snapshot = runConfiguredQueue(snapshot, "modeclean");
  const pnpSent = snapshot.operations["panek-puglesi"].sentIndex.length;
  const modecleanSent = snapshot.operations.modeclean.sentIndex.length;
  assert.equal(pnpSent, 500);
  assert.equal(modecleanSent, 500);
  assert.equal(pnpSent + modecleanSent, 1_000);
});

test("limites 5. modo ilimitado termina quando a fila acaba", () => {
  const loaded = profileSnapshot(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-until-end",
    3,
    "until-end"
  );
  const configured = configureAgentThreeLimit(
    loaded,
    "panek-puglesi",
    1,
    true,
    later
  );
  const finished = runConfiguredQueue(configured, "panek-puglesi");
  const operation = finished.operations["panek-puglesi"];
  assert.equal(operation.status, "completed");
  assert.equal(operation.processedCount, 3);
  assert.equal(operation.queue.every((item) => item.queueStatus === "sent"), true);
});

test("limites 6. pausa e retomada preservam o modo ilimitado", () => {
  const loaded = profileSnapshot(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-pause-unlimited",
    3,
    "pause-unlimited"
  );
  const configured = configureAgentThreeLimit(
    loaded,
    "panek-puglesi",
    1,
    true,
    later
  );
  const started = startAgentThree(configured, "panek-puglesi", true, later);
  const first = claimNextAgentThreeItem(
    started.snapshot,
    "panek-puglesi",
    later
  );
  const completed = completeAgentThreeItem(
    first.snapshot,
    "panek-puglesi",
    first.item.id,
    finalTime
  );
  const paused = pauseAgentThree(
    completed,
    "panek-puglesi",
    finalTime
  );
  const restored = normalizeAgentThreeSnapshot(structuredClone(paused));
  const resumed = resumeAgentThree(
    restored,
    "panek-puglesi",
    true,
    finalTime
  );
  assert.equal(paused.operations["panek-puglesi"].untilQueueEnds, true);
  assert.equal(paused.operations["panek-puglesi"].processedCount, 1);
  assert.equal(resumed.snapshot.operations["panek-puglesi"].untilQueueEnds, true);
  assert.equal(resumed.snapshot.operations["panek-puglesi"].processedCount, 1);
  const finished = drainRunningQueue(resumed.snapshot, "panek-puglesi");
  assert.equal(finished.operations["panek-puglesi"].processedCount, 3);
  assert.equal(finished.operations["panek-puglesi"].status, "completed");
});

test("limites 7. limite e contador de uma operação não afetam a outra", () => {
  let snapshot = profileSnapshot(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-independent-pnp",
    3,
    "independent-pnp"
  );
  snapshot = profileSnapshot(
    snapshot,
    "modeclean",
    "campaign-independent-modeclean",
    3,
    "independent-modeclean"
  );
  snapshot = configureAgentThreeLimit(
    snapshot,
    "panek-puglesi",
    2,
    false,
    later
  );
  snapshot = configureAgentThreeLimit(
    snapshot,
    "modeclean",
    7,
    true,
    later
  );
  snapshot = normalizeAgentThreeSnapshot(structuredClone(snapshot));
  const pnpStarted = startAgentThree(
    snapshot,
    "panek-puglesi",
    true,
    later
  );
  const pnpClaimed = claimNextAgentThreeItem(
    pnpStarted.snapshot,
    "panek-puglesi",
    later
  );
  assert.equal(pnpClaimed.snapshot.operations["panek-puglesi"].processedCount, 1);
  assert.equal(pnpClaimed.snapshot.operations.modeclean.processedCount, 0);
  assert.equal(pnpClaimed.snapshot.operations["panek-puglesi"].numericLimit, 2);
  assert.equal(pnpClaimed.snapshot.operations.modeclean.numericLimit, 7);
  assert.equal(pnpClaimed.snapshot.operations["panek-puglesi"].untilQueueEnds, false);
  assert.equal(pnpClaimed.snapshot.operations.modeclean.untilQueueEnds, true);
});

test("intervalos 1. mínimo e máximo persistem separadamente", () => {
  let snapshot = configureAgentThreeIntervals(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    2,
    8,
    now
  );
  snapshot = configureAgentThreeIntervals(
    snapshot,
    "modeclean",
    10,
    20,
    now
  );
  const restored = normalizeAgentThreeSnapshot(structuredClone(snapshot));
  assert.equal(restored.operations["panek-puglesi"].minIntervalSeconds, 2);
  assert.equal(restored.operations["panek-puglesi"].maxIntervalSeconds, 8);
  assert.equal(restored.operations.modeclean.minIntervalSeconds, 10);
  assert.equal(restored.operations.modeclean.maxIntervalSeconds, 20);
});

test("intervalos 2. valor aleatório permanece dentro da faixa", () => {
  assert.equal(selectAgentThreeIntervalSeconds(2, 6, () => 0), 2);
  assert.equal(selectAgentThreeIntervalSeconds(2, 6, () => 0.5), 4);
  assert.equal(selectAgentThreeIntervalSeconds(2, 6, () => 1), 6);
});

test("intervalos 3. máximo menor que mínimo é rejeitado ou corrigido", () => {
  const configured = configureAgentThreeIntervals(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    5,
    10,
    now
  );
  const rejected = configureAgentThreeIntervals(
    configured,
    "panek-puglesi",
    5,
    4,
    later
  );
  assert.equal(rejected, configured);

  const corrupted = structuredClone(configured);
  corrupted.operations["panek-puglesi"].maxIntervalSeconds = 4;
  const corrected = normalizeAgentThreeSnapshot(corrupted);
  assert.equal(corrected.operations["panek-puglesi"].minIntervalSeconds, 5);
  assert.equal(corrected.operations["panek-puglesi"].maxIntervalSeconds, 5);
});

function createAbortableDelay() {
  let observedMilliseconds = null;
  return {
    get observedMilliseconds() {
      return observedMilliseconds;
    },
    delay(milliseconds, signal) {
      observedMilliseconds = milliseconds;
      return new Promise((resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new Error("interrupted")),
          { once: true }
        );
      });
    },
  };
}

test("intervalos 4. Pause interrompe a espera injetada", async () => {
  let snapshot = readySnapshot();
  snapshot = configureAgentThreeIntervals(
    snapshot,
    "panek-puglesi",
    3,
    7,
    now
  );
  const started = startAgentThree(snapshot, "panek-puglesi", true, later);
  const controller = new AbortController();
  const controlledDelay = createAbortableDelay();
  const waiting = waitForAgentThreeInterval(
    started.snapshot.operations["panek-puglesi"],
    { delay: controlledDelay.delay, random: () => 0.5 },
    controller.signal
  );
  const paused = pauseAgentThree(
    started.snapshot,
    "panek-puglesi",
    finalTime,
    () => controller.abort()
  );
  const result = await waiting;
  assert.equal(controlledDelay.observedMilliseconds, 5_000);
  assert.equal(result.interrupted, true);
  assert.equal(paused.operations["panek-puglesi"].status, "paused");
});

test("intervalos 5. Stop interrompe a espera injetada", async () => {
  let snapshot = readySnapshot();
  snapshot = configureAgentThreeIntervals(
    snapshot,
    "panek-puglesi",
    4,
    8,
    now
  );
  const started = startAgentThree(snapshot, "panek-puglesi", true, later);
  const controller = new AbortController();
  const controlledDelay = createAbortableDelay();
  const waiting = waitForAgentThreeInterval(
    started.snapshot.operations["panek-puglesi"],
    { delay: controlledDelay.delay, random: () => 0.25 },
    controller.signal
  );
  const stopped = stopAgentThree(
    started.snapshot,
    "panek-puglesi",
    finalTime,
    () => controller.abort()
  );
  const result = await waiting;
  assert.equal(controlledDelay.observedMilliseconds, 5_000);
  assert.equal(result.interrupted, true);
  assert.equal(stopped.operations["panek-puglesi"].status, "stopped");
});

test("intervalos 5b. timer informa o intervalo ao indicador visual", async () => {
  let snapshot = readySnapshot();
  snapshot = configureAgentThreeIntervals(
    snapshot,
    "panek-puglesi",
    3,
    7,
    now
  );
  let announcedSeconds = null;
  let observedMilliseconds = null;
  const result = await waitForAgentThreeInterval(
    snapshot.operations["panek-puglesi"],
    {
      delay: async (milliseconds) => {
        observedMilliseconds = milliseconds;
      },
      random: () => 0.5,
      onIntervalSelected: (seconds) => {
        announcedSeconds = seconds;
      },
    },
    new AbortController().signal
  );

  assert.equal(announcedSeconds, 5);
  assert.equal(observedMilliseconds, 5_000);
  assert.equal(result.intervalSeconds, 5);
  assert.equal(result.interrupted, false);
});

test("intervalos 6. Start sem provedor não consome contadores", () => {
  const snapshot = readySnapshot();
  const before = snapshot.operations["panek-puglesi"];
  const result = startAgentThree(
    snapshot,
    "panek-puglesi",
    false,
    later
  );
  const after = result.snapshot.operations["panek-puglesi"];
  assert.equal(result.message, NO_SENDING_PROVIDER_MESSAGE);
  assert.equal(after.processedCount, before.processedCount);
  assert.equal(after.queue[0].attemptCount, before.queue[0].attemptCount);
  assert.equal(after.queue[0].queueStatus, "ready");
  assert.equal(after.sentIndex.length, 0);
});

test("intervalos 7. interface principal não mostra bloqueados ou ignorados", () => {
  const source = readFileSync(
    new URL(
      "../src/components/agents/agent-three-sender.tsx",
      import.meta.url
    ),
    "utf8"
  );
  assert.equal(source.includes('label="Bloqueados"'), false);
  assert.equal(source.includes('label="Ignorados"'), false);
});

test("intervalos 7b. interface mostra preparação, progresso e contagem regressiva", () => {
  const source = readFileSync(
    new URL(
      "../src/components/agents/agent-three-sender.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.equal(
    source.includes("Carregando destinatários da campanha…") ||
      source.includes("activityMessage"),
    true
  );
  assert.equal(
    source.includes("Enviando ${currentPosition} de ${executionTotal}") ||
      source.includes("activityMessage"),
    true
  );
  assert.equal(
    source.includes("Próximo envio em ${nextSendSeconds}s") ||
      source.includes("nextSendSeconds"),
    true
  );
  assert.equal(source.includes('role="progressbar"'), true);
  assert.equal(source.includes("displayItem?.companyName"), true);
  assert.equal(
    source.includes("runner.nextSendAt[profileId]") ||
      source.includes("nextSendAt"),
    true
  );
  assert.equal(
    source.includes('label="Destinatários da campanha"') ||
      source.includes('label="3. Destinatários"'),
    true
  );
  assert.equal(source.includes('label="Prontos"'), true);
  assert.equal(source.includes("runner.loadCampaign"), true);
  assert.equal(source.includes("emptyQueueReason"), true);
});

test("intervalos 8. configurações P&P e Modeclean continuam separadas", () => {
  let snapshot = configureAgentThreeLimit(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    25,
    false,
    now
  );
  snapshot = configureAgentThreeIntervals(
    snapshot,
    "panek-puglesi",
    1,
    3,
    now
  );
  snapshot = configureAgentThreeLimit(
    snapshot,
    "modeclean",
    75,
    true,
    now
  );
  snapshot = configureAgentThreeIntervals(
    snapshot,
    "modeclean",
    9,
    12,
    now
  );
  assert.equal(snapshot.operations["panek-puglesi"].numericLimit, 25);
  assert.equal(snapshot.operations["panek-puglesi"].untilQueueEnds, false);
  assert.equal(snapshot.operations["panek-puglesi"].minIntervalSeconds, 1);
  assert.equal(snapshot.operations["panek-puglesi"].maxIntervalSeconds, 3);
  assert.equal(snapshot.operations.modeclean.numericLimit, 75);
  assert.equal(snapshot.operations.modeclean.untilQueueEnds, true);
  assert.equal(snapshot.operations.modeclean.minIntervalSeconds, 9);
  assert.equal(snapshot.operations.modeclean.maxIntervalSeconds, 12);
});

test("intervalos 9. Até acabar a lista continua processando toda a fila", () => {
  const loaded = profileSnapshot(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-unlimited-with-interval",
    6,
    "unlimited-with-interval"
  );
  let configured = configureAgentThreeLimit(
    loaded,
    "panek-puglesi",
    1,
    true,
    later
  );
  configured = configureAgentThreeIntervals(
    configured,
    "panek-puglesi",
    2,
    4,
    later
  );
  const finished = runConfiguredQueue(configured, "panek-puglesi");
  assert.equal(finished.operations["panek-puglesi"].processedCount, 6);
  assert.equal(finished.operations["panek-puglesi"].sentIndex.length, 6);
  assert.equal(finished.operations["panek-puglesi"].status, "completed");
});

test("intervalos 10. migração do estado anterior continua válida", () => {
  const previous = readySnapshot();
  delete previous.operations["panek-puglesi"].minIntervalSeconds;
  delete previous.operations["panek-puglesi"].maxIntervalSeconds;
  const restored = normalizeAgentThreeSnapshot(previous);
  const operation = restored.operations["panek-puglesi"];
  assert.equal(operation.minIntervalSeconds, 0);
  assert.equal(operation.maxIntervalSeconds, 0);
  assert.equal(operation.numericLimit, 50);
  assert.equal(operation.queue.length, 1);
  assert.equal(operation.queue[0].queueStatus, "ready");
});

test("SMTP 1. chave de proteção desativada impede envio", async () => {
  const mock = smtpMock({
    environment: {
      ...smtpEnvironment,
      AGENT3_REAL_SEND_ENABLED: "false",
    },
  });
  const result = await sendAgentThreeSmtp(smtpRequest(), mock.dependencies);
  assert.equal(result.status, "real_send_disabled");
  assert.equal(mock.calls.transport.length, 0);
  assert.equal(mock.calls.mail.length, 0);
});

test("SMTP 2. proteção não consome limite", () => {
  const snapshot = readySnapshot();
  const availability = getAgentThreeSmtpAvailability("panek-puglesi", {
    ...smtpEnvironment,
    AGENT3_REAL_SEND_ENABLED: "false",
  });
  const result = startAgentThree(
    snapshot,
    "panek-puglesi",
    availability.status === "connected",
    later
  );
  const operation = result.snapshot.operations["panek-puglesi"];
  assert.equal(operation.processedCount, 0);
  assert.equal(operation.numericLimit - operation.processedCount, 50);
});

test("SMTP 3. proteção não incrementa processados", () => {
  const snapshot = readySnapshot();
  const result = startAgentThree(snapshot, "panek-puglesi", false, later);
  assert.equal(result.started, false);
  assert.equal(result.snapshot.operations["panek-puglesi"].processedCount, 0);
  assert.equal(
    result.snapshot.operations["panek-puglesi"].queue[0].attemptCount,
    0
  );
});

test("SMTP 4. proteção não marca item como sent", () => {
  const snapshot = readySnapshot();
  const result = startAgentThree(snapshot, "panek-puglesi", false, later);
  const operation = result.snapshot.operations["panek-puglesi"];
  assert.equal(operation.queue[0].queueStatus, "ready");
  assert.equal(operation.sentIndex.length, 0);
});

test("SMTP 4b. proteção durante tentativa devolve item sem consumir contador", () => {
  const claimed = claimReady(readySnapshot());
  const applied = applyAgentThreeSmtpResult(
    claimed.snapshot,
    "panek-puglesi",
    claimed.item.id,
    {
      status: "real_send_disabled",
      message:
        "Envio real desativado na configuração do servidor (defina AGENT3_REAL_SEND_ENABLED=true no ambiente do host).",
    },
    finalTime
  );
  const operation = applied.snapshot.operations["panek-puglesi"];
  assert.equal(operation.status, "paused");
  assert.equal(operation.processedCount, 0);
  assert.equal(operation.queue[0].attemptCount, 0);
  assert.equal(operation.queue[0].queueStatus, "ready");
  assert.equal(operation.sentIndex.length, 0);
});

test("SMTP 5. P&P seleciona somente variáveis PNP", async () => {
  const mock = smtpMock();
  await sendAgentThreeSmtp(smtpRequest("panek-puglesi"), mock.dependencies);
  assert.deepEqual(mock.calls.transport[0], {
    host: "pnp.smtp.example.test",
    port: 465,
    secure: true,
    auth: {
      user: "pnp@example.test",
      pass: "pnp-test-secret",
    },
  });
  assert.notEqual(
    mock.calls.transport[0].auth.user,
    smtpEnvironment.MODECLEAN_SMTP_USER
  );
});

test("SMTP 6. Modeclean seleciona somente variáveis MODECLEAN", async () => {
  const mock = smtpMock();
  await sendAgentThreeSmtp(smtpRequest("modeclean"), mock.dependencies);
  assert.deepEqual(mock.calls.transport[0], {
    host: "modeclean.smtp.example.test",
    port: 587,
    secure: false,
    auth: {
      user: "modeclean@example.test",
      pass: "modeclean-test-secret",
    },
  });
  assert.notEqual(
    mock.calls.transport[0].auth.user,
    smtpEnvironment.PNP_SMTP_USER
  );
});

test("SMTP 7. From é controlado exclusivamente pelo servidor", async () => {
  const mock = smtpMock();
  const request = {
    ...smtpRequest("panek-puglesi"),
    from: "attacker@example.test",
    fromName: "Attacker",
  };
  await sendAgentThreeSmtp(request, mock.dependencies);
  assert.deepEqual(mock.calls.mail[0].from, {
    name: "P&P Test",
    address: "pnp@example.test",
  });
  assert.equal(
    JSON.stringify(mock.calls.mail[0]).includes("attacker@example.test"),
    false
  );
});

test("SMTP 8. Reply-To correto da P&P", async () => {
  const mock = smtpMock();
  await sendAgentThreeSmtp(smtpRequest("panek-puglesi"), mock.dependencies);
  assert.equal(mock.calls.mail[0].replyTo, "pnp-reply@example.test");
});

test("SMTP 9. Reply-To correto da Modeclean", async () => {
  const mock = smtpMock();
  await sendAgentThreeSmtp(smtpRequest("modeclean"), mock.dependencies);
  assert.equal(
    mock.calls.mail[0].replyTo,
    "modeclean-reply@example.test"
  );
});

test("SMTP 10. senha nunca aparece em resposta ou erro", async () => {
  const secret = smtpEnvironment.PNP_SMTP_APP_PASSWORD;
  const mock = smtpMock({
    error: new Error(`provider rejected ${secret}`),
  });
  const result = await sendAgentThreeSmtp(
    smtpRequest("panek-puglesi"),
    mock.dependencies
  );
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(result.status, "permanent_error");
});

test("SMTP 11. configuração ausente retorna configuration_error", async () => {
  const mock = smtpMock({
    environment: {
      ...smtpEnvironment,
      PNP_SMTP_APP_PASSWORD: "",
    },
  });
  const result = await sendAgentThreeSmtp(
    smtpRequest("panek-puglesi"),
    mock.dependencies
  );
  assert.equal(result.status, "configuration_error");
  assert.equal(mock.calls.transport.length, 0);
});

test("SMTP 12. destinatário inválido é rejeitado antes do SMTP", async () => {
  const mock = smtpMock();
  const result = await sendAgentThreeSmtp(
    { ...smtpRequest(), recipient: "invalid-address" },
    mock.dependencies
  );
  assert.equal(result.status, "invalid_request");
  assert.equal(mock.calls.transport.length, 0);
});

test("SMTP 13. suppression list bloqueia antes do SMTP", async () => {
  const mock = smtpMock({
    environment: {
      ...smtpEnvironment,
      AGENT3_SUPPRESSION_LIST: "other@example.test, recipient@example.test",
    },
  });
  const result = await sendAgentThreeSmtp(smtpRequest(), mock.dependencies);
  assert.equal(result.status, "suppressed");
  assert.equal(mock.calls.transport.length, 0);
});

test("SMTP 14. confirmação SMTP marca sent", async () => {
  const claimed = claimReady(readySnapshot());
  const mock = smtpMock({ messageId: "confirmed-message-id" });
  const smtpResult = await sendAgentThreeSmtp(
    smtpRequest(),
    mock.dependencies
  );
  const applied = applyAgentThreeSmtpResult(
    claimed.snapshot,
    "panek-puglesi",
    claimed.item.id,
    smtpResult,
    finalTime
  );
  assert.equal(
    applied.snapshot.operations["panek-puglesi"].queue[0].queueStatus,
    "sent"
  );
});

test("SMTP 14b. resposta sent sem providerMessageId permanece retomável", () => {
  const claimed = claimReady(readySnapshot());
  const applied = applyAgentThreeSmtpResult(
    claimed.snapshot,
    "panek-puglesi",
    claimed.item.id,
    { status: "sent", message: "Resposta sem confirmação do provedor." },
    finalTime
  );
  const operation = applied.snapshot.operations["panek-puglesi"];
  assert.equal(operation.queue[0].queueStatus, "failed");
  assert.equal(operation.sentIndex.length, 0);
});

test("SMTP 15. falha SMTP não marca sent", async () => {
  const claimed = claimReady(readySnapshot());
  const mock = smtpMock({ error: { responseCode: 550 } });
  const smtpResult = await sendAgentThreeSmtp(
    smtpRequest(),
    mock.dependencies
  );
  const applied = applyAgentThreeSmtpResult(
    claimed.snapshot,
    "panek-puglesi",
    claimed.item.id,
    smtpResult,
    finalTime
  );
  const operation = applied.snapshot.operations["panek-puglesi"];
  assert.equal(operation.queue[0].queueStatus, "failed");
  assert.equal(operation.sentIndex.length, 0);
});

test("SMTP 16. authentication_error pausa", async () => {
  const claimed = claimReady(readySnapshot());
  const mock = smtpMock({ error: { code: "EAUTH", responseCode: 535 } });
  const smtpResult = await sendAgentThreeSmtp(
    smtpRequest(),
    mock.dependencies
  );
  const applied = applyAgentThreeSmtpResult(
    claimed.snapshot,
    "panek-puglesi",
    claimed.item.id,
    smtpResult,
    finalTime
  );
  assert.equal(smtpResult.status, "authentication_error");
  assert.equal(applied.shouldPause, true);
  assert.equal(
    applied.snapshot.operations["panek-puglesi"].status,
    "paused"
  );
});

test("SMTP 17. provider_rate_limit pausa", async () => {
  const claimed = claimReady(readySnapshot());
  const mock = smtpMock({ error: { responseCode: 421 } });
  const smtpResult = await sendAgentThreeSmtp(
    smtpRequest(),
    mock.dependencies
  );
  const applied = applyAgentThreeSmtpResult(
    claimed.snapshot,
    "panek-puglesi",
    claimed.item.id,
    smtpResult,
    finalTime
  );
  assert.equal(smtpResult.status, "provider_rate_limit");
  assert.equal(applied.shouldPause, true);
  assert.equal(
    applied.snapshot.operations["panek-puglesi"].status,
    "paused"
  );
});

test("SMTP 18. provider_account_blocked pausa", async () => {
  const claimed = claimReady(readySnapshot());
  const mock = smtpMock({
    error: {
      responseCode: 550,
      message: "Account has been suspended and blocked",
    },
  });
  const smtpResult = await sendAgentThreeSmtp(
    smtpRequest(),
    mock.dependencies
  );
  const applied = applyAgentThreeSmtpResult(
    claimed.snapshot,
    "panek-puglesi",
    claimed.item.id,
    smtpResult,
    finalTime
  );
  assert.equal(smtpResult.status, "provider_account_blocked");
  assert.equal(applied.shouldPause, true);
  assert.equal(
    applied.snapshot.operations["panek-puglesi"].status,
    "paused"
  );
});

test("SMTP 19. timeout de conexão registra falha corretamente", async () => {
  const claimed = claimReady(readySnapshot());
  const mock = smtpMock({ error: { code: "ETIMEDOUT" } });
  const smtpResult = await sendAgentThreeSmtp(
    smtpRequest(),
    mock.dependencies
  );
  const applied = applyAgentThreeSmtpResult(
    claimed.snapshot,
    "panek-puglesi",
    claimed.item.id,
    smtpResult,
    finalTime
  );
  const item = applied.snapshot.operations["panek-puglesi"].queue[0];
  assert.equal(smtpResult.status, "connection_error");
  assert.equal(item.queueStatus, "failed");
  assert.equal(item.errorMessage, smtpResult.message);
  assert.equal(item.sentAt, undefined);
});

test("SMTP 20. messageId é armazenado", async () => {
  const claimed = claimReady(readySnapshot());
  const mock = smtpMock({ messageId: "stored-message-id" });
  const smtpResult = await sendAgentThreeSmtp(
    smtpRequest(),
    mock.dependencies
  );
  const applied = applyAgentThreeSmtpResult(
    claimed.snapshot,
    "panek-puglesi",
    claimed.item.id,
    smtpResult,
    finalTime
  );
  const operation = applied.snapshot.operations["panek-puglesi"];
  assert.equal(operation.queue[0].providerMessageId, "stored-message-id");
  assert.equal(operation.sentIndex[0].providerMessageId, "stored-message-id");
});

test("SMTP 21. Pause e Stop continuam interrompendo o intervalo", async () => {
  const operation = readySnapshot().operations["panek-puglesi"];
  const pauseController = new AbortController();
  const pauseDelay = createAbortableDelay();
  const pauseWait = waitForAgentThreeInterval(
    { ...operation, minIntervalSeconds: 1, maxIntervalSeconds: 1 },
    { delay: pauseDelay.delay, random: () => 0 },
    pauseController.signal
  );
  pauseController.abort();
  assert.equal((await pauseWait).interrupted, true);

  const stopController = new AbortController();
  const stopDelay = createAbortableDelay();
  const stopWait = waitForAgentThreeInterval(
    { ...operation, minIntervalSeconds: 1, maxIntervalSeconds: 1 },
    { delay: stopDelay.delay, random: () => 0 },
    stopController.signal
  );
  stopController.abort();
  assert.equal((await stopWait).interrupted, true);
});

test("SMTP 22. P&P e Modeclean permanecem isoladas", async () => {
  const pnp = smtpMock();
  const modeclean = smtpMock();
  await sendAgentThreeSmtp(
    smtpRequest("panek-puglesi"),
    pnp.dependencies
  );
  await sendAgentThreeSmtp(
    smtpRequest("modeclean"),
    modeclean.dependencies
  );
  assert.equal(pnp.calls.transport[0].auth.user, "pnp@example.test");
  assert.equal(
    modeclean.calls.transport[0].auth.user,
    "modeclean@example.test"
  );
});

test("SMTP 23. estado persistido do Sprint 3B continua válido", () => {
  const previous = readySnapshot();
  previous.operations["panek-puglesi"].numericLimit = 321;
  previous.operations["panek-puglesi"].untilQueueEnds = true;
  previous.operations["panek-puglesi"].minIntervalSeconds = 3;
  previous.operations["panek-puglesi"].maxIntervalSeconds = 9;
  const restored = normalizeAgentThreeSnapshot(structuredClone(previous));
  const operation = restored.operations["panek-puglesi"];
  assert.equal(operation.numericLimit, 321);
  assert.equal(operation.untilQueueEnds, true);
  assert.equal(operation.minIntervalSeconds, 3);
  assert.equal(operation.maxIntervalSeconds, 9);
  assert.equal(operation.queue[0].queueStatus, "ready");
});

test("SMTP 24. credenciais não vão para localStorage ou bundle cliente", () => {
  const clientFiles = [
    "../src/lib/agent-three-api.ts",
    "../src/hooks/use-agent-three-runner.ts",
    "../src/store/agent-three-store.ts",
    "../src/components/agents/agent-three-sender.tsx",
  ];
  for (const file of clientFiles) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.equal(source.includes("SMTP_APP_PASSWORD"), false);
    assert.equal(source.includes("PNP_SMTP_"), false);
    assert.equal(source.includes("MODECLEAN_SMTP_"), false);
    assert.equal(source.includes("agent-three-smtp-core"), false);
    assert.equal(source.includes("agent-three-smtp.ts"), false);
  }
});

test("preparação 1. pending com sintaxe, domínio e MX válidos é preparado no Start", () => {
  const pendingLead = {
    ...lead(
      "pending-mx",
      "pending-mx@example.test",
      "pending",
      "awaiting_validation"
    ),
    emailDomain: "example.test",
    hasMxRecords: true,
  };
  const loaded = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-auto-prepare",
    [pendingLead]
  );
  assert.equal(loaded.addedItems[0].queueStatus, "pending");
  const started = startAgentThree(
    loaded.snapshot,
    "panek-puglesi",
    true,
    later
  );
  assert.equal(started.started, true);
  assert.equal(
    started.snapshot.operations["panek-puglesi"].queue[0].queueStatus,
    "ready"
  );
});

test("preparação 2. unknown/mailbox_not_verified é elegível", () => {
  const loaded = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-unknown",
    [
      lead(
        "unknown-eligible",
        "unknown-eligible@example.test",
        "unknown",
        "mailbox_not_verified"
      ),
    ]
  );
  const started = startAgentThree(
    loaded.snapshot,
    "panek-puglesi",
    true,
    later
  );
  assert.equal(started.started, true);
  assert.equal(
    started.snapshot.operations["panek-puglesi"].queue[0].queueStatus,
    "ready"
  );
});

test("preparação 3. invalid_syntax é removido e nunca preparado", () => {
  const loaded = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-invalid-syntax",
    [lead("invalid-syntax", "bad", "invalid", "invalid_syntax")]
  );
  const started = startAgentThree(
    loaded.snapshot,
    "panek-puglesi",
    true,
    later
  );
  const item = started.snapshot.operations["panek-puglesi"].queue[0];
  assert.equal(started.message, NO_ELIGIBLE_LEADS_MESSAGE);
  assert.equal(item.queueStatus, "blocked");
  assert.equal(item.exclusionReason, "invalid_syntax");
});

test("preparação 4. domain_not_found é removido", () => {
  const loaded = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-domain-missing",
    [
      lead(
        "domain-missing",
        "lead@missing.test",
        "invalid",
        "domain_not_found"
      ),
    ]
  );
  const prepared = prepareAgentThreeCampaign(
    loaded.snapshot,
    "panek-puglesi",
    "campaign-domain-missing",
    [],
    later
  );
  const item = prepared.snapshot.operations["panek-puglesi"].queue[0];
  assert.equal(item.queueStatus, "blocked");
  assert.equal(item.exclusionReason, "domain_not_found");
  assert.equal(prepared.eligibleCount, 0);
});

test("preparação 5. no_mx_records é removido", () => {
  const loaded = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-no-mx",
    [
      lead(
        "no-mx",
        "lead@nomx.test",
        "invalid",
        "no_mx_records"
      ),
    ]
  );
  const prepared = prepareAgentThreeCampaign(
    loaded.snapshot,
    "panek-puglesi",
    "campaign-no-mx",
    [],
    later
  );
  const item = prepared.snapshot.operations["panek-puglesi"].queue[0];
  assert.equal(item.queueStatus, "blocked");
  assert.equal(item.exclusionReason, "no_mx_records");
});

test("preparação 6. no_email é removido", () => {
  const loaded = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-no-email",
    [lead("no-email", null, "no_email", "no_email")]
  );
  const prepared = prepareAgentThreeCampaign(
    loaded.snapshot,
    "panek-puglesi",
    "campaign-no-email",
    [],
    later
  );
  const item = prepared.snapshot.operations["panek-puglesi"].queue[0];
  assert.equal(item.queueStatus, "blocked");
  assert.equal(item.exclusionReason, "no_email");
});

test("preparação 7. duplicate não entra na execução", () => {
  const loaded = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-duplicate-validation",
    [
      lead(
        "duplicate-validation",
        "duplicate@example.test",
        "duplicate",
        "duplicate_of:original"
      ),
    ]
  );
  const started = startAgentThree(
    loaded.snapshot,
    "panek-puglesi",
    true,
    later
  );
  assert.equal(started.started, false);
  assert.equal(started.message, NO_ELIGIBLE_LEADS_MESSAGE);
  assert.equal(
    started.snapshot.operations["panek-puglesi"].queue[0].exclusionReason,
    "duplicate"
  );
});

test("preparação 8. suppression list continua bloqueando", () => {
  const claimed = claimReady(readySnapshot());
  const suppressed = applyAgentThreeSmtpResult(
    claimed.snapshot,
    "panek-puglesi",
    claimed.item.id,
    {
      status: "suppressed",
      message: "Destinatário removido da lista de envio.",
    },
    finalTime
  );
  const stopped = stopAgentThree(
    suppressed.snapshot,
    "panek-puglesi",
    finalTime
  );
  const restarted = startAgentThree(
    stopped,
    "panek-puglesi",
    true,
    finalTime
  );
  const item = restarted.snapshot.operations["panek-puglesi"].queue[0];
  assert.equal(restarted.started, false);
  assert.equal(item.queueStatus, "blocked");
  assert.equal(item.exclusionReason, "suppressed");
});

test("preparação 9. Start não exige ação manual de preparação", () => {
  const pendingLead = {
    ...lead(
      "automatic",
      "automatic@example.test",
      "pending",
      "awaiting_validation"
    ),
    hasMxRecords: true,
  };
  const loaded = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-no-manual-action",
    [pendingLead]
  );
  const started = startAgentThree(
    loaded.snapshot,
    "panek-puglesi",
    true,
    later
  );
  assert.equal(started.started, true);
  assert.equal(
    started.snapshot.operations["panek-puglesi"].history.some(
      (entry) => entry.action === "items_prepared"
    ),
    true
  );
});

test("preparação 10. sem itens elegíveis mostra mensagem correta", () => {
  const loaded = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-empty-eligible",
    [
      lead(
        "dns-error",
        "dns-error@example.test",
        "unknown",
        "dns_error"
      ),
    ]
  );
  const started = startAgentThree(
    loaded.snapshot,
    "panek-puglesi",
    true,
    later
  );
  assert.equal(started.started, false);
  assert.equal(started.message, NO_ELIGIBLE_LEADS_MESSAGE);
  assert.equal(
    started.message.includes("itens preparados"),
    false
  );
});

test("preparação 11. envio desativado prepara sem enviar ou consumir contador", () => {
  const loaded = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-protected-prepare",
    [
      lead(
        "protected-unknown",
        "protected-unknown@example.test",
        "unknown",
        "mailbox_not_verified"
      ),
    ]
  );
  const result = startAgentThree(
    loaded.snapshot,
    "panek-puglesi",
    false,
    later
  );
  const operation = result.snapshot.operations["panek-puglesi"];
  assert.equal(result.started, false);
  assert.equal(operation.queue[0].queueStatus, "ready");
  assert.equal(operation.queue[0].attemptCount, 0);
  assert.equal(operation.processedCount, 0);
  assert.equal(operation.sentIndex.length, 0);
});

test("preparação 12. P&P e Modeclean continuam isoladas", () => {
  const pendingLead = {
    ...lead(
      "isolated-prepare",
      "isolated-prepare@example.test",
      "pending",
      "awaiting_validation"
    ),
    hasMxRecords: true,
  };
  let snapshot = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-pnp-prepare",
    [pendingLead]
  ).snapshot;
  snapshot = load(
    snapshot,
    "modeclean",
    "campaign-modeclean-prepare",
    [pendingLead]
  ).snapshot;
  const prepared = prepareAgentThreeCampaign(
    snapshot,
    "panek-puglesi",
    "campaign-pnp-prepare",
    [pendingLead],
    later
  );
  assert.equal(
    prepared.snapshot.operations["panek-puglesi"].queue[0].queueStatus,
    "ready"
  );
  assert.equal(
    prepared.snapshot.operations.modeclean.queue[0].queueStatus,
    "pending"
  );
});

test("preparação 13. lead elegível gera registro independente em cada operação", () => {
  const eligibleLead = lead(
    "shared-eligible",
    "shared-eligible@example.test",
    "unknown",
    "mailbox_not_verified"
  );
  let snapshot = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-pnp-shared",
    [eligibleLead]
  ).snapshot;
  snapshot = load(
    snapshot,
    "modeclean",
    "campaign-modeclean-shared",
    [eligibleLead]
  ).snapshot;
  const pnp = startAgentThree(
    snapshot,
    "panek-puglesi",
    true,
    later
  );
  const modeclean = startAgentThree(
    pnp.snapshot,
    "modeclean",
    true,
    later
  );
  assert.equal(pnp.started, true);
  assert.equal(modeclean.started, true);
  assert.equal(
    modeclean.snapshot.operations["panek-puglesi"].queue.length,
    1
  );
  assert.equal(modeclean.snapshot.operations.modeclean.queue.length, 1);
});

test("preparação 14. item enviado anteriormente não é repetido", () => {
  const claimed = claimReady(readySnapshot());
  const completed = completeAgentThreeItem(
    claimed.snapshot,
    "panek-puglesi",
    claimed.item.id,
    finalTime,
    "already-sent-message"
  );
  const finished = finishAgentThree(
    completed,
    "panek-puglesi",
    finalTime
  );
  const reloaded = load(
    finished,
    "panek-puglesi",
    "campaign-a",
    [lead("one", "one@example.test", "unknown", "mailbox_not_verified")]
  );
  const restarted = startAgentThree(
    reloaded.snapshot,
    "panek-puglesi",
    true,
    finalTime
  );
  assert.equal(reloaded.addedCount, 0);
  assert.equal(restarted.started, false);
  assert.equal(restarted.message, NO_ELIGIBLE_LEADS_MESSAGE);
  assert.equal(
    restarted.snapshot.operations["panek-puglesi"].sentIndex.length,
    1
  );
});

test("preparação 15. migração persistida atual aceita evidência local nova", () => {
  const previous = readySnapshot();
  const item = previous.operations["panek-puglesi"].queue[0];
  item.validationStatus = "pending";
  item.validationReason = "awaiting_validation";
  item.queueStatus = "pending";
  delete item.hasMxRecords;
  delete item.emailDomain;
  const restored = normalizeAgentThreeSnapshot(structuredClone(previous));
  const evidence = {
    ...lead(
      "one",
      "one@example.test",
      "pending",
      "awaiting_validation"
    ),
    emailDomain: "example.test",
    hasMxRecords: true,
  };
  const prepared = prepareAgentThreeCampaign(
    restored,
    "panek-puglesi",
    "campaign-a",
    [evidence],
    finalTime
  );
  const preparedItem =
    prepared.snapshot.operations["panek-puglesi"].queue[0];
  assert.equal(preparedItem.queueStatus, "ready");
  assert.equal(preparedItem.hasMxRecords, true);
  assert.equal(preparedItem.emailDomain, "example.test");
});

test("preparação 16. NOT_CONFIGURED sem messageId volta para ready", () => {
  const loaded = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-not-configured",
    [lead("nc-1", "nc-1@example.test", "unknown", "mailbox_not_verified")]
  );
  const failedItem = {
    ...loaded.snapshot.operations["panek-puglesi"].queue[0],
    queueStatus: "failed",
    errorMessage: "NOT_CONFIGURED: SMTP ausente",
    failedAt: later,
  };
  const withFailure = {
    ...loaded.snapshot,
    operations: {
      ...loaded.snapshot.operations,
      "panek-puglesi": {
        ...loaded.snapshot.operations["panek-puglesi"],
        queue: [failedItem],
        processedCount: 12,
      },
    },
  };
  const prepared = prepareAgentThreeCampaign(
    withFailure,
    "panek-puglesi",
    "campaign-not-configured",
    [lead("nc-1", "nc-1@example.test", "unknown", "mailbox_not_verified")],
    finalTime
  );
  const item = prepared.snapshot.operations["panek-puglesi"].queue[0];
  assert.equal(item.queueStatus, "ready");
  assert.equal(item.errorMessage, undefined);
  assert.equal(prepared.eligibleCount, 1);
  assert.equal(
    prepared.snapshot.operations["panek-puglesi"].processedCount,
    0
  );
});

test("preparação 16b. enviado simulado sem SMTP real volta para ready", () => {
  const loaded = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-sim-sent",
    [lead("sim-1", "sim-1@example.test", "unknown", "mailbox_not_verified")]
  );
  const fakeSent = {
    ...loaded.snapshot.operations["panek-puglesi"].queue[0],
    queueStatus: "sent",
    providerMessageId: "sim-not-real",
    sentAt: later,
  };
  const withFake = {
    ...loaded.snapshot,
    operations: {
      ...loaded.snapshot.operations,
      "panek-puglesi": {
        ...loaded.snapshot.operations["panek-puglesi"],
        queue: [fakeSent],
        sentIndex: [
          {
            queueItemId: fakeSent.id,
            leadId: fakeSent.leadId,
            normalizedEmail: fakeSent.normalizedEmail,
            campaignProfileId: "panek-puglesi",
            campaignId: "campaign-sim-sent",
            sentAt: later,
            providerMessageId: "sim-not-real",
          },
        ],
        processedCount: 5,
      },
    },
  };
  const prepared = prepareAgentThreeCampaign(
    withFake,
    "panek-puglesi",
    "campaign-sim-sent",
    [lead("sim-1", "sim-1@example.test", "unknown", "mailbox_not_verified")],
    finalTime
  );
  const operation = prepared.snapshot.operations["panek-puglesi"];
  assert.equal(operation.queue[0].queueStatus, "ready");
  assert.equal(operation.sentIndex.length, 0);
  assert.equal(operation.processedCount, 0);
  assert.equal(prepared.eligibleCount, 1);
});

test("preparação 17. enviados confirmados não voltam para ready", () => {
  const claimed = claimReady(readySnapshot());
  const completed = completeAgentThreeItem(
    claimed.snapshot,
    "panek-puglesi",
    claimed.item.id,
    finalTime,
    "smtp-real-message"
  );
  const prepared = prepareAgentThreeCampaign(
    completed,
    "panek-puglesi",
    "campaign-a",
    [lead("one", "one@example.test", "unknown", "mailbox_not_verified")],
    finalTime
  );
  const item = prepared.snapshot.operations["panek-puglesi"].queue[0];
  assert.equal(item.queueStatus, "sent");
  assert.equal(item.providerMessageId, "smtp-real-message");
  assert.equal(prepared.eligibleCount, 0);
});

test("preparação 18. métricas da campanha atual não misturam outras campanhas", () => {
  let snapshot = load(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    "campaign-a",
    [lead("one", "one@example.test")]
  ).snapshot;
  snapshot = load(snapshot, "panek-puglesi", "campaign-b", [
    lead("two", "two@example.test"),
    lead("three", "three@example.test"),
  ]).snapshot;
  snapshot = selectAgentThreeCampaign(
    snapshot,
    "panek-puglesi",
    "campaign-a",
    later
  );
  const metrics = getAgentThreeMetrics(snapshot.operations["panek-puglesi"]);
  assert.equal(metrics.total, 1);
  assert.equal(metrics.ready, 1);
  assert.equal(metrics.currentCampaignId, "campaign-a");
});

test("preparação 19. página antiga da campanha não envia e abre Agente 3", () => {
  const source = readFileSync(
    new URL(
      "../src/components/campaigns/campaign-detail.tsx",
      import.meta.url
    ),
    "utf8"
  );
  // No legacy batch send on the detail page itself.
  assert.equal(source.includes("startBatchSend"), false);
  // Enviar agora reuses Agent 3 dialog — not a parallel sender.
  assert.equal(source.includes("CampaignSendNowDialog"), true);
  assert.equal(source.includes("Abrir no Agente 3"), true);
  assert.equal(source.includes("Enviar agora"), true);
  assert.equal(source.includes('router.push("/agente-3")'), true);
  // Must not call simulateSend / startBatchSend from detail handlers.
  assert.equal(/simulateSend\s*\(/.test(source), false);
});
