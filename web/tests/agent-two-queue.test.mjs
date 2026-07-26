import assert from "node:assert/strict";
import test from "node:test";
import {
  INITIAL_AGENT_TWO_SNAPSHOT,
  appendAgentTwoQueue,
  appendAllAgentTwoQueue,
  buildAgentTwoQueue,
  claimNextAgentTwoItem,
  completeAgentTwoItem,
  failAgentTwoItem,
  normalizeAgentTwoSnapshot,
  parseAgentTwoLoadQuantity,
  pauseAgentTwo,
  resumeAgentTwo,
  startAgentTwo,
  stopAgentTwo,
} from "../src/lib/agent-two-queue.ts";

const now = "2026-07-26T10:00:00.000Z";
const later = "2026-07-26T10:01:00.000Z";

function lead(id, email) {
  return {
    id,
    company: "Company " + id,
    website: "https://" + id + ".example",
    email,
    phone: "",
    address: "London",
    category: "Test",
    aiScore: 0,
  };
}

function unknownResult(email) {
  return {
    status: "unknown",
    reason: "mailbox_not_verified",
    normalizedEmail: email,
    domain: email.split("@")[1],
    hasMxRecords: true,
    isRoleBasedEmail: false,
    provider: "local_dns",
    validatedAt: later,
  };
}

function snapshotFor(leads) {
  return {
    ...INITIAL_AGENT_TWO_SNAPSHOT,
    queue: buildAgentTwoQueue(leads, now),
  };
}

test("e-mail duplicado normalizado é identificado", () => {
  const snapshot = snapshotFor([
    lead("one", "Person@Example.test"),
    lead("two", " person@example.test "),
  ]);
  assert.equal(snapshot.queue[0].status, "pending");
  assert.equal(snapshot.queue[1].status, "duplicate");
  assert.equal(snapshot.queue[1].reason, "duplicate_of:one");
});

test("somente o primeiro de vários duplicados entra na validação", () => {
  const started = startAgentTwo(snapshotFor([
    lead("one", "same@example.test"),
    lead("two", "SAME@example.test"),
    lead("three", " same@example.test "),
  ]));
  const first = claimNextAgentTwoItem(started, now);
  assert.equal(first.item?.leadId, "one");
  const completed = completeAgentTwoItem(
    first.snapshot,
    first.item.id,
    unknownResult("same@example.test")
  );
  const next = claimNextAgentTwoItem(completed, later);
  assert.equal(next.item, null);
  assert.equal(completed.queue.filter((item) => item.status === "duplicate").length, 2);
});

test("Pause impede o início do próximo item", () => {
  const started = startAgentTwo(snapshotFor([
    lead("one", "one@example.test"),
    lead("two", "two@example.test"),
  ]));
  const first = claimNextAgentTwoItem(started, now);
  const paused = pauseAgentTwo(first.snapshot);
  const completed = completeAgentTwoItem(
    paused,
    first.item.id,
    unknownResult("one@example.test")
  );
  assert.equal(completed.status, "paused");
  assert.equal(claimNextAgentTwoItem(completed, later).item, null);
});

test("Resume continua no primeiro item incompleto", () => {
  const base = snapshotFor([
    lead("one", "one@example.test"),
    lead("two", "two@example.test"),
  ]);
  const first = claimNextAgentTwoItem(startAgentTwo(base), now);
  const completed = completeAgentTwoItem(
    pauseAgentTwo(first.snapshot),
    first.item.id,
    unknownResult("one@example.test")
  );
  const resumed = resumeAgentTwo(completed);
  const next = claimNextAgentTwoItem(resumed, later);
  assert.equal(next.item?.leadId, "two");
});

test("Stop preserva resultados concluídos e itens restantes", () => {
  const first = claimNextAgentTwoItem(
    startAgentTwo(snapshotFor([
      lead("one", "one@example.test"),
      lead("two", "two@example.test"),
    ])),
    now
  );
  const completed = completeAgentTwoItem(
    first.snapshot,
    first.item.id,
    unknownResult("one@example.test")
  );
  const stopped = stopAgentTwo(completed);
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.queue[0].status, "unknown");
  assert.equal(stopped.queue[1].status, "pending");
});

test("snapshot running restaurado vira paused e não reinicia automaticamente", () => {
  const claimed = claimNextAgentTwoItem(
    startAgentTwo(snapshotFor([lead("one", "one@example.test")])),
    now
  );
  const restored = normalizeAgentTwoSnapshot(claimed.snapshot);
  assert.equal(restored.status, "paused");
  assert.equal(restored.currentItemId, null);
  assert.equal(restored.queue[0].status, "pending");
});

