import assert from "node:assert/strict";
import test from "node:test";
import {
  INITIAL_AGENT_TWO_SNAPSHOT,
  appendAgentTwoQueue,
  buildAgentTwoQueue,
  claimNextAgentTwoItem,
  completeAgentTwoItem,
  failAgentTwoItem,
  finishAgentTwo,
  getAgentTwoStats,
  migrateAgentTwoDnsErrors,
  normalizeAgentTwoSnapshot,
  pauseAgentTwo,
  queueItemToLeadUpdate,
  resumeAgentTwo,
  retryAgentTwoDnsErrors,
  retryAgentTwoItem,
  selectPersistedAgentTwoSnapshot,
  startAgentTwo,
  stopAgentTwo,
} from "../src/lib/agent-two-queue.ts";
import { createAgentTwoExecutionGuard } from "../src/lib/agent-two-execution.ts";
import { validateEmailLocally } from "../src/lib/email-validation.ts";
import { selectQuickSearchHydrationSnapshot } from "../src/lib/quick-search-hydration.ts";

const now = "2026-07-26T12:00:00.000Z";
const later = "2026-07-26T12:01:00.000Z";

function lead(id, email, validation = {}) {
  return {
    id,
    company: "Company " + id,
    website: "https://" + id + ".example",
    email,
    phone: "",
    address: "London",
    category: "Test",
    aiScore: 0,
    ...validation,
  };
}

function unknownResult(email, validatedAt = later) {
  return {
    status: "unknown",
    reason: "mailbox_not_verified",
    normalizedEmail: email,
    domain: email.split("@")[1],
    hasMxRecords: true,
    isRoleBasedEmail: false,
    provider: "local_dns",
    validatedAt,
  };
}

function snapshotFor(leads) {
  return {
    ...INITIAL_AGENT_TWO_SNAPSHOT,
    queue: buildAgentTwoQueue(leads, now),
  };
}

function numberedLeads(count) {
  return Array.from({ length: count }, (_, index) =>
    lead("lead-" + index, "person-" + index + "@example.test")
  );
}

test("Start disponibiliza somente um item por vez", () => {
  const started = startAgentTwo(snapshotFor(numberedLeads(3)));
  const first = claimNextAgentTwoItem(started, now);
  const concurrent = claimNextAgentTwoItem(first.snapshot, now);
  assert.equal(first.item?.leadId, "lead-0");
  assert.equal(concurrent.item, null);
  assert.equal(first.snapshot.queue.filter((item) => item.status === "validating").length, 1);
});

test("segundo Start e segundo runner são bloqueados", () => {
  const started = startAgentTwo(snapshotFor(numberedLeads(2)));
  assert.equal(startAgentTwo(started), started);
  const guard = createAgentTwoExecutionGuard();
  assert.equal(guard.begin(), true);
  assert.equal(guard.begin(), false);
  assert.equal(guard.isActive(), true);
  guard.end();
  assert.equal(guard.isActive(), false);
});

test("Pause impede o próximo, mas aceita conclusão do item em andamento", () => {
  const first = claimNextAgentTwoItem(
    startAgentTwo(snapshotFor(numberedLeads(2))),
    now
  );
  const paused = pauseAgentTwo(first.snapshot);
  const completed = completeAgentTwoItem(
    paused,
    first.item.id,
    unknownResult("person-0@example.test")
  );
  assert.equal(completed.status, "paused");
  assert.equal(completed.queue[0].status, "unknown");
  assert.equal(claimNextAgentTwoItem(completed, later).item, null);
});

test("Resume continua no primeiro incompleto sem repetir concluídos", () => {
  const first = claimNextAgentTwoItem(
    startAgentTwo(snapshotFor(numberedLeads(3))),
    now
  );
  const completed = completeAgentTwoItem(
    pauseAgentTwo(first.snapshot),
    first.item.id,
    unknownResult("person-0@example.test")
  );
  const resumed = resumeAgentTwo(completed);
  const next = claimNextAgentTwoItem(resumed, later);
  assert.equal(next.item?.leadId, "lead-1");
  assert.equal(next.snapshot.queue[0].status, "unknown");
});

