/**
 * Import batch isolation + canonical eligibility — no real email.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildImportBatchMembership,
  createImportBatchId,
  filterLeadsByImportBatch,
  importStatsBalance,
} from "../src/lib/import-batch.ts";
import {
  buildCampaignEligibilitySummary,
  eligibilityTopCards,
} from "../src/lib/campaign-eligibility.ts";
import { parseEmailList } from "../src/lib/import-leads.ts";

test("import batch isolates membership — does not inherit old global imports", () => {
  const batchA = createImportBatchId();
  const batchB = createImportBatchId();
  assert.notEqual(batchA, batchB);

  const stats = buildImportBatchMembership({
    importBatchId: batchB,
    totalLines: 5,
    parsedLeads: [
      {
        id: "n1",
        company: "A",
        website: "—",
        email: "a@x.com",
        phone: "—",
        address: "—",
        category: "Importado",
        aiScore: 70,
      },
      {
        id: "n2",
        company: "B",
        website: "—",
        email: "b@x.com",
        phone: "—",
        address: "—",
        category: "Importado",
        aiScore: 70,
      },
    ],
    skippedInvalidOrDup: 3,
    invalidCount: 3,
    systemEmails: new Set(["old@x.com"]),
    existingByEmail: new Map([
      [
        "old@x.com",
        {
          id: "old-1",
          company: "Old",
          website: "—",
          email: "old@x.com",
          phone: "—",
          address: "—",
          category: "Importado",
          aiScore: 70,
          importBatchId: batchA,
        },
      ],
    ]),
  });

  assert.equal(stats.batchFinalCount, 2);
  assert.equal(stats.newlyAdded, 2);
  assert.equal(stats.alreadyInSystem, 0);
  assert.equal(stats.leadIds.length, 2);
  assert.ok(!stats.leadIds.includes("old-1"));
  assert.equal(importStatsBalance(stats).ok, true);
});

test("86 usable batch cannot silently become 122 with old imports", () => {
  // Simulate: file yields 86 valid; global pool has 122 historical imports.
  const batchId = createImportBatchId();
  const parsed = Array.from({ length: 86 }, (_, i) => ({
    id: `new-${i}`,
    company: `C${i}`,
    website: "—",
    email: `u${i}@file.com`,
    phone: "—",
    address: "—",
    category: "Importado",
    aiScore: 70,
  }));
  const globalOld = Array.from({ length: 36 }, (_, i) => ({
    id: `old-${i}`,
    company: `Old${i}`,
    website: "—",
    email: `old${i}@hist.com`,
    phone: "—",
    address: "—",
    category: "Importado",
    aiScore: 70,
    importBatchId: "impbatch-old",
  }));
  const stats = buildImportBatchMembership({
    importBatchId: batchId,
    totalLines: 86 + 255,
    parsedLeads: parsed,
    skippedInvalidOrDup: 255,
    invalidCount: 255,
    systemEmails: new Set(globalOld.map((l) => l.email)),
    existingByEmail: new Map(),
  });
  // Batch membership is only the file's 86 — not 122.
  assert.equal(stats.batchFinalCount, 86);
  const allStore = [...stats.leads, ...globalOld];
  const pickerPool = filterLeadsByImportBatch(allStore, batchId);
  assert.equal(pickerPool.length, 86);
  assert.notEqual(allStore.length, 86);
});

test("parse skip reasons: invalid/dup are counted as ignored", () => {
  const result = parseEmailList(
    "good@x.com\nbad\ngood@x.com\nnot-an-email\nok@y.com"
  );
  assert.equal(result.leads.length, 2);
  assert.ok(result.skipped >= 2);
});

test("canonical eligibility: top cards === preview finalSendCount", () => {
  const members = [
    {
      id: "1",
      company: "A",
      website: "—",
      email: "a@new.com",
      phone: "—",
      address: "—",
      category: "X",
      aiScore: 80,
    },
    {
      id: "2",
      company: "B",
      website: "—",
      email: "b@new.com",
      phone: "—",
      address: "—",
      category: "X",
      aiScore: 80,
    },
    {
      id: "3",
      company: "Dup",
      website: "—",
      email: "a@new.com",
      phone: "—",
      address: "—",
      category: "X",
      aiScore: 80,
    },
  ];
  const summary = buildCampaignEligibilitySummary({
    operation: "panek-puglesi",
    campaignId: "draft",
    members,
    campaigns: [],
    operations: {},
    blockedEntries: [],
  });
  const top = eligibilityTopCards(summary);
  assert.equal(top.eligible, summary.preview.finalSendCount);
  assert.equal(top.eligible, summary.eligibleFinal);
  assert.equal(top.total, 3);
  assert.equal(top.excluded, top.total - top.eligible);
  // One duplicate email → final 2
  assert.equal(summary.eligibleFinal, 2);
  assert.equal(summary.duplicatesInBatch, 1);
});

test("cross-operation is warning (included), not exclusion", () => {
  const members = [
    {
      id: "1",
      company: "Shared",
      website: "—",
      email: "shared@x.com",
      phone: "—",
      address: "—",
      category: "X",
      aiScore: 80,
    },
  ];
  const history = [
    {
      operation: "panek-puglesi",
      normalizedEmail: "shared@x.com",
      campaignId: "old",
      campaignName: "Old P&P",
      sentAt: "2026-01-01T00:00:00.000Z",
      providerMessageId: "real-msg-001234",
    },
  ];
  const summary = buildCampaignEligibilitySummary({
    operation: "modeclean",
    campaignId: "new-mc",
    members,
    history,
    campaigns: [],
    operations: {},
  });
  assert.equal(summary.eligibleFinal, 1);
  assert.equal(summary.otherOperationWarnings, 1);
  assert.ok(summary.preview.decisions[0].included);
});

test("no real email", () => {
  assert.ok(true);
});
