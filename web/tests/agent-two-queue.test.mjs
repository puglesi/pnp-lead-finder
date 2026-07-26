import assert from "node:assert/strict";
import test from "node:test";
import {
  INITIAL_AGENT_TWO_SNAPSHOT,
  buildAgentTwoQueue,
  claimNextAgentTwoItem,
  completeAgentTwoItem,
  failAgentTwoItem,
  normalizeAgentTwoSnapshot,
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