test("Stop impede o próximo e preserva concluídos e pendentes", () => {
  const first = claimNextAgentTwoItem(
    startAgentTwo(snapshotFor(numberedLeads(3))),
    now
  );
  const completed = completeAgentTwoItem(
    first.snapshot,
    first.item.id,
    unknownResult("person-0@example.test")
  );
  const second = claimNextAgentTwoItem(completed, later);
  const stopped = stopAgentTwo(second.snapshot);
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.queue[0].status, "unknown");
  assert.equal(stopped.queue[1].status, "pending");
  assert.equal(stopped.queue[2].status, "pending");
  assert.equal(claimNextAgentTwoItem(stopped, later).item, null);
});

test("Stop permite Resume explícito sem recriar a fila", () => {
  const initial = snapshotFor(numberedLeads(2));
  const first = claimNextAgentTwoItem(startAgentTwo(initial), now);
  const stopped = stopAgentTwo(first.snapshot);
  const resumed = resumeAgentTwo(stopped);
  assert.equal(resumed.queue.length, initial.queue.length);
  assert.equal(claimNextAgentTwoItem(resumed, later).item?.leadId, "lead-0");
});

test("fila e resultados persistem após restauração", () => {
  const first = claimNextAgentTwoItem(
    startAgentTwo(snapshotFor(numberedLeads(2))),
    now
  );
  const completed = completeAgentTwoItem(
    first.snapshot,
    first.item.id,
    unknownResult("person-0@example.test")
  );
  const persisted = selectPersistedAgentTwoSnapshot(completed);
  const restored = normalizeAgentTwoSnapshot(structuredClone(persisted));
  assert.equal(restored.queue.length, 2);
  assert.equal(restored.queue[0].status, "unknown");
  assert.equal(restored.queue[0].reason, "mailbox_not_verified");
  assert.equal(restored.queue[1].status, "pending");
});

test("running e validating restaurados viram paused e pending", () => {
  const claimed = claimNextAgentTwoItem(
    startAgentTwo(snapshotFor(numberedLeads(1))),
    now
  );
  const restored = normalizeAgentTwoSnapshot(claimed.snapshot);
  assert.equal(restored.status, "paused");
  assert.equal(restored.currentItemId, null);
  assert.equal(restored.queue[0].status, "pending");
});

test("snapshot paused sem runner vivo recupera validating como pending", () => {
  const claimed = claimNextAgentTwoItem(
    startAgentTwo(snapshotFor(numberedLeads(1))),
    now
  );
  const restored = normalizeAgentTwoSnapshot(pauseAgentTwo(claimed.snapshot));
  assert.equal(restored.status, "paused");
  assert.equal(restored.currentItemId, null);
  assert.equal(restored.queue[0].status, "pending");
});

test("contadores cobrem exatamente o total da fila", () => {
  const queue = [
    { ...buildAgentTwoQueue([lead("p", "p@example.test")], now)[0] },
    { ...buildAgentTwoQueue([lead("v", "v@example.test")], now)[0], status: "valid", reason: "external" },
    { ...buildAgentTwoQueue([lead("i", "bad")], now)[0], status: "invalid", reason: "invalid_syntax" },
    { ...buildAgentTwoQueue([lead("d1", "same@example.test"), lead("d2", "same@example.test")], now)[1] },
    { ...buildAgentTwoQueue([lead("r", "r@example.test")], now)[0], status: "risky", reason: "future" },
    { ...buildAgentTwoQueue([lead("u", "u@example.test")], now)[0], status: "unknown", reason: "mailbox_not_verified" },
    { ...buildAgentTwoQueue([lead("n", null)], now)[0] },
  ];
  const stats = getAgentTwoStats(queue);
  const counted =
    stats.pending +
    stats.valid +
    stats.invalid +
    stats.duplicate +
    stats.risky +
    stats.unknown +
    stats.noEmail;
  assert.equal(stats.total, queue.length);
  assert.equal(counted, stats.total);
  assert.equal(stats.duplicate, 1);
  assert.equal(stats.pending, 1);
});

