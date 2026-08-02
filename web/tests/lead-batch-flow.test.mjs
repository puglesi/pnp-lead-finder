import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  advancePipelineStage,
  clearBatchIdFromNonMembers,
  createLeadBatch,
  createLeadBatchId,
  filterLeadsByBatchId,
  filterLeadsByMemberIds,
  filterLeadsForBatch,
  findSearchRecordForBatch,
  getBatchApprovedLeads,
  getBatchEligibleLeads,
  getBatchLeadStats,
  getBatchValidationCandidates,
  isBatchCampaignEligible,
  getSearchRecordSnapshotLeadIds,
  getSharedLeadBatchId,
  migrateLegacySearchToBatch,
  repairBatchFromSearchSnapshot,
  stampLeadsWithBatchId,
  validateBatchSnapshotIntegrity,
} from "../src/lib/lead-batch.ts";

function lead(id, email, extras = {}) {
  return {
    id,
    company: `Company ${id}`,
    website: `https://${id}.example.test`,
    email,
    phone: "",
    address: "London",
    category: "Mortgage Adviser",
    aiScore: 80,
    ...extras,
  };
}

test("batch flow 1. batchId inclui setor, localização, data e quantidade", () => {
  const createdAt = "2026-07-31T12:00:00.000Z";
  const batchId = createLeadBatchId({
    sector: "Mortgage Adviser",
    location: "London UK",
    createdAt,
    foundCount: 99,
  });
  assert.match(batchId, /^batch-/);
  assert.match(batchId, /mortgage-adviser/);
  assert.match(batchId, /london-uk/);
  assert.match(batchId, /20260731/);
  assert.match(batchId, /-99-/);
});

test("batch flow 2. stamp + filter nunca misturam lotes", () => {
  const batchA = createLeadBatch({
    sector: "Mortgage Adviser",
    location: "London",
    foundCount: 3,
  });
  const batchB = createLeadBatch({
    sector: "Cleaning",
    location: "Manchester",
    foundCount: 2,
  });
  const leadsA = stampLeadsWithBatchId(
    [lead("a1", "a1@ex.test"), lead("a2", "a2@ex.test"), lead("a3", null)],
    batchA.batchId
  );
  const leadsB = stampLeadsWithBatchId(
    [lead("b1", "b1@ex.test"), lead("b2", "b2@ex.test")],
    batchB.batchId
  );
  const mixed = [...leadsA, ...leadsB];
  const onlyA = filterLeadsByBatchId(mixed, batchA.batchId);
  const onlyB = filterLeadsByBatchId(mixed, batchB.batchId);
  assert.equal(onlyA.length, 3);
  assert.equal(onlyB.length, 2);
  assert.equal(
    onlyA.every((item) => item.batchId === batchA.batchId),
    true
  );
  assert.equal(filterLeadsByBatchId(mixed, null).length, 0);
});

test("batch flow 3. stats do lote e elegíveis para campanha", () => {
  const batch = createLeadBatch({
    sector: "Mortgage Adviser",
    location: "London",
    foundCount: 5,
  });
  const leads = stampLeadsWithBatchId(
    [
      lead("1", "ok@ex.test", { emailValidationStatus: "valid" }),
      lead("2", "unk@ex.test", {
        emailValidationStatus: "unknown",
        emailValidationReason: "mailbox_not_verified",
      }),
      lead("3", "bad@ex.test", { emailValidationStatus: "invalid" }),
      lead("4", null),
      lead("5", "pending@ex.test"),
    ],
    batch.batchId
  );
  const stats = getBatchLeadStats(leads);
  assert.equal(stats.total, 5);
  assert.equal(stats.withWebsite, 5);
  assert.equal(stats.withEmail, 4);
  assert.equal(stats.withoutEmail, 1);
  assert.equal(stats.approved, 1);
  assert.equal(stats.unknown, 1);
  assert.equal(stats.eligible, 2); // valid + mailbox unknown
  assert.equal(stats.invalid, 1); // only real invalid, not "sem e-mail"
  assert.equal(stats.pendingValidation, 1);
  assert.equal(getBatchApprovedLeads(leads).length, 1);
  assert.equal(getBatchEligibleLeads(leads).length, 2);
  assert.equal(getBatchValidationCandidates(leads).length, 4);
  assert.equal(isBatchCampaignEligible(leads[1]), true);
  assert.equal(isBatchCampaignEligible(leads[3]), false); // no email
});

test("batch flow 4. pipeline só avança para frente", () => {
  assert.equal(advancePipelineStage("search", "garimpo"), "garimpo");
  assert.equal(advancePipelineStage("validation", "search"), "validation");
  assert.equal(advancePipelineStage("campaign", "send"), "send");
});

