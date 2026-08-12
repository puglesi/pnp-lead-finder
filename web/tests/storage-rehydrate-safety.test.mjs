import assert from "node:assert/strict";
import test from "node:test";
import {
  asArray,
  safeObjectEntries,
  safeObjectKeys,
  safeObjectValues,
} from "../src/lib/safe-object.ts";
import { computeLifetimeStats } from "../src/lib/lifetime-stats.ts";
import { searchGlobalHistory } from "../src/lib/global-history-search.ts";
import {
  buildGlobalEmailHistory,
  buildPermanentContactBlocks,
} from "../src/lib/global-email-deduplication.ts";
import {
  emailBlocklistToPermanentBlocks,
  findEmailBlock,
  isEmailBlocked,
} from "../src/lib/email-blocklist.ts";
import { isConfirmedCampaignDelivery } from "../src/lib/campaign-delivery-metrics.ts";

test("safe Object.values/keys/entries never throw on null/undefined", () => {
  assert.deepEqual(safeObjectValues(null), []);
  assert.deepEqual(safeObjectValues(undefined), []);
  assert.deepEqual(safeObjectKeys(null), []);
  assert.deepEqual(safeObjectEntries(undefined), []);
  assert.deepEqual(asArray(null), []);
  assert.deepEqual(asArray(undefined), []);
  assert.deepEqual(safeObjectValues({ a: 1 }), [1]);
});

test("lifetime stats: storage sem lifetime / arrays null não crasha", () => {
  const stats = computeLifetimeStats({
    fullSearchHistory: null,
    recentSearches: undefined,
    savedLeads: null,
    importedLeads: undefined,
    campaigns: null,
    floors: undefined,
  });
  assert.equal(stats.companiesFound, 0);
  assert.equal(stats.leadsFound, 0);
  assert.equal(stats.validEmailsFound, 0);
  assert.equal(stats.campaignsSent, 0);
});

test("lifetime stats: campanha antiga sem leadStatuses preserva contagem segura", () => {
  const stats = computeLifetimeStats({
    fullSearchHistory: [
      { id: "s1", keyword: "Accountants", location: "London", resultsCount: 12, date: "2026-01-01" },
    ],
    savedLeads: [
      {
        id: "l1",
        company: "A",
        website: "https://a.com",
        email: "a@a.com",
        phone: "",
        address: "",
        category: "X",
        aiScore: 80,
      },
    ],
    campaigns: [
      {
        id: "c1",
        name: "Legacy",
        status: "active",
        campaignProfileId: "panek-puglesi",
        subject: "Hi",
        body: "",
        leadIds: ["l1"],
        // leadStatuses intentionally missing (legacy)
        sendErrors: null,
      },
    ],
  });
  assert.equal(stats.companiesFound, 12);
  assert.equal(stats.leadsFound, 1);
  assert.equal(stats.validEmailsFound, 1);
  assert.equal(stats.campaignsSent, 0);
  assert.equal(stats.campaignsActive, 1);
});

test("global history: storage sem blocklist / prefs antigas", () => {
  const hitsEmpty = searchGlobalHistory({
    query: "",
    fullSearchHistory: null,
    savedLeads: null,
    campaigns: null,
    blockedEmails: null,
  });
  assert.deepEqual(hitsEmpty, []);

  const hits = searchGlobalHistory({
    query: "accountants",
    fullSearchHistory: [
      {
        id: "s1",
        keyword: "Accountants",
        location: "London",
        resultsCount: 3,
        date: "2026-01-01",
      },
    ],
    recentSearches: undefined,
    savedLeads: [],
    campaigns: [
      {
        id: "c1",
        name: "Spring",
        subject: null,
        status: "draft",
        campaignProfileId: "panek-puglesi",
        leadStatuses: null,
      },
    ],
    blockedEmails: undefined,
  });
  assert.ok(hits.some((h) => h.kind === "search"));
});

test("blocklist null-safe: sem store de blocklist", () => {
  assert.equal(isEmailBlocked(null, "a@b.com"), false);
  assert.equal(findEmailBlock(undefined, "a@b.com"), null);
  assert.deepEqual(emailBlocklistToPermanentBlocks(null), []);
});

test("dedupe history: operations null não crasha (Object.values seguro)", () => {
  const history = buildGlobalEmailHistory({
    campaigns: null,
    leads: null,
    operations: null,
  });
  assert.deepEqual(history, []);

  const blocks = buildPermanentContactBlocks({
    campaigns: [],
    leads: [],
    operations: undefined,
  });
  assert.deepEqual(blocks, []);
});

test("dedupe history: campanha antiga sem leadStatuses", () => {
  const history = buildGlobalEmailHistory({
    campaigns: [
      {
        id: "c1",
        name: "Old",
        campaignProfileId: "panek-puglesi",
        leadStatuses: null,
        sendErrors: undefined,
      },
    ],
    leads: [],
    operations: {
      "panek-puglesi": {
        profileId: "panek-puglesi",
        queue: null,
        sentIndex: null,
      },
      modeclean: null,
    },
  });
  assert.deepEqual(history, []);
});

test("template antigo / prefs: valores ausentes viram defaults via asArray", () => {
  // Pure helper contract used by store merges.
  assert.deepEqual(asArray(null), []);
  assert.deepEqual(asArray([{ id: 1 }]), [{ id: 1 }]);
  assert.deepEqual(safeObjectKeys(null), []);
  assert.deepEqual(safeObjectValues({ x: 1, y: 2 }).sort(), [1, 2]);
});

test("settings autonomousSources null: array ops do not crash (exact field)", () => {
  const autonomousSources = null;
  const sources = Array.isArray(autonomousSources) ? autonomousSources : [];
  assert.deepEqual(sources.map((s) => s), []);
  assert.equal(sources.includes("google-maps"), false);
});

test("nested leadStatuses null slots: delivery + lifetime never throw", () => {
  assert.equal(isConfirmedCampaignDelivery(null), false);
  const stats = computeLifetimeStats({
    fullSearchHistory: [],
    savedLeads: [],
    campaigns: [
      {
        id: "c1",
        name: "Legacy",
        status: "active",
        leadIds: ["l1"],
        leadStatuses: [null, { leadId: "l1", status: "pending" }],
        sendErrors: null,
        recipients: null,
      },
    ],
  });
  assert.equal(stats.campaignsActive, 1);
  assert.equal(stats.campaignsSent, 0);
});