test("duplicado não entra novamente nem sobrescreve o primeiro resultado", () => {
  const started = startAgentTwo(snapshotFor([
    lead("first", "same@example.test"),
    lead("duplicate", " SAME@example.test "),
  ]));
  const claimed = claimNextAgentTwoItem(started, now);
  const completed = completeAgentTwoItem(
    claimed.snapshot,
    claimed.item.id,
    unknownResult("same@example.test")
  );
  assert.equal(claimNextAgentTwoItem(completed, later).item, null);
  assert.equal(completed.queue[0].status, "unknown");
  assert.equal(completed.queue[1].status, "duplicate");
  assert.equal(queueItemToLeadUpdate(completed.queue[1]).emailValidationStatus, "duplicate");
  assert.notEqual(completed.queue[0].leadId, completed.queue[1].leadId);
});

test("mesmo leadId aparece uma vez e normalizedEmail consome uma validação", () => {
  const sameLead = lead("same-id", "same@example.test");
  const queue = buildAgentTwoQueue([
    sameLead,
    { ...sameLead },
    lead("other-id", "SAME@example.test"),
  ], now);
  assert.equal(queue.filter((item) => item.leadId === "same-id").length, 1);
  assert.equal(queue.filter((item) => item.status === "pending").length, 1);
  assert.equal(queue.filter((item) => item.status === "duplicate").length, 1);
});

test("falha individual preserva anteriores, continua fila e permite retry", () => {
  const first = claimNextAgentTwoItem(
    startAgentTwo(snapshotFor(numberedLeads(3))),
    now
  );
  const completed = completeAgentTwoItem(
    first.snapshot,
    first.item.id,
    unknownResult("person-0@example.test")
  );
  const second = claimNextAgentTwoItem(completed, later);
  const failed = failAgentTwoItem(second.snapshot, second.item.id, "DNS indisponível", later);
  assert.equal(failed.queue[0].status, "unknown");
  assert.equal(failed.queue[1].reason, "validation_error");
  assert.equal(failed.queue[1].errorMessage, "DNS indisponível");
  assert.equal(claimNextAgentTwoItem(failed, later).item?.leadId, "lead-2");

  const single = claimNextAgentTwoItem(
    startAgentTwo(snapshotFor([lead("retry", "retry@example.test")])),
    now
  );
  const failedSingle = failAgentTwoItem(single.snapshot, single.item.id, "Falha técnica", later);
  const finished = finishAgentTwo(failedSingle);
  const retried = retryAgentTwoItem(finished, single.item.id);
  assert.equal(retried.status, "idle");
  assert.equal(retried.queue[0].status, "pending");
  assert.equal(retried.queue[0].errorMessage, undefined);
});

test("classificação local com sintaxe e MX permanece unknown e nunca valid", async () => {
  const mxCheck = async (domain) => ({
    domain,
    exists: true,
    hasMxRecords: true,
    reason: null,
  });
  const results = await Promise.all([
    validateEmailLocally("person@example.test", mxCheck),
    validateEmailLocally("info@example.test", mxCheck),
    validateEmailLocally("invalid", mxCheck),
    validateEmailLocally(null, mxCheck),
  ]);
  assert.equal(results[0].status, "unknown");
  assert.equal(results[0].reason, "mailbox_not_verified");
  assert.equal(results.some((result) => result.status === "valid"), false);
});

test("leads antigos sem campos novos permanecem compatíveis", () => {
  const legacy = lead("legacy", "legacy@example.test");
  const restored = normalizeAgentTwoSnapshot({
    ...INITIAL_AGENT_TWO_SNAPSHOT,
    queue: buildAgentTwoQueue([legacy], now),
  });
  assert.equal(restored.queue.length, 1);
  assert.equal(restored.queue[0].status, "pending");
});

test("nova amostra não duplica existentes nem inicia automaticamente", () => {
  const leads = numberedLeads(6);
  const first = appendAgentTwoQueue(INITIAL_AGENT_TWO_SNAPSHOT, leads, 3, now);
  const second = appendAgentTwoQueue(first.snapshot, leads, 6, later);
  assert.equal(second.snapshot.queue.length, 6);
  assert.equal(new Set(second.snapshot.queue.map((item) => item.leadId)).size, 6);
  assert.equal(second.snapshot.status, "idle");
});

test("primeiro render do Quick Search ignora valores persistidos", () => {
  const initial = { delayMs: 4000, effectiveMax: 200, effectiveWorkers: 1 };
  const persisted = { delayMs: 125, effectiveMax: 999, effectiveWorkers: 8 };
  assert.equal(
    selectQuickSearchHydrationSnapshot(false, persisted, initial),
    initial
  );
  assert.equal(
    selectQuickSearchHydrationSnapshot(true, persisted, initial),
    persisted
  );
});


