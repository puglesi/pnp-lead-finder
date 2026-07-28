import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  NO_SENDING_PROVIDER_MESSAGE,
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
