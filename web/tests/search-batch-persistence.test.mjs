import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createInitialPersistedSearchBatch,
  createMemorySearchBatchRepository,
  getResumableSectors,
  SEARCH_BATCH_DB_NAME,
  SEARCH_BATCH_STORE,
  SEARCH_LEAD_STORE,
} from "../src/lib/search/batch-repository.ts";
import { getClearUiPreserveContract } from "../src/lib/clear-ui-session.ts";

function lead(index, overrides = {}) {
  return {
    id: `lead-${index}`,
    company: `Company ${index}`,
    website: `https://company-${index}.co.uk`,
    email: `info@company-${index}.co.uk`,
    phone: "—",
    address: `${index} High Street, London`,
    category: "Finance",
    aiScore: 70,
    ...overrides,
  };
}

function batch(sectorCount = 7) {
  return createInitialPersistedSearchBatch({
    batchId: "batch-regression",
    sectorsInput: Array.from({ length: sectorCount }, (_, index) => `Sector ${index + 1}`).join(" → "),
    sectors: Array.from({ length: sectorCount }, (_, index) => `Sector ${index + 1}`),
    location: "London",
    configuredQuantity: 120,
    provider: "serpapi",
    searchProfile: "serpapi",
    workers: 3,
    now: "2026-08-14T10:00:00.000Z",
  });
}

test("A. conclusão de cada setor persiste imediatamente seus leads", async () => {
  const repository = createMemorySearchBatchRepository();
  await repository.createBatch(batch());
  await repository.markSectorRunning("batch-regression", 0);
  await repository.saveSectorResult({
    batchId: "batch-regression",
    sectorIndex: 0,
    leads: [lead(1), lead(2)],
  });
  const restored = await repository.getBatch("batch-regression");
  assert.equal(restored.sectors[0].status, "completed");
  assert.equal(restored.completedSectors, 1);
  assert.deepEqual((await repository.getLeads("batch-regression")).map((item) => item.id), ["lead-1", "lead-2"]);
});

test("B/C/D. reload 3/7 preserva 1–3 e retomada chama somente 4–7", async () => {
  const repository = createMemorySearchBatchRepository();
  await repository.createBatch(batch());
  for (let index = 0; index < 3; index += 1) {
    await repository.markSectorRunning("batch-regression", index);
    await repository.saveSectorResult({ batchId: "batch-regression", sectorIndex: index, leads: [lead(index)] });
  }
  const afterReload = await repository.getLatestRecoverableBatch();
  assert.equal(afterReload.completedSectors, 3);
  assert.equal((await repository.getLeads("batch-regression")).length, 3);
  const apiCalls = getResumableSectors(afterReload).map((sector) => sector.index);
  assert.deepEqual(apiCalls, [3, 4, 5, 6]);
  assert.equal(apiCalls.some((index) => index < 3), false);
});

test("E. 822 leads ficam no repositório de payload grande, não no localStorage", async () => {
  const repository = createMemorySearchBatchRepository();
  await repository.createBatch(batch(1));
  await repository.saveSectorResult({
    batchId: "batch-regression",
    sectorIndex: 0,
    leads: Array.from({ length: 822 }, (_, index) => lead(index)),
  });
  assert.equal((await repository.getLeads("batch-regression")).length, 822);
  assert.equal(SEARCH_BATCH_DB_NAME, "pnp-lead-finder-searches");
  assert.equal(SEARCH_BATCH_STORE, "search-batches");
  assert.equal(SEARCH_LEAD_STORE, "search-leads");
  const source = readFileSync(new URL("../src/lib/search/batch-repository.ts", import.meta.url), "utf8");
  assert.equal(source.includes("indexedDB.open"), true);
  assert.equal(source.includes("localStorage.setItem(SEARCH_LEAD_STORE"), false);
});

test("F/G/H. enrichment, validação e score parciais sobrevivem ao reload", async () => {
  const repository = createMemorySearchBatchRepository();
  await repository.createBatch(batch(1));
  await repository.saveSectorResult({ batchId: "batch-regression", sectorIndex: 0, leads: [lead(1), lead(2), lead(3)] });
  await repository.upsertLeads("batch-regression", [
    lead(1, { email: "found@company-1.co.uk", enrichmentStatus: "completed" }),
    lead(2, { emailValidatedAt: "2026-08-14T10:10:00.000Z", emailValidationStatus: "unknown", emailValidationReason: "mailbox_not_verified", hasMxRecords: true }),
    lead(3, { aiScore: 91, scoringStatus: "completed" }),
  ]);
  const restored = await repository.getLeads("batch-regression");
  assert.equal(restored.find((item) => item.id === "lead-1").email, "found@company-1.co.uk");
  assert.equal(restored.find((item) => item.id === "lead-2").hasMxRecords, true);
  assert.equal(restored.find((item) => item.id === "lead-3").aiScore, 91);
});

test("I. rejeição sempre encerra isSearching no finally", () => {
  const source = readFileSync(new URL("../src/store/lead-store.ts", import.meta.url), "utf8");
  assert.match(source, /finally\s*\{[\s\S]*?isSearching:\s*false/);
});

test("J. falha individual não bloqueia lote nem remove resultados bons", async () => {
  const repository = createMemorySearchBatchRepository();
  await repository.createBatch(batch(2));
  await repository.saveSectorResult({
    batchId: "batch-regression",
    sectorIndex: 0,
    leads: [lead(1), lead(2, { enrichmentStatus: "failed", enrichmentError: "timeout" })],
  });
  await repository.saveSectorResult({ batchId: "batch-regression", sectorIndex: 1, leads: [lead(3)] });
  const finished = await repository.finishBatch("batch-regression", "history-1");
  assert.equal(finished.status, "completed");
  assert.equal((await repository.getLeads("batch-regression")).length, 3);
  assert.equal(finished.enrichmentFailed, 1);
});

test("K. Limpar interface preserva batches e leads IndexedDB", () => {
  const contract = getClearUiPreserveContract();
  assert.equal(contract.includes("indexedDbSearchBatches"), true);
  assert.equal(contract.includes("indexedDbSearchLeads"), true);
});

test("L. histórico concluído reabre o lote pelo batchId", async () => {
  const repository = createMemorySearchBatchRepository();
  await repository.createBatch(batch(1));
  await repository.saveSectorResult({ batchId: "batch-regression", sectorIndex: 0, leads: [lead(1)] });
  const finished = await repository.finishBatch("batch-regression", "history-822");
  assert.equal(finished.historyRecordId, "history-822");
  assert.equal((await repository.getLeads(finished.batchId))[0].id, "lead-1");
});

test("M. persistência/recuperação não possui caminho de envio de email", () => {
  const sources = [
    "../src/lib/search/batch-repository.ts",
    "../src/components/results/search-recovery.tsx",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
  assert.equal(sources.includes("/api/email/send"), false);
  assert.equal(sources.includes("/api/agent-3/send"), false);
  assert.equal(sources.includes("nodemailer"), false);
});