function legacyDnsErrorSnapshot() {
  const item = buildAgentTwoQueue(
    [lead("dns", "person@real.example")],
    now
  )[0];
  return {
    ...INITIAL_AGENT_TWO_SNAPSHOT,
    status: "completed",
    queue: [
      {
        ...item,
        status: "invalid",
        reason: "dns_error",
        completedAt: later,
        errorMessage: "Falha DNS anterior",
      },
    ],
  };
}

test("dns_error nunca aumenta Inválidos e conta em Desconhecidos", () => {
  const migrated = migrateAgentTwoDnsErrors(legacyDnsErrorSnapshot());
  const stats = getAgentTwoStats(migrated.queue);
  assert.equal(stats.invalid, 0);
  assert.equal(stats.unknown, 1);
  assert.equal(stats.total, 1);
  assert.equal(stats.pending + stats.valid + stats.invalid + stats.duplicate + stats.risky + stats.unknown + stats.noEmail, stats.total);
});

test("migração restaura invalid/dns_error como unknown/dns_error", () => {
  const migrated = normalizeAgentTwoSnapshot(legacyDnsErrorSnapshot());
  assert.equal(migrated.queue[0].status, "unknown");
  assert.equal(migrated.queue[0].reason, "dns_error");
  assert.equal(migrated.queue[0].email, "person@real.example");
  const leadUpdate = queueItemToLeadUpdate(migrated.queue[0]);
  assert.equal(leadUpdate.emailValidationStatus, "unknown");
  assert.equal(leadUpdate.emailValidationReason, "dns_error");
});

test("migração de dns_error é idempotente", () => {
  const once = migrateAgentTwoDnsErrors(legacyDnsErrorSnapshot());
  const twice = migrateAgentTwoDnsErrors(once);
  assert.equal(twice, once);
  assert.deepEqual(twice, once);
});

test("Tentar novamente erros DNS altera somente esses itens para pending", () => {
  const dns = normalizeAgentTwoSnapshot(legacyDnsErrorSnapshot()).queue[0];
  const completed = {
    ...buildAgentTwoQueue([lead("ok", "ok@example.test")], now)[0],
    status: "unknown",
    reason: "mailbox_not_verified",
    completedAt: later,
  };
  const invalid = {
    ...buildAgentTwoQueue([lead("bad", "bad")], now)[0],
    status: "invalid",
    reason: "invalid_syntax",
    completedAt: later,
  };
  const snapshot = {
    ...INITIAL_AGENT_TWO_SNAPSHOT,
    status: "completed",
    queue: [dns, completed, invalid],
  };
  const result = retryAgentTwoDnsErrors(snapshot);
  assert.equal(result.retriedCount, 1);
  assert.equal(result.snapshot.status, "idle");
  assert.equal(result.snapshot.queue[0].status, "pending");
  assert.equal(result.snapshot.queue[0].reason, "pending");
  assert.equal(result.snapshot.queue[1], completed);
  assert.equal(result.snapshot.queue[2], invalid);
});

test("nova tentativa DNS não duplica itens nem inicia o agente", () => {
  const snapshot = normalizeAgentTwoSnapshot(legacyDnsErrorSnapshot());
  const first = retryAgentTwoDnsErrors(snapshot);
  const second = retryAgentTwoDnsErrors(first.snapshot);
  assert.equal(first.snapshot.queue.length, snapshot.queue.length);
  assert.equal(new Set(first.snapshot.queue.map((item) => item.id)).size, snapshot.queue.length);
  assert.equal(first.snapshot.status, "idle");
  assert.equal(second.retriedCount, 0);
  assert.equal(second.snapshot, first.snapshot);
});

test("resultados concluídos sem erro DNS permanecem intactos", () => {
  const completed = completeAgentTwoItem(
    snapshotFor([lead("complete", "complete@example.test")]),
    buildAgentTwoQueue([lead("complete", "complete@example.test")], now)[0].id,
    unknownResult("complete@example.test")
  );
  const retried = retryAgentTwoDnsErrors(completed);
  assert.equal(retried.retriedCount, 0);
  assert.equal(retried.snapshot, completed);
  assert.equal(retried.snapshot.queue[0].reason, "mailbox_not_verified");
});