test("batch flow 5. fluxo busca → agentes → campanha está ligado na UI", () => {
  const bulk = readFileSync(
    new URL(
      "../src/components/dashboard/bulk-search-progress.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const agent1 = readFileSync(
    new URL(
      "../src/components/agents/agent-one-garimpeiro.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const agent2 = readFileSync(
    new URL(
      "../src/components/agents/agent-two-validator.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const shell = readFileSync(
    new URL("../src/components/layout/app-shell.tsx", import.meta.url),
    "utf8"
  );
  const form = readFileSync(
    new URL(
      "../src/components/campaigns/create-campaign-form.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.equal(bulk.includes("Busca concluída"), true);
  assert.equal(bulk.includes("Abrir no Agente 1"), true);
  assert.equal(bulk.includes("/agente-1?batchId="), true);
  assert.equal(bulk.includes("ensureCurrentSearchBatch"), true);
  assert.equal(agent1.includes("Enviar este lote para o Agente 2"), true);
  assert.equal(agent1.includes("filterLeadsByMemberIds"), true);
  assert.equal(agent1.includes("useSearchParams"), true);
  assert.equal(agent1.includes("isBatchMode"), true);
  assert.equal(agent2.includes("Criar campanha com"), true);
  assert.equal(agent2.includes("elegíveis"), true);
  assert.equal(agent2.includes("filterLeadsByMemberIds"), true);
  assert.equal(agent2.includes("repairBatchMembershipFromSnapshot"), true);
  assert.equal(agent2.includes("getBatchEligibleLeads"), true);
  assert.equal(shell.includes("BatchPipelineIndicator"), true);
  assert.equal(form.includes("batchId"), true);
  assert.equal(form.includes("getBatchEligibleLeads"), true);
});

test("batch flow 6. campanha do lote usa só aprovados do mesmo batchId", () => {
  const batchId = "batch-mortgage-london-20260731-99-abc12345";
  const leads = stampLeadsWithBatchId(
    [
      lead("ok1", "ok1@ex.test", { emailValidationStatus: "valid" }),
      lead("ok2", "ok2@ex.test", { emailValidationStatus: "valid" }),
      lead("bad", "bad@ex.test", { emailValidationStatus: "invalid" }),
      lead("other", "other@ex.test", {
        emailValidationStatus: "valid",
        batchId: "batch-other",
      }),
    ],
    batchId
  );
  // last lead overwrote batchId via stamp — re-stamp only first three
  const mixed = [
    ...stampLeadsWithBatchId(leads.slice(0, 3), batchId),
    {
      ...lead("other", "other@ex.test", { emailValidationStatus: "valid" }),
      batchId: "batch-other",
    },
  ];
  const scoped = filterLeadsByBatchId(mixed, batchId);
  const approved = getBatchApprovedLeads(scoped);
  assert.equal(scoped.length, 3);
  assert.equal(approved.length, 2);
  assert.equal(
    approved.every((item) => item.batchId === batchId),
    true
  );
});

/**
 * Real navigation contract: resultados → Agente 1 with same batchId → 99 leads.
 * Guards against regressions where Agent 1 ignored URL and showed the old
 * multi-sector queue (11/11 · 200 leads) instead of the selected lote.
 */
test("batch flow 7. handoff resultados → Agente 1 preserva batchId e 99 leads", () => {
  const bulk = readFileSync(
    new URL(
      "../src/components/dashboard/bulk-search-progress.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const agent1 = readFileSync(
    new URL(
      "../src/components/agents/agent-one-garimpeiro.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const agent1Page = readFileSync(
    new URL("../src/app/(dashboard)/agente-1/page.tsx", import.meta.url),
    "utf8"
  );

  // 1) Results CTA ensures batch (migrates legacy if needed) then navigates
  assert.equal(bulk.includes("Abrir no Agente 1"), true);
  assert.match(
    bulk,
    /router\.push\(\s*`\/agente-1\?batchId=\$\{encodeURIComponent\(batchId\)\}`/
  );
  assert.equal(bulk.includes("ensureCurrentSearchBatch"), true);
  assert.equal(bulk.includes("setActiveBatch(batchId)"), true);

  // 2) Agent 1 page wraps component in Suspense (required for useSearchParams)
  assert.equal(agent1Page.includes("Suspense"), true);
  assert.equal(agent1Page.includes("AgentOneGarimpeiro"), true);

  // 3) Agent 1 reads URL batchId and enters exclusive lote mode
  assert.equal(agent1.includes('searchParams.get("batchId")'), true);
  assert.equal(agent1.includes("const urlBatchId"), true);
  assert.equal(agent1.includes("const isBatchMode = Boolean(urlBatchId)"), true);
  assert.equal(agent1.includes("setActiveBatch(urlBatchId)"), true);
  assert.equal(agent1.includes("filterLeadsByMemberIds"), true);
  assert.equal(agent1.includes("selectedBatchId"), true);

  // 4) General sector queue is hidden while batchId is selected
  assert.equal(agent1.includes("{!isBatchMode && ("), true);
  assert.equal(agent1.includes("Fila de setores"), true);
  assert.equal(agent1.includes("Fila geral de setores oculta neste modo"), true);

  // 5) Lote-only view shows sector / location / count + clear handoff
  assert.equal(agent1.includes("Setor do lote"), true);
  assert.equal(agent1.includes("Leads deste lote"), true);
  assert.equal(agent1.includes("Enviar este lote para o Agente 2"), true);
  assert.match(
    agent1,
    /router\.push\(`\/agente-2\?batchId=\$\{encodeURIComponent\(batchId\)\}`\)/
  );

  // 6) Data isolation: Mortgage Adviser / London / 99 never mixes with other lots
  const mortgageBatch = createLeadBatch({
    sector: "Mortgage Adviser",
    location: "London",
    foundCount: 99,
  });
  const otherBatch = createLeadBatch({
    sector: "Cleaning",
    location: "Manchester",
    foundCount: 200,
  });
  assert.equal(mortgageBatch.sector, "Mortgage Adviser");
  assert.equal(mortgageBatch.location, "London");
  assert.equal(mortgageBatch.foundCount, 99);
  assert.notEqual(mortgageBatch.batchId, otherBatch.batchId);

  const mortgageLeads = stampLeadsWithBatchId(
    Array.from({ length: 99 }, (_, i) =>
      lead(`m${i}`, i % 3 === 0 ? `m${i}@ex.test` : null)
    ),
    mortgageBatch.batchId
  );
  const otherLeads = stampLeadsWithBatchId(
    Array.from({ length: 200 }, (_, i) =>
      lead(`o${i}`, `o${i}@ex.test`)
    ),
    otherBatch.batchId
  );
  const mixedPool = [...mortgageLeads, ...otherLeads];
  assert.equal(mixedPool.length, 299);

  // Simulate navigation landing on /agente-1?batchId=<mortgage>
  const navigatedBatchId = mortgageBatch.batchId;
  const scoped = filterLeadsByBatchId(mixedPool, navigatedBatchId);
  const stats = getBatchLeadStats(scoped);

  assert.equal(scoped.length, 99);
  assert.equal(stats.total, 99);
  assert.equal(
    scoped.every((item) => item.batchId === navigatedBatchId),
    true
  );
  assert.equal(
    scoped.some((item) => item.batchId === otherBatch.batchId),
    false
  );
  // Other lot intact
  assert.equal(filterLeadsByBatchId(mixedPool, otherBatch.batchId).length, 200);
  assert.equal(otherBatch.foundCount, 200);
});

/**
 * Legacy Mortgage Adviser / London search created before batchId.
 * Must create a lote from the existing 99 results without re-search or duplication.
 */
test("batch flow 8. migra busca antiga sem batchId (Mortgage Adviser · London · 99)", () => {
  const legacyLeads = Array.from({ length: 99 }, (_, i) =>
    lead(`legacy-${i}`, i % 4 === 0 ? `legacy${i}@ex.test` : null, {
      category: "Mortgage Adviser",
      address: "London",
    })
  );
  // Confirm: no batchId on any legacy lead
  assert.equal(
    legacyLeads.every((item) => !item.batchId),
    true
  );
  assert.equal(getSharedLeadBatchId(legacyLeads), null);

  const otherSaved = lead("other-saved", "other@ex.test", {
    batchId: "batch-other-cleaning",
    company: "Other Co",
    website: "https://other.example.test",
  });
  // Same company/website as snapshot lead, different id — must NOT join the batch
  const similarSaved = {
    ...lead("legacy-0", null),
    id: "saved-legacy-0",
    company: legacyLeads[0].company,
    website: legacyLeads[0].website,
  };

  const searchRecord = {
    id: "search-old-mortgage",
    keyword: "Mortgage Adviser",
    location: "London",
    resultsCount: 99,
    date: "2026-07-15T10:00:00.000Z",
    leads: legacyLeads.map((item) => ({ ...item })),
  };
  const unrelatedRecord = {
    id: "search-cleaning",
    keyword: "Cleaning",
    location: "Manchester",
    resultsCount: 50,
    date: "2026-07-10T10:00:00.000Z",
    leads: [lead("c1", "c1@ex.test")],
  };

  const migrated = migrateLegacySearchToBatch({
    sector: "Mortgage Adviser",
    location: "London",
    leads: legacyLeads,
    savedLeads: [similarSaved, otherSaved],
    recentSearches: [searchRecord, unrelatedRecord],
    fullSearchHistory: [searchRecord, unrelatedRecord],
    createdAt: searchRecord.date,
    searchRecordId: searchRecord.id,
  });

  // Batch metadata from existing results
  assert.equal(migrated.createdNewBatch, true);
  assert.equal(migrated.batch.sector, "Mortgage Adviser");
  assert.equal(migrated.batch.location, "London");
  assert.equal(migrated.batch.foundCount, 99);
  assert.equal(migrated.batch.leadIds?.length, 99);
  assert.equal(migrated.batch.searchRecordId, "search-old-mortgage");
  assert.match(migrated.batch.batchId, /^batch-/);
  assert.match(migrated.batch.batchId, /mortgage-adviser/);
  assert.match(migrated.batch.batchId, /london/);
  assert.match(migrated.batch.batchId, /-99-/);

  // Current results stamped, same count, same ids (no delete/duplicate)
  assert.equal(migrated.currentLeads.length, 99);
  assert.equal(
    migrated.currentLeads.every((item) => item.batchId === migrated.batch.batchId),
    true
  );
  assert.equal(
    migrated.currentLeads.map((item) => item.id).join(","),
    legacyLeads.map((item) => item.id).join(",")
  );

  // Fingerprint-similar saved lead must NOT receive batchId; other lot preserved
  assert.equal(migrated.savedLeads.length, 2);
  const similarStill = migrated.savedLeads.find((item) => item.id === "saved-legacy-0");
  const preservedOther = migrated.savedLeads.find(
    (item) => item.id === "other-saved"
  );
  assert.equal(similarStill?.batchId, undefined);
  assert.equal(preservedOther?.batchId, "batch-other-cleaning");

  // SearchRecord updated; unrelated history untouched
  const updatedRecord = migrated.fullSearchHistory.find(
    (item) => item.id === "search-old-mortgage"
  );
  const stillUnrelated = migrated.fullSearchHistory.find(
    (item) => item.id === "search-cleaning"
  );
  assert.equal(updatedRecord?.batchId, migrated.batch.batchId);
  assert.equal(updatedRecord?.resultsCount, 99);
  assert.equal(updatedRecord?.leads?.length, 99);
  assert.equal(
    updatedRecord?.leads?.every((item) => item.batchId === migrated.batch.batchId),
    true
  );
  assert.equal(stillUnrelated?.batchId, undefined);
  assert.equal(stillUnrelated?.leads?.[0]?.batchId, undefined);

  // Exclusive membership filter: only snapshot IDs (99), never +fingerprint saved
  const pool = [
    ...migrated.currentLeads,
    ...migrated.savedLeads,
    lead("noise", "noise@ex.test", { batchId: "batch-noise" }),
  ];
  const scoped = filterLeadsForBatch(
    pool,
    migrated.batch.batchId,
    migrated.batch.leadIds
  );
  assert.equal(scoped.length, 99);
  assert.equal(getBatchLeadStats(scoped).total, 99);

  // UI wiring: handoff uses ensureCurrentSearchBatch (no "execute search again")
  const bulk = readFileSync(
    new URL(
      "../src/components/dashboard/bulk-search-progress.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const leadStore = readFileSync(
    new URL("../src/store/lead-store.ts", import.meta.url),
    "utf8"
  );
  assert.equal(bulk.includes("ensureCurrentSearchBatch"), true);
  assert.equal(bulk.includes("Execute a busca novamente"), false);
  assert.equal(leadStore.includes("ensureCurrentSearchBatch"), true);
  assert.equal(leadStore.includes("migrateLegacySearchToBatch"), true);
  assert.equal(leadStore.includes("upsertBatch"), true);
});

/**
 * Buscas Recentes → Continuar no Agente 1 with Mortgage Adviser · 99 leads.
 * Ensures explicit path from recent search into lote mode (not general queue).
 */
test("batch flow 9. busca recente Mortgage Adviser 99 → continuar → Agente 1 com 99", () => {
  const recent = readFileSync(
    new URL(
      "../src/components/dashboard/recent-searches.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const leadStore = readFileSync(
    new URL("../src/store/lead-store.ts", import.meta.url),
    "utf8"
  );
  const agent1 = readFileSync(
    new URL(
      "../src/components/agents/agent-one-garimpeiro.tsx",
      import.meta.url
    ),
    "utf8"
  );

  // 1) UI exposes Continuar no Agente 1 on each recent item
  assert.equal(recent.includes("Buscas Recentes"), true);
  assert.equal(recent.includes("Continuar no Agente 1"), true);
  assert.equal(recent.includes("openSearchBatchInAgentOne"), true);
  assert.match(
    recent,
    /router\.push\(`\/agente-1\?batchId=\$\{encodeURIComponent\(batchId\)\}`\)/
  );
  assert.equal(recent.includes("handleContinueAgentOne"), true);
  assert.equal(recent.includes("stopPropagation"), true);

  // 2) Store loads snapshot + creates/locates batch without re-search
  assert.equal(leadStore.includes("openSearchBatchInAgentOne"), true);
  assert.equal(leadStore.includes("ensureCurrentSearchBatch"), true);
  assert.equal(leadStore.includes("Never re-run search"), true);

  // 3) Agent 1 lote mode still exclusive with handoff
  assert.equal(agent1.includes("isBatchMode"), true);
  assert.equal(agent1.includes("{!isBatchMode && ("), true);
  assert.equal(agent1.includes("Enviar este lote para o Agente 2"), true);
  assert.equal(agent1.includes("Setor do lote"), true);
  assert.equal(agent1.includes("Leads deste lote"), true);

  // 4) Data path: recent Mortgage Adviser record with 99 leads → batch → 99 scoped
  const legacyLeads = Array.from({ length: 99 }, (_, i) =>
    lead(`recent-m${i}`, i % 5 === 0 ? `rm${i}@ex.test` : null, {
      category: "Mortgage Adviser",
      address: "London",
    })
  );
  const recentRecord = {
    id: "recent-mortgage-london",
    keyword: "Mortgage Adviser",
    location: "London",
    resultsCount: 99,
    date: "2026-07-31T09:00:00.000Z",
    leads: legacyLeads,
  };
  assert.equal(recentRecord.resultsCount, 99);
  assert.equal(recentRecord.leads.every((item) => !item.batchId), true);

  const migrated = migrateLegacySearchToBatch({
    sector: recentRecord.keyword,
    location: recentRecord.location,
    leads: recentRecord.leads,
    recentSearches: [recentRecord],
    fullSearchHistory: [recentRecord],
    createdAt: recentRecord.date,
    searchRecordId: recentRecord.id,
  });

  assert.equal(migrated.batch.sector, "Mortgage Adviser");
  assert.equal(migrated.batch.location, "London");
  assert.equal(migrated.batch.foundCount, 99);
  assert.equal(migrated.currentLeads.length, 99);
  assert.equal(
    filterLeadsByBatchId(migrated.currentLeads, migrated.batch.batchId).length,
    99
  );
  assert.equal(
    migrated.recentSearches.find((r) => r.id === recentRecord.id)?.batchId,
    migrated.batch.batchId
  );

  // Simulate navigation landing: same batchId → only 99, not mixed with general queue noise
  const otherQueueNoise = stampLeadsWithBatchId(
    Array.from({ length: 200 }, (_, i) => lead(`noise-${i}`, null)),
    "batch-general-queue-200"
  );
  const pool = [...migrated.currentLeads, ...otherQueueNoise];
  const scoped = filterLeadsByBatchId(pool, migrated.batch.batchId);
  assert.equal(scoped.length, 99);
  assert.equal(getBatchLeadStats(scoped).total, 99);
  assert.equal(
    scoped.every((item) => item.category === "Mortgage Adviser"),
    true
  );
  assert.equal(
    scoped.every((item) => item.batchId === migrated.batch.batchId),
    true
  );
});

/**
 * Contaminated pool: 99 snapshot + 19 similar old leads wrongly sharing batchId.
 * Exclusive membership must keep the batch at 99 (detach contaminants, no delete).
 */
test("batch flow 10. busca 99 + 19 leads antigos semelhantes → batch continua com 99", () => {
  const snapshot = Array.from({ length: 99 }, (_, i) =>
    lead(`snap-${i}`, i % 3 === 0 ? `snap${i}@ex.test` : null, {
      category: "Mortgage Adviser",
      address: "London",
    })
  );
  // 19 older leads: same sector/location style, some fingerprint-similar
  const oldSimilar = Array.from({ length: 19 }, (_, i) =>
    lead(`old-${i}`, `old${i}@ex.test`, {
      category: "Mortgage Adviser",
      address: "London",
      company: i < 5 ? snapshot[i].company : `Old Mortgage ${i}`,
      website: i < 5 ? snapshot[i].website : `https://old-mortgage-${i}.test`,
    })
  );

  const migrated = migrateLegacySearchToBatch({
    sector: "Mortgage Adviser",
    location: "London",
    leads: snapshot,
    savedLeads: oldSimilar,
    recentSearches: [
      {
        id: "sr-mortgage-99",
        keyword: "Mortgage Adviser",
        location: "London",
        resultsCount: 99,
        date: "2026-07-31T12:00:00.000Z",
        leads: snapshot,
      },
    ],
    fullSearchHistory: [
      {
        id: "sr-mortgage-99",
        keyword: "Mortgage Adviser",
        location: "London",
        resultsCount: 99,
        date: "2026-07-31T12:00:00.000Z",
        leads: snapshot,
      },
    ],
    createdAt: "2026-07-31T12:00:00.000Z",
    searchRecordId: "sr-mortgage-99",
  });

  assert.equal(migrated.batch.foundCount, 99);
  assert.equal(migrated.batch.leadIds?.length, 99);
  assert.equal(migrated.currentLeads.length, 99);

  // Old similars must not receive this batchId via fingerprint
  assert.equal(
    migrated.savedLeads.every((item) => item.batchId !== migrated.batch.batchId),
    true
  );
  assert.equal(migrated.savedLeads.length, 19); // not deleted

  // Simulate prior bug: 19 contaminants already stamped with this batchId
  const contaminatedSaved = stampLeadsWithBatchId(
    oldSimilar,
    migrated.batch.batchId
  );
  assert.equal(
    filterLeadsByBatchId(
      [...migrated.currentLeads, ...contaminatedSaved],
      migrated.batch.batchId
    ).length,
    118
  );

  // Exclusive filter ignores contaminants
  const exclusive = filterLeadsForBatch(
    [...migrated.currentLeads, ...contaminatedSaved],
    migrated.batch.batchId,
    migrated.batch.leadIds
  );
  assert.equal(exclusive.length, 99);
  assert.equal(getBatchLeadStats(exclusive).total, 99);
  assert.equal(getBatchLeadStats(exclusive).withEmail, exclusive.filter((l) => l.email).length);

  // Repair detaches batchId from the 19 without deleting them
  const repaired = clearBatchIdFromNonMembers(
    contaminatedSaved,
    migrated.batch.batchId,
    migrated.batch.leadIds ?? []
  );
  assert.equal(repaired.length, 19);
  assert.equal(
    repaired.every((item) => !item.batchId),
    true
  );
  assert.equal(
    filterLeadsByBatchId(
      [...migrated.currentLeads, ...repaired],
      migrated.batch.batchId
    ).length,
    99
  );

  // Agent 1 UI uses exclusive membership helpers
  const agent1 = readFileSync(
    new URL(
      "../src/components/agents/agent-one-garimpeiro.tsx",
      import.meta.url
    ),
    "utf8"
  );
  assert.equal(agent1.includes("filterLeadsByMemberIds"), true);
  assert.equal(agent1.includes("leadIds"), true);
});

/**
 * Agente 1 batch 99 → Agente 2 with same batchId.
 * Total remains 99; never mixes the global 200-lead queue.
 */
test("batch flow 11. Agente 1 batch 99 → Agente 2 mesmo batchId → total 99", () => {
  const agent1 = readFileSync(
    new URL(
      "../src/components/agents/agent-one-garimpeiro.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const agent2 = readFileSync(
    new URL(
      "../src/components/agents/agent-two-validator.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const agent2Page = readFileSync(
    new URL("../src/app/(dashboard)/agente-2/page.tsx", import.meta.url),
    "utf8"
  );

  // 1) Handoff always navigates with batchId
  assert.match(
    agent1,
    /router\.push\(`\/agente-2\?batchId=\$\{encodeURIComponent\(batchId\)\}`\)/
  );
  assert.equal(agent1.includes("Enviar este lote para o Agente 2"), true);
  assert.equal(agent1.includes("Do NOT saveLead()"), true);

  // 2) Agent 2 reads URL batchId and enters exclusive lote mode
  assert.equal(agent2Page.includes("Suspense"), true);
  assert.equal(agent2.includes('searchParams.get("batchId")'), true);
  assert.equal(agent2.includes("const isBatchMode = Boolean(urlBatchId)"), true);
  assert.equal(agent2.includes("filterLeadsByMemberIds"), true);
  assert.equal(agent2.includes("repairBatchMembershipFromSnapshot"), true);
  assert.equal(agent2.includes("loadQueue(leads, false)"), true);
  assert.equal(agent2.includes("Fila geral oculta"), true);
  assert.equal(agent2.includes("elegíveis"), true);
  assert.equal(agent2.includes("getBatchEligibleLeads"), true);
  assert.match(
    agent2,
    /router\.push\(`\/campanhas\/nova\?batchId=\$\{encodeURIComponent\(batchId\)\}`\)/
  );

  // 3) Data: 99 batch members + 200 global noise → exclusive total stays 99
  const batch = createLeadBatch({
    sector: "Mortgage Adviser",
    location: "London",
    foundCount: 99,
    leadIds: Array.from({ length: 99 }, (_, i) => `m-${i}`),
  });
  assert.equal(batch.leadIds?.length, 99);
  assert.equal(batch.foundCount, 99);

  const batchLeads = stampLeadsWithBatchId(
    Array.from({ length: 99 }, (_, i) =>
      lead(`m-${i}`, i % 2 === 0 ? `m${i}@ex.test` : null, {
        category: "Mortgage Adviser",
      })
    ),
    batch.batchId
  );
  const globalNoise = stampLeadsWithBatchId(
    Array.from({ length: 200 }, (_, i) => lead(`g-${i}`, `g${i}@ex.test`)),
    "batch-global-queue-200"
  );
  // Contaminants wrongly sharing batchId must still be excluded by leadIds
  const contaminants = stampLeadsWithBatchId(
    Array.from({ length: 41 }, (_, i) =>
      lead(`c-${i}`, `c${i}@ex.test`, { category: "Mortgage Adviser" })
    ),
    batch.batchId
  );

  const pool = [...batchLeads, ...globalNoise, ...contaminants];
  assert.equal(pool.length, 99 + 200 + 41);

  const scoped = filterLeadsByMemberIds(pool, batch.leadIds);
  const stats = getBatchLeadStats(scoped);
  assert.equal(scoped.length, 99);
  assert.equal(stats.total, 99);
  assert.equal(
    scoped.every((item) => item.batchId === batch.batchId),
    true
  );
  assert.equal(
    scoped.some((item) => item.id.startsWith("g-") || item.id.startsWith("c-")),
    false
  );
  // Global 200 untouched as a separate batch
  assert.equal(
    filterLeadsByBatchId(pool, "batch-global-queue-200").length,
    200
  );

  // Simulated Agent 2 queue items: only batch leadIds count in lote mode
  const mixedQueue = [
    ...scoped.map((item, index) => ({
      id: `q-batch-${index}`,
      leadId: item.id,
    })),
    ...globalNoise.slice(0, 50).map((item, index) => ({
      id: `q-global-${index}`,
      leadId: item.id,
    })),
  ];
  const allowed = new Set(batch.leadIds);
  const batchQueue = mixedQueue.filter((item) => allowed.has(item.leadId));
  assert.equal(batchQueue.length, 99);
  assert.equal(
    batchQueue.every((item) => allowed.has(item.leadId)),
    true
  );
});

/**
 * SearchRecord 99 + DB with 42 similar contaminants → Agent 2 stays at 99.
 * Contaminated leadIds (141) are repaired from the snapshot.
 */
test("batch flow 12. SearchRecord 99 + 42 semelhantes → Agente 2 continua com 99", () => {
  const snapshot = Array.from({ length: 99 }, (_, i) =>
    lead(`snap99-${i}`, i % 3 === 0 ? `s${i}@ex.test` : null, {
      category: "Mortgage Adviser",
      address: "London",
    })
  );
  const contaminants = Array.from({ length: 42 }, (_, i) =>
    lead(`cont42-${i}`, `c${i}@ex.test`, {
      category: "Mortgage Adviser",
      address: "London",
      company: i < 10 ? snapshot[i].company : `Similar Co ${i}`,
      website: i < 10 ? snapshot[i].website : `https://similar-${i}.test`,
    })
  );

  const searchRecord = {
    id: "sr-mortgage-99-final",
    keyword: "Mortgage Adviser",
    location: "London",
    resultsCount: 99,
    date: "2026-07-31T15:00:00.000Z",
    leads: snapshot,
    batchId: "batch-contaminated-141",
  };

  // Contaminated batch: label/foundCount still 99, but leadIds wrongly grew to 141
  const clean = createLeadBatch({
    sector: "Mortgage Adviser",
    location: "London",
    foundCount: 99,
    createdAt: searchRecord.date,
    searchRecordId: searchRecord.id,
    batchId: "batch-contaminated-141",
    leadIds: snapshot.map((item) => item.id),
  });
  const contaminatedBatch = {
    ...clean,
    leadIds: [
      ...snapshot.map((item) => item.id),
      ...contaminants.map((item) => item.id),
    ],
    foundCount: 99,
  };
  assert.equal(contaminatedBatch.leadIds?.length, 141);
  assert.equal(contaminatedBatch.foundCount, 99);

  // Stamp everyone with batchId (simulates prior bug)
  const currentLeads = stampLeadsWithBatchId(snapshot, contaminatedBatch.batchId);
  const savedLeads = stampLeadsWithBatchId(contaminants, contaminatedBatch.batchId);

  assert.equal(
    filterLeadsByBatchId([...currentLeads, ...savedLeads], contaminatedBatch.batchId)
      .length,
    141
  );

  // Snapshot IDs from SearchRecord are the exclusive truth
  const snapshotIds = getSearchRecordSnapshotLeadIds(searchRecord);
  assert.equal(snapshotIds.length, 99);

  const found = findSearchRecordForBatch(contaminatedBatch, [searchRecord]);
  assert.equal(found?.id, searchRecord.id);

  const repaired = repairBatchFromSearchSnapshot({
    batch: contaminatedBatch,
    searchRecord,
    currentLeads,
    savedLeads,
  });

  assert.equal(repaired.batch.leadIds?.length, 99);
  assert.equal(repaired.batch.foundCount, 99);
  assert.equal(repaired.removedCount >= 42, true);

  const integrity = validateBatchSnapshotIntegrity(
    repaired.batch,
    searchRecord.resultsCount
  );
  assert.equal(integrity.ok, true);
  assert.equal(integrity.leadCount, 99);
  assert.equal(integrity.foundCount, 99);
  assert.equal(integrity.expectedCount, 99);

  // Contaminants detached (still in bank, without this batchId)
  assert.equal(repaired.savedLeads.length, 42);
  assert.equal(
    repaired.savedLeads.every((item) => item.batchId !== repaired.batch.batchId),
    true
  );
  // Snapshot members keep batchId
  assert.equal(repaired.currentLeads.length, 99);
  assert.equal(
    repaired.currentLeads.every((item) => item.batchId === repaired.batch.batchId),
    true
  );

  // Agent 2 exclusive filter
  const pool = [...repaired.currentLeads, ...repaired.savedLeads];
  const scoped = filterLeadsByMemberIds(pool, repaired.batch.leadIds);
  const stats = getBatchLeadStats(scoped);
  assert.equal(scoped.length, 99);
  assert.equal(stats.total, 99);
  assert.equal(stats.withEmail + stats.withoutEmail, 99);

  // Queue must never exceed emails among the 99
  const withEmail = scoped.filter((item) => item.email);
  assert.equal(withEmail.length <= 99, true);
  assert.equal(getBatchValidationCandidates(scoped).length, withEmail.length);

  // Without memberIds, exclusive filter returns empty (no batchId expand)
  assert.equal(filterLeadsForBatch(pool, repaired.batch.batchId, null).length, 0);

  const agent2 = readFileSync(
    new URL(
      "../src/components/agents/agent-two-validator.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const leadStore = readFileSync(
    new URL("../src/store/lead-store.ts", import.meta.url),
    "utf8"
  );
  assert.equal(agent2.includes("repairBatchMembershipFromSnapshot"), true);
  assert.equal(agent2.includes("filterLeadsByMemberIds"), true);
  assert.equal(agent2.includes("validateBatchSnapshotIntegrity"), true);
  assert.equal(leadStore.includes("repairBatchMembershipFromSnapshot"), true);
  assert.equal(leadStore.includes("repairBatchFromSearchSnapshot"), true);
});

/**
 * Mortgage batch: 99 total, 25 mailbox-unknown eligible, 74 without email.
 * Without email must NOT count as invalid; campaign unlocks with 25 elegíveis.
 */
test("batch flow 13. 99 total + 25 mailbox unknown + 74 sem e-mail → 25 elegíveis", () => {
  const withEmailUnknown = Array.from({ length: 25 }, (_, i) =>
    lead(`ok-${i}`, `ok${i}@ex.test`, {
      category: "Mortgage Adviser",
      emailValidationStatus: "unknown",
      emailValidationReason: "mailbox_not_verified",
      hasMxRecords: true,
    })
  );
  const withoutEmail = Array.from({ length: 74 }, (_, i) =>
    lead(`no-${i}`, null, {
      category: "Mortgage Adviser",
      // some may carry no_email status from older pipelines
      emailValidationStatus: i % 2 === 0 ? "no_email" : undefined,
      emailValidationReason: i % 2 === 0 ? "no_email" : undefined,
    })
  );
  const batchLeads = stampLeadsWithBatchId(
    [...withEmailUnknown, ...withoutEmail],
    "batch-mortgage-99-eligible"
  );
  assert.equal(batchLeads.length, 99);

  const stats = getBatchLeadStats(batchLeads);
  assert.equal(stats.total, 99);
  assert.equal(stats.withEmail, 25);
  assert.equal(stats.withoutEmail, 74);
  assert.equal(stats.unknown, 25);
  assert.equal(stats.eligible, 25);
  assert.equal(stats.invalid, 0); // never count "sem e-mail" as invalid
  assert.equal(stats.approved, 0); // local validation never marks valid

  const eligible = getBatchEligibleLeads(batchLeads);
  assert.equal(eligible.length, 25);
  assert.equal(
    eligible.every((item) => Boolean(item.email)),
    true
  );
  assert.equal(
    eligible.every((item) => isBatchCampaignEligible(item)),
    true
  );
  assert.equal(
    withoutEmail.every((item) => !isBatchCampaignEligible(item)),
    true
  );

  // Campaign unlocked when eligible > 0
  assert.equal(eligible.length > 0, true);

  // UI wiring
  const agent2 = readFileSync(
    new URL(
      "../src/components/agents/agent-two-validator.tsx",
      import.meta.url
    ),
    "utf8"
  );
  assert.equal(agent2.includes("Criar campanha com"), true);
  assert.equal(agent2.includes("elegíveis"), true);
  assert.equal(agent2.includes("getBatchEligibleLeads"), true);
  assert.equal(agent2.includes("Voltar ao Agente 1"), true);
  assert.equal(agent2.includes("Sem e-mail"), true);
  assert.equal(agent2.includes("Elegíveis"), true);

  const form = readFileSync(
    new URL(
      "../src/components/campaigns/create-campaign-form.tsx",
      import.meta.url
    ),
    "utf8"
  );
  assert.equal(form.includes("getBatchEligibleLeads"), true);
});
