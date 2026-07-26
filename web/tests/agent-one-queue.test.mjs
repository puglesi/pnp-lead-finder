import assert from "node:assert/strict";
import test from "node:test";
import {
  INITIAL_AGENT_ONE_SNAPSHOT,
  addAgentOneSector,
  claimNextAgentOneSector,
  completeAgentOneSector,
  failAgentOneSector,
  normalizeAgentOneSnapshot,
  pauseAgentOne,
  resumeAgentOne,
  selectPersistedAgentOneSnapshot,
  startAgentOne,
  stopAgentOne,
} from "../src/lib/agent-one-queue.ts";

const FIRST_INPUT = {
  sector: "Contabilidade",
  location: "London",
  targetLeadCount: 25,
};
const SECOND_INPUT = {
  sector: "Construção",
  location: "Manchester",
  targetLeadCount: 10,
};
const CREATED_AT = "2026-07-26T10:00:00.000Z";
const STARTED_AT = "2026-07-26T10:01:00.000Z";
const COMPLETED_AT = "2026-07-26T10:02:00.000Z";

function withTwoSectors() {
  const first = addAgentOneSector(
    INITIAL_AGENT_ONE_SNAPSHOT,
    FIRST_INPUT,
    "sector-1",
    CREATED_AT
  );
  return addAgentOneSector(
    first,
    SECOND_INPUT,
    "sector-2",
    CREATED_AT
  );
}

test("adiciona setores à fila com os dados mínimos", () => {
  const snapshot = addAgentOneSector(
    INITIAL_AGENT_ONE_SNAPSHOT,
    FIRST_INPUT,
    "sector-1",
    CREATED_AT
  );

  assert.equal(snapshot.queue.length, 1);
  assert.deepEqual(snapshot.queue[0], {
    id: "sector-1",
    ...FIRST_INPUT,
    status: "pending",
    foundLeadCount: 0,
    createdAt: CREATED_AT,
  });
});

test("inicia uma fila que possui trabalho pendente", () => {
  const snapshot = startAgentOne(withTwoSectors());

  assert.equal(snapshot.status, "running");
  assert.equal(snapshot.currentSectorId, null);
});

test("processa somente um setor por vez", () => {
  const running = startAgentOne(withTwoSectors());
  const firstClaim = claimNextAgentOneSector(running, STARTED_AT);
  const secondClaim = claimNextAgentOneSector(firstClaim.snapshot, STARTED_AT);

  assert.equal(firstClaim.sector?.id, "sector-1");
  assert.equal(secondClaim.sector, null);
  assert.equal(
    firstClaim.snapshot.queue.filter((item) => item.status === "running").length,
    1
  );
});

test("conclui o setor atual e avança ao próximo", () => {
  const running = startAgentOne(withTwoSectors());
  const firstClaim = claimNextAgentOneSector(running, STARTED_AT);
  const afterComplete = completeAgentOneSector(
    firstClaim.snapshot,
    "sector-1",
    18,
    COMPLETED_AT
  );
  const secondClaim = claimNextAgentOneSector(afterComplete, STARTED_AT);

  assert.equal(afterComplete.queue[0].status, "completed");
  assert.equal(afterComplete.queue[0].foundLeadCount, 18);
  assert.equal(secondClaim.sector?.id, "sector-2");
});

test("pausa a execução e o setor atual", () => {
  const running = startAgentOne(withTwoSectors());
  const claimed = claimNextAgentOneSector(running, STARTED_AT);
  const paused = pauseAgentOne(claimed.snapshot);

  assert.equal(paused.status, "paused");
  assert.equal(paused.queue[0].status, "paused");
  assert.equal(paused.currentSectorId, "sector-1");
});

test("retoma pelo primeiro setor incompleto", () => {
  const running = startAgentOne(withTwoSectors());
  const claimed = claimNextAgentOneSector(running, STARTED_AT);
  const paused = pauseAgentOne(claimed.snapshot);
  const resumed = resumeAgentOne(paused);
  const reclaimed = claimNextAgentOneSector(resumed, STARTED_AT);

  assert.equal(resumed.status, "running");
  assert.equal(reclaimed.sector?.id, "sector-1");
});

test("para com segurança e mantém o trabalho já concluído", () => {
  const running = startAgentOne(withTwoSectors());
  const firstClaim = claimNextAgentOneSector(running, STARTED_AT);
  const firstComplete = completeAgentOneSector(
    firstClaim.snapshot,
    "sector-1",
    12,
    COMPLETED_AT
  );
  const secondClaim = claimNextAgentOneSector(firstComplete, STARTED_AT);
  const stopped = stopAgentOne(secondClaim.snapshot);

  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.queue[0].foundLeadCount, 12);
  assert.equal(stopped.queue[0].status, "completed");
  assert.equal(stopped.queue[1].status, "paused");
});

test("persiste e restaura a fila", () => {
  const snapshot = withTwoSectors();
  const persisted = selectPersistedAgentOneSnapshot(snapshot);
  const restored = normalizeAgentOneSnapshot(
    JSON.parse(JSON.stringify(persisted))
  );

  assert.deepEqual(restored.queue, snapshot.queue);
  assert.equal(restored.status, snapshot.status);
});

test("restaura running como paused após recarregar", () => {
  const running = startAgentOne(withTwoSectors());
  const claimed = claimNextAgentOneSector(running, STARTED_AT);
  const restored = normalizeAgentOneSnapshot(
    JSON.parse(
      JSON.stringify(selectPersistedAgentOneSnapshot(claimed.snapshot))
    )
  );

  assert.equal(restored.status, "paused");
  assert.equal(restored.queue[0].status, "paused");
  assert.equal(restored.currentSectorId, "sector-1");
});

test("registra erro sem apagar progresso anterior", () => {
  const running = startAgentOne(withTwoSectors());
  const firstClaim = claimNextAgentOneSector(running, STARTED_AT);
  const firstComplete = completeAgentOneSector(
    firstClaim.snapshot,
    "sector-1",
    20,
    COMPLETED_AT
  );
  const secondClaim = claimNextAgentOneSector(firstComplete, STARTED_AT);
  const failed = failAgentOneSector(
    secondClaim.snapshot,
    "sector-2",
    "Falha real do provedor",
    COMPLETED_AT
  );

  assert.equal(failed.queue[0].status, "completed");
  assert.equal(failed.queue[0].foundLeadCount, 20);
  assert.equal(failed.queue[1].status, "error");
  assert.equal(failed.queue[1].errorMessage, "Falha real do provedor");
});