test("dns_error individual é salvo e não interrompe a fila", () => {
  const first = claimNextAgentTwoItem(
    startAgentTwo(snapshotFor(numberedLeads(2))),
    now
  );
  const completedWithDnsError = completeAgentTwoItem(first.snapshot, first.item.id, {
    status: "unknown",
    reason: "dns_error",
    normalizedEmail: "person-0@example.test",
    domain: "example.test",
    hasMxRecords: null,
    isRoleBasedEmail: false,
    provider: "local_dns",
    validatedAt: later,
    errorMessage: "Falha técnica na resolução DNS. Tente novamente.",
  });
  assert.equal(completedWithDnsError.queue[0].status, "unknown");
  assert.equal(completedWithDnsError.queue[0].reason, "dns_error");
  assert.equal(
    claimNextAgentTwoItem(completedWithDnsError, later).item?.leadId,
    "lead-1"
  );
});


test("fluxo final determinístico Start Pause Restore Resume Stop Restore Resume conclusão", async () => {
  let state = snapshotFor(numberedLeads(10));
  const executionGuard = createAgentTwoExecutionGuard();
  const validationCalls = [];
  const waitingValidations = [];
  const savedLeadResults = new Map();

  function assertCountersAreConsistent(snapshot, stage) {
    const stats = getAgentTwoStats(snapshot.queue);
    const counted =
      stats.pending +
      stats.valid +
      stats.invalid +
      stats.duplicate +
      stats.risky +
      stats.unknown +
      stats.noEmail;
    assert.equal(counted, stats.total, stage);
    assert.equal(stats.total, 10, stage);
    return stats;
  }

  async function waitUntil(predicate, message) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (predicate()) return;
      await Promise.resolve();
    }
    assert.fail(message);
  }

  const controlledValidator = {
    validate(item) {
      validationCalls.push({
        leadId: item.leadId,
        normalizedEmail: item.normalizedEmail,
      });
      return new Promise((resolve) => {
        waitingValidations.push({ item, resolve });
      });
    },
    releaseNext() {
      const pendingValidation = waitingValidations.shift();
      assert.ok(pendingValidation, "deve existir uma validação aguardando liberação");
      pendingValidation.resolve(
        unknownResult(pendingValidation.item.normalizedEmail)
      );
    },
  };

  async function runControlledQueue() {
    if (!executionGuard.begin()) return false;
    try {
      while (state.status === "running") {
        const claimed = claimNextAgentTwoItem(state, later);
        state = claimed.snapshot;
        assertCountersAreConsistent(state, "durante claim");
        if (!claimed.item) {
          state = finishAgentTwo(state);
          break;
        }

        const result = await controlledValidator.validate(claimed.item);
        savedLeadResults.set(claimed.item.leadId, result);
        state = completeAgentTwoItem(state, claimed.item.id, result);
        assertCountersAreConsistent(state, "após conclusão individual");
      }
    } finally {
      executionGuard.end();
    }
    return true;
  }

  // START: apenas o primeiro item entra em validação e o segundo runner é recusado.
  state = startAgentTwo(state);
  const firstRun = runControlledQueue();
  await waitUntil(
    () => validationCalls.length === 1,
    "o primeiro item deveria iniciar"
  );
  assert.equal(state.status, "running");
  assert.equal(state.queue.filter((item) => item.status === "validating").length, 1);
  assert.equal(state.queue.filter((item) => item.status === "pending").length, 9);
  assert.equal(await runControlledQueue(), false);
  assert.equal(validationCalls.length, 1);
  assertCountersAreConsistent(state, "Start");

  // PAUSE: o item atual termina, é salvo, e nenhum próximo item começa.
  state = pauseAgentTwo(state);
  assert.equal(state.status, "paused");
  assertCountersAreConsistent(state, "Pause solicitado");
  controlledValidator.releaseNext();
  await firstRun;
  assert.equal(state.status, "paused");
  assert.equal(savedLeadResults.has("lead-0"), true);
  assert.equal(state.queue[0].status, "unknown");
  assert.equal(state.queue[0].reason, "mailbox_not_verified");
  assert.equal(state.queue.filter((item) => item.status === "pending").length, 9);
  assert.equal(validationCalls.length, 1);
  const pausedStats = assertCountersAreConsistent(state, "Pause concluído");

  // RESTAURAÇÃO APÓS PAUSE: progresso igual e nenhum reinício automático.
  const pausedPersisted = JSON.stringify(selectPersistedAgentTwoSnapshot(state));
  state = normalizeAgentTwoSnapshot(JSON.parse(pausedPersisted));
  assert.equal(state.status, "paused");
  assert.equal(state.currentItemId, null);
  assert.equal(state.queue[0].status, "unknown");
  assert.deepEqual(getAgentTwoStats(state.queue), pausedStats);
  await Promise.resolve();
  assert.equal(validationCalls.length, 1);
  assertCountersAreConsistent(state, "restauração após Pause");

  // RESUME: continua no primeiro pending e conclui dois antes do Stop.
  state = resumeAgentTwo(state);
  const resumedRun = runControlledQueue();
  await waitUntil(
    () => validationCalls.length === 2,
    "Resume deveria iniciar o primeiro pending"
  );
  assert.equal(validationCalls[1].leadId, "lead-1");
  assert.equal(validationCalls.some((call) => call.leadId === "lead-0" && call !== validationCalls[0]), false);
  controlledValidator.releaseNext();
  await waitUntil(
    () => validationCalls.length === 3,
    "o segundo resultado após Resume deveria iniciar"
  );
  controlledValidator.releaseNext();
  await waitUntil(
    () => validationCalls.length === 4,
    "o item usado para Stop deveria estar em andamento"
  );
  assert.equal(savedLeadResults.size, 3);
  assertCountersAreConsistent(state, "Resume antes do Stop");

  // STOP: o item em andamento termina e nenhum próximo é iniciado.
  state = stopAgentTwo(state);
  assert.equal(state.status, "stopped");
  controlledValidator.releaseNext();
  await resumedRun;
  assert.equal(state.status, "stopped");
  assert.equal(savedLeadResults.size, 4);
  assert.equal(validationCalls.length, 4);
  assert.equal(state.queue.filter((item) => item.status === "pending").length, 6);
  assert.equal(state.queue.length, 10);
  assertCountersAreConsistent(state, "Stop concluído");

  // RESTAURAÇÃO APÓS STOP: nada concluído volta para pending e não há duplicação.
  const stoppedStatuses = state.queue.map((item) => item.status);
  const stoppedPersisted = JSON.stringify(selectPersistedAgentTwoSnapshot(state));
  state = normalizeAgentTwoSnapshot(JSON.parse(stoppedPersisted));
  assert.equal(state.status, "stopped");
  assert.equal(state.currentItemId, null);
  assert.deepEqual(state.queue.map((item) => item.status), stoppedStatuses);
  assert.equal(new Set(state.queue.map((item) => item.id)).size, 10);
  assert.equal(new Set(state.queue.map((item) => item.leadId)).size, 10);
  assert.equal(validationCalls.length, 4);
  assertCountersAreConsistent(state, "restauração após Stop");

  // RESUME FINAL: todos os restantes são liberados manualmente e a fila conclui.
  state = resumeAgentTwo(state);
  const finalRun = runControlledQueue();
  for (let expectedCalls = 5; expectedCalls <= 10; expectedCalls += 1) {
    await waitUntil(
      () => validationCalls.length === expectedCalls,
      "deveria iniciar a validação " + expectedCalls
    );
    controlledValidator.releaseNext();
  }
  await finalRun;

  const finalStats = assertCountersAreConsistent(state, "conclusão final");
  assert.equal(state.status, "completed");
  assert.equal(state.currentItemId, null);
  assert.equal(finalStats.pending, 0);
  assert.equal(finalStats.unknown, 10);
  assert.equal(finalStats.valid, 0);
  assert.equal(savedLeadResults.size, 10);
  assert.equal(state.queue.every((item) => item.status === "unknown"), true);
  assert.equal(
    state.queue.every((item) => item.reason === "mailbox_not_verified"),
    true
  );

  const processedLeadIds = validationCalls.map((call) => call.leadId);
  const processedEmails = validationCalls.map((call) => call.normalizedEmail);
  assert.equal(new Set(processedLeadIds).size, processedLeadIds.length);
  assert.equal(new Set(processedEmails).size, processedEmails.length);
  assert.equal(validationCalls.length, 10);
});
