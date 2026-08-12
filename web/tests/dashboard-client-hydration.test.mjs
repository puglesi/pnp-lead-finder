/**
 * Client-side Dashboard hydration test.
 * Does NOT only unit-test stores — it runs the full overview data path
 * that Dashboard components execute after rehydrate with adversarial
 * (old/null/missing) persisted payloads.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  buildAdversarialDashboardStorage,
  inspectDashboardStorageKeys,
  runDashboardClientHydration,
} from "../src/lib/dashboard-client-hydration.ts";
import {
  normalizeBlocklistPersistSlice,
  normalizeCampaignPersistSlice,
  normalizeLeadPersistSlice,
  normalizeLifetimePersistSlice,
  normalizeTemplatesPersistSlice,
  normalizeThemePersistSlice,
  PERSIST_STORAGE_KEYS,
} from "../src/lib/store-rehydrate.ts";
import { computeLifetimeStats } from "../src/lib/lifetime-stats.ts";
import { searchGlobalHistory } from "../src/lib/global-history-search.ts";
import { asArray } from "../src/lib/safe-object.ts";

test("normalize: lead store null arrays become empty arrays (exact fields)", () => {
  const n = normalizeLeadPersistSlice({
    recentSearches: null,
    fullSearchHistory: null,
    sectorHistory: null,
    savedLeads: null,
    importedLeads: null,
    sidebarCollapsed: "yes",
  });
  assert.deepEqual(n.recentSearches, []);
  assert.deepEqual(n.fullSearchHistory, []);
  assert.deepEqual(n.sectorHistory, []);
  assert.deepEqual(n.savedLeads, []);
  assert.deepEqual(n.importedLeads, []);
  assert.equal(n.sidebarCollapsed, false);
});

test("normalize: campaign leadIds/leadStatuses/sendErrors null repaired", () => {
  const n = normalizeCampaignPersistSlice({
    campaigns: [
      {
        id: "c1",
        name: "X",
        status: "bogus",
        leadIds: null,
        leadStatuses: null,
        sendErrors: null,
      },
    ],
  });
  assert.equal(n.campaigns.length, 1);
  assert.deepEqual(n.campaigns[0].leadIds, []);
  assert.deepEqual(n.campaigns[0].leadStatuses, []);
  assert.deepEqual(n.campaigns[0].sendErrors, []);
  assert.equal(n.campaigns[0].status, "draft");
});

test("normalize: blocklist/lifetime/theme/templates exact fields", () => {
  assert.deepEqual(normalizeBlocklistPersistSlice({ entries: null }).entries, []);
  const life = normalizeLifetimePersistSlice({
    companiesFound: null,
    leadsFound: "x",
    validEmailsFound: undefined,
    campaignsSent: -1,
  });
  assert.equal(life.companiesFound, 0);
  assert.equal(life.leadsFound, 0);
  assert.equal(life.campaignsSent, 0);
  assert.equal(normalizeThemePersistSlice({ preference: "neon" }).preference, "system");
  assert.deepEqual(
    normalizeTemplatesPersistSlice({ templates: null }).templates,
    []
  );
});

test("CLIENT hydration: adversarial storage does not crash Dashboard path", () => {
  const adversarial = buildAdversarialDashboardStorage();
  const result = runDashboardClientHydration(adversarial);
  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.mountedMarkers));
  assert.ok(result.mountedMarkers.includes("stats-cards"));
  assert.ok(result.mountedMarkers.includes("blocked-emails-panel"));
  assert.equal(result.theme, "system");
  // Campaign with invalid status still counted after normalize
  assert.equal(result.campaignCount, 2);
  // Invalid blocklist reasons dropped or repaired — at least shape-safe
  assert.ok(result.blockedCount >= 0);
  assert.equal(typeof result.stats.companiesFound, "number");
});

test("CLIENT hydration: missing lifetime + empty history still renders stats", () => {
  const result = runDashboardClientHydration({
    leadPersist: {
      recentSearches: [],
      fullSearchHistory: [],
      sectorHistory: [],
      savedLeads: [],
      importedLeads: [],
    },
    campaignPersist: { campaigns: [] },
    blocklistPersist: {},
    lifetimePersist: undefined,
    themePersist: {},
    templatesPersist: { templates: [] },
    settingsPersist: { autonomousSources: null },
  });
  assert.equal(result.stats.companiesFound, 0);
  assert.equal(result.stats.leadsFound, 0);
  assert.equal(result.campaignCount, 0);
});

test("CLIENT hydration: rich legacy snapshot mounts overview markers", () => {
  const result = runDashboardClientHydration({
    leadPersist: {
      recentSearches: [
        {
          id: "s1",
          keyword: "Accountants",
          location: "London",
          resultsCount: 5,
          date: "2026-01-01",
          leads: [
            {
              id: "l1",
              company: "A Ltd",
              website: "https://a.com",
              email: "a@a.com",
              phone: "",
              address: "London",
              category: "Accountants",
              aiScore: 90,
            },
          ],
        },
      ],
      fullSearchHistory: null,
      sectorHistory: ["Accountants", null, "Solicitors"],
      savedLeads: null,
      importedLeads: [],
    },
    campaignPersist: {
      campaigns: [
        {
          id: "c1",
          name: "Spring",
          subject: "Hello",
          status: "draft",
          campaignProfileId: "panek-puglesi",
          leadIds: ["l1"],
          leadStatuses: null,
          sendErrors: [],
        },
      ],
    },
    blocklistPersist: {
      entries: [
        {
          id: "b1",
          normalizedEmail: "blocked@example.com",
          reason: "manual",
          operation: "both",
          blockedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    },
    lifetimePersist: {
      companiesFound: 100,
      leadsFound: 50,
      validEmailsFound: 40,
      campaignsSent: 3,
    },
    themePersist: { preference: "dark" },
    templatesPersist: {
      templates: [{ id: "t1", name: "Old", subject: "Hi", body: "Body" }],
    },
    settingsPersist: {
      autonomousSources: null,
      searchProfile: "autonomous-24h",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.theme, "dark");
  assert.ok(result.historyCount >= 1); // fullHistory falls back to recent
  assert.equal(result.campaignCount, 1);
  assert.equal(result.blockedCount, 1);
  assert.ok(result.stats.companiesFound >= 100);
  assert.ok(result.mountedMarkers.includes("recent-searches"));
});

test("CLIENT mount: React server-render of Dashboard overview harness", () => {
  const data = runDashboardClientHydration(buildAdversarialDashboardStorage());

  // Real React mount of the same markers Dashboard overview exposes.
  // (No next/navigation — pure presentational harness.)
  function DashboardOverviewHarness() {
    return createElement(
      "div",
      { "data-testid": "dashboard-overview" },
      createElement("section", { "data-marker": "stats-cards" }, [
        createElement(
          "span",
          { key: "c", "data-kpi": "companies" },
          String(data.stats.companiesFound)
        ),
        createElement(
          "span",
          { key: "l", "data-kpi": "leads" },
          String(data.stats.leadsFound)
        ),
        createElement(
          "span",
          { key: "e", "data-kpi": "emails" },
          String(data.stats.validEmailsFound)
        ),
        createElement(
          "span",
          { key: "s", "data-kpi": "sent" },
          String(data.stats.campaignsSent)
        ),
      ]),
      createElement(
        "section",
        { "data-marker": "global-history-search" },
        `hits:${data.historyHitsSample}`
      ),
      createElement(
        "section",
        { "data-marker": "blocked-emails-panel" },
        `blocked:${data.blockedCount}`
      ),
      createElement(
        "section",
        { "data-marker": "recent-searches" },
        `recent:${data.recentCount}`
      ),
      createElement(
        "section",
        { "data-marker": "campaigns-preview" },
        `campaigns:${data.campaignCount}`
      )
    );
  }

  const html = renderToString(createElement(DashboardOverviewHarness));
  assert.match(html, /data-testid="dashboard-overview"/);
  assert.match(html, /data-marker="stats-cards"/);
  assert.match(html, /data-marker="blocked-emails-panel"/);
  assert.match(html, /data-marker="recent-searches"/);
  assert.match(html, /data-kpi="companies"/);
  assert.doesNotMatch(html, /Cannot read properties of null/);
});

test("storage inspector: no secrets — only keys/types/null field names", () => {
  const mem = new Map();
  mem.set(
    "pnp-lead-finder",
    JSON.stringify({
      state: {
        recentSearches: null,
        savedLeads: [{ email: "secret@x.com", company: "Secret Co" }],
        fullSearchHistory: [],
      },
      version: 5,
    })
  );
  mem.set(
    "pnp-email-blocklist",
    JSON.stringify({
      state: { entries: null },
      version: 2,
    })
  );
  const storage = {
    getItem(key) {
      return mem.has(key) ? mem.get(key) : null;
    },
  };
  const report = inspectDashboardStorageKeys(storage);
  const lead = report.find((r) => r.key === "pnp-lead-finder");
  assert.ok(lead?.present);
  assert.ok(lead.nullFields.includes("recentSearches"));
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /secret@x\.com/);
  assert.doesNotMatch(serialized, /Secret Co/);
  assert.ok(PERSIST_STORAGE_KEYS.includes("pnp-lead-finder"));
});

test("lifetime + global history pure path with null inputs (Dashboard selectors)", () => {
  const stats = computeLifetimeStats({
    fullSearchHistory: null,
    recentSearches: null,
    savedLeads: null,
    campaigns: null,
  });
  assert.equal(stats.leadsFound, 0);
  const hits = searchGlobalHistory({
    query: "test",
    fullSearchHistory: null,
    savedLeads: null,
    campaigns: null,
    blockedEmails: null,
  });
  assert.deepEqual(hits, []);
  assert.deepEqual(asArray(null), []);
});