test("falha individual não apaga resultados anteriores", () => {
  const first = claimNextAgentTwoItem(
    startAgentTwo(snapshotFor([
      lead("one", "one@example.test"),
      lead("two", "two@example.test"),
    ])),
    now
  );
  const completed = completeAgentTwoItem(
    first.snapshot,
    first.item.id,
    unknownResult("one@example.test")
  );
  const second = claimNextAgentTwoItem(completed, later);
  const failed = failAgentTwoItem(second.snapshot, second.item.id, "DNS unavailable", later);
  assert.equal(failed.queue[0].status, "unknown");
  assert.equal(failed.queue[0].reason, "mailbox_not_verified");
  assert.equal(failed.queue[1].status, "unknown");
  assert.equal(failed.queue[1].reason, "validation_error");
  assert.equal(failed.queue[1].errorMessage, "DNS unavailable");
});

test("leads antigos sem campos de validação continuam compatíveis", () => {
  const legacyLead = lead("legacy", "legacy@example.test");
  assert.equal("emailValidationStatus" in legacyLead, false);
  const queue = buildAgentTwoQueue([legacyLead], now);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].status, "pending");
});

function numberedLeads(count) {
  return Array.from({ length: count }, (_, index) =>
    lead("lead-" + index, "person-" + index + "@example.test")
  );
}

test("limite 10 carrega no máximo 10 itens", () => {
  const result = appendAgentTwoQueue(
    INITIAL_AGENT_TWO_SNAPSHOT,
    numberedLeads(25),
    10,
    now
  );
  assert.equal(result.addedItems.length, 10);
  assert.equal(result.snapshot.queue.length, 10);
});

test("limite maior que os elegíveis carrega somente os disponíveis", () => {
  const result = appendAgentTwoQueue(
    INITIAL_AGENT_TWO_SNAPSHOT,
    numberedLeads(3),
    100,
    now
  );
  assert.equal(result.eligibleCount, 3);
  assert.equal(result.addedItems.length, 3);
});

test("itens já presentes não são duplicados em cargas seguintes", () => {
  const leads = numberedLeads(5);
  const first = appendAgentTwoQueue(
    INITIAL_AGENT_TWO_SNAPSHOT,
    leads,
    2,
    now
  );
  const second = appendAgentTwoQueue(first.snapshot, leads, 10, later);
  assert.equal(second.addedItems.length, 3);
  assert.equal(second.snapshot.queue.length, 5);
  assert.equal(new Set(second.snapshot.queue.map((item) => item.leadId)).size, 5);
});

test("carregar amostra não inicia o agente", () => {
  const result = appendAgentTwoQueue(
    INITIAL_AGENT_TWO_SNAPSHOT,
    numberedLeads(10),
    10,
    now
  );
  assert.equal(result.snapshot.status, "idle");
  assert.equal(result.snapshot.currentItemId, null);
});

test("carregar todos exige confirmação com a quantidade elegível", () => {
  let confirmationCount = 0;
  let informedQuantity = 0;
  appendAllAgentTwoQueue(
    INITIAL_AGENT_TWO_SNAPSHOT,
    numberedLeads(12),
    now,
    (quantity) => {
      confirmationCount += 1;
      informedQuantity = quantity;
      return false;
    }
  );
  assert.equal(confirmationCount, 1);
  assert.equal(informedQuantity, 12);
});

test("cancelar a confirmação não altera a fila", () => {
  const initial = appendAgentTwoQueue(
    INITIAL_AGENT_TWO_SNAPSHOT,
    numberedLeads(4),
    1,
    now
  ).snapshot;
  const result = appendAllAgentTwoQueue(
    initial,
    numberedLeads(4),
    later,
    () => false
  );
  assert.equal(result.confirmed, false);
  assert.equal(result.snapshot, initial);
  assert.equal(result.addedItems.length, 0);
  assert.equal(result.snapshot.queue.length, 1);
});

test("confirmar carrega todos os elegíveis ausentes", () => {
  const leads = numberedLeads(7);
  const initial = appendAgentTwoQueue(
    INITIAL_AGENT_TWO_SNAPSHOT,
    leads,
    2,
    now
  ).snapshot;
  const result = appendAllAgentTwoQueue(initial, leads, later, () => true);
  assert.equal(result.confirmed, true);
  assert.equal(result.eligibleCount, 5);
  assert.equal(result.addedItems.length, 5);
  assert.equal(result.snapshot.queue.length, 7);
});

test("quantidade zero, negativa, decimal ou inválida é rejeitada", () => {
  for (const value of ["0", "-1", "1.5", "abc", ""]) {
    const result = parseAgentTwoLoadQuantity(value, 10);
    assert.equal(result.quantity, null, value);
    assert.ok(result.error, value);
  }
  const aboveMaximum = parseAgentTwoLoadQuantity("11", 10);
  assert.equal(aboveMaximum.quantity, null);
  assert.ok(aboveMaximum.error);
  assert.deepEqual(parseAgentTwoLoadQuantity("10", 10), {
    quantity: 10,
    error: null,
  });
});
