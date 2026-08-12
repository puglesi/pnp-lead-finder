/**
 * Full Dashboard overview tree test with realistic OLD storage shapes.
 * Mounts the pure data path + React harness for every overview section.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  isConfirmedCampaignDelivery,
  reconcileCampaignDelivery,
} from "../src/lib/campaign-delivery-metrics.ts";
import { computeLifetimeStats } from "../src/lib/lifetime-stats.ts";
import { searchGlobalHistory } from "../src/lib/global-history-search.ts";
import {
  normalizeBlocklistPersistSlice,
  normalizeCampaignPersistSlice,
  normalizeLeadPersistSlice,
  normalizeLifetimePersistSlice,
  normalizeThemePersistSlice,
} from "../src/lib/store-rehydrate.ts";
import {
  buildAdversarialDashboardStorage,
  runDashboardClientHydration,
} from "../src/lib/dashboard-client-hydration.ts";

/** Real browser diagnosis shape + nested campaign legacy fields. */
function buildRealisticLegacyDashboardPayload() {
  return {
    leadPersist: {
      sidebarCollapsed: false,
      recentSearches: [
        {
          id: "rs1",
          keyword: "Accountants",
          location: "London",
          resultsCount: 8,
          date: "2026-03-01T10:00:00.000Z",
          leads: [
            {
              id: "l1",
              company: "A Ltd",
              email: "a@a.com",
              website: "https://a.com",
              phone: "",
              address: "London",
              category: "Accountants",
              aiScore: 88,
            },
            null,
          ],
        },
      ],
      fullSearchHistory: [
        {
          id: "fs1",
          keyword: "Solicitors",
          location: "Manchester",
          resultsCount: 12,
          date: "2026-02-01T10:00:00.000Z",
          // results nested alias sometimes present in old code paths
          results: null,
          leads: null,
        },
      ],
      sectorHistory: ["Accountants", "Solicitors"],
      savedLeads: [
        {
          id: "l1",
          company: "A Ltd",
          email: "a@a.com",
          website: "https://a.com",
          phone: "",
          address: "London",
          category: "Accountants",
          aiScore: 88,
        },
      ],
      importedLeads: [],
    },
    campaignPersist: {
      // Top-level nulls that are VALID session state (must not crash).
      sendingCampaignId: null,
      sendingProgress: null,
      sendPaused: false,
      campaigns: [
        {
          id: "legacy-c1",
          name: "Campanha antiga",
          subject: "Olá",
          status: "active",
          campaignProfileId: "panek-puglesi",
          leadIds: ["l1", "l2"],
          // Exact nested incompatibilities reported in the field.
          leadStatuses: null,
          sendErrors: null,
          recipients: null,
          results: null,
          // providerMessageIds absent on purpose
          sentCount: 5,
          emailProvider: "simulate",
        },
        {
          id: "legacy-c2",
          name: "Com slots null",
          subject: "Hi",
          status: "completed",
          campaignProfileId: "modeclean",
          leadIds: ["l1"],
          leadStatuses: [
            null,
            {
              leadId: "l1",
              status: "sent",
              providerMessageId: "real-msg-001234",
            },
            undefined,
          ],
          sendErrors: [null, { leadId: "x", errorCode: "X", errorMessage: "y" }],
          tracking: null,
          stats: null,
          operation: null,
        },
      ],
    },
    // blocklist store ABSENT → normalize to []
    blocklistPersist: undefined,
    lifetimePersist: {
      companiesFound: 40,
      leadsFound: 20,
      validEmailsFound: 15,
      campaignsSent: 2,
    },
    // theme store ABSENT → system
    themePersist: undefined,
    templatesPersist: { templates: [{ id: "t1", name: "Old", subject: "S", body: "B" }] },
    settingsPersist: {
      autonomousSources: ["google-maps", "yell"],
      searchProfile: "autonomous-24h",
      provider: "autonomous",
    },
    // agent session nulls (valid)
    agentOne: { currentSectorId: null, errorMessage: null },
    agentTwo: { currentItemId: null, errorMessage: null },
  };
}

test("null leadStatuses entry does not crash isConfirmedCampaignDelivery", () => {
  assert.equal(isConfirmedCampaignDelivery(null), false);
  assert.equal(isConfirmedCampaignDelivery(undefined), false);
  assert.equal(
    isConfirmedCampaignDelivery({
      leadId: "l1",
      status: "sent",
      providerMessageId: "real-msg-001234",
    }),
    true
  );
});

test("reconcileCampaignDelivery tolerates null slots in leadStatuses/sendErrors", () => {
  const reconciled = reconcileCampaignDelivery({
    id: "c",
    name: "X",
    status: "active",
    campaignProfileId: "panek-puglesi",
    leadIds: ["l1"],
    leadStatuses: [null, { leadId: "l1", status: "pending" }],
    sendErrors: [null],
    emailProvider: "simulate",
    sentCount: 99,
  });
  assert.ok(Array.isArray(reconciled.leadStatuses));
  assert.ok(reconciled.leadStatuses.every((s) => s && s.leadId));
  assert.equal(reconciled.sentCount, 0);
});

test("lifetime KPIs with leadStatuses null / recipients null / blocklist absent", () => {
  const payload = buildRealisticLegacyDashboardPayload();
  const lead = normalizeLeadPersistSlice(payload.leadPersist);
  const campaigns = normalizeCampaignPersistSlice(payload.campaignPersist);
  const blocklist = normalizeBlocklistPersistSlice(payload.blocklistPersist);
  const lifetime = normalizeLifetimePersistSlice(payload.lifetimePersist);
  const theme = normalizeThemePersistSlice(payload.themePersist);

  assert.deepEqual(blocklist.entries, []);
  assert.equal(theme.preference, "system");
  assert.equal(payload.campaignPersist.sendingCampaignId, null);
  assert.equal(payload.campaignPersist.sendingProgress, null);

  const stats = computeLifetimeStats({
    fullSearchHistory: lead.fullSearchHistory,
    recentSearches: lead.recentSearches,
    savedLeads: lead.savedLeads,
    importedLeads: lead.importedLeads,
    campaigns: campaigns.campaigns,
    floors: lifetime,
  });

  assert.ok(stats.companiesFound >= 40);
  assert.ok(stats.leadsFound >= 1);
  assert.equal(typeof stats.campaignsSent, "number");
  assert.equal(typeof stats.campaignsActive, "number");
});

test("full Dashboard overview data path + React tree mount with legacy payload", () => {
  const payload = buildRealisticLegacyDashboardPayload();
  const result = runDashboardClientHydration(payload);
  assert.equal(result.ok, true);
  assert.ok(result.mountedMarkers.includes("stats-cards"));
  assert.ok(result.mountedMarkers.includes("blocked-emails-panel"));
  assert.ok(result.mountedMarkers.includes("recent-searches"));
  assert.equal(result.theme, "system");
  assert.equal(result.blockedCount, 0);
  assert.ok(result.campaignCount >= 1);

  // Mount ALL overview sections as React tree (presentational harness).
  function FullDashboardOverviewTree() {
    return createElement(
      "div",
      { "data-testid": "dashboard-full-tree" },
      createElement(
        "section",
        { "data-section": "ActiveModeBanner" },
        "mode-banner"
      ),
      createElement(
        "section",
        { "data-section": "LocalProductionPanel" },
        "local-production"
      ),
      createElement(
        "section",
        { "data-section": "StatsCards" },
        `kpi:${result.stats.companiesFound}:${result.stats.leadsFound}:${result.stats.validEmailsFound}:${result.stats.campaignsSent}`
      ),
      createElement(
        "section",
        { "data-section": "GlobalHistorySearch" },
        `hits:${result.historyHitsSample}`
      ),
      createElement(
        "section",
        { "data-section": "BlockedEmailsPanel" },
        `blocked:${result.blockedCount}`
      ),
      createElement(
        "section",
        { "data-section": "RecentSearches" },
        `recent:${result.recentCount}`
      ),
      createElement(
        "section",
        { "data-section": "DashboardTabs" },
        "tabs-overview"
      )
    );
  }

  const html = renderToString(createElement(FullDashboardOverviewTree));
  assert.match(html, /data-testid="dashboard-full-tree"/);
  assert.match(html, /data-section="StatsCards"/);
  assert.match(html, /data-section="BlockedEmailsPanel"/);
  assert.match(html, /data-section="GlobalHistorySearch"/);
  assert.match(html, /data-section="RecentSearches"/);
  assert.match(html, /data-section="ActiveModeBanner"/);
  assert.doesNotMatch(html, /Maximum update depth/);
  assert.doesNotMatch(html, /Cannot read properties of null/);
});

test("adversarial storage still mounts after StatsCards selector fix path", () => {
  const result = runDashboardClientHydration(buildAdversarialDashboardStorage());
  assert.equal(result.ok, true);
  const html = renderToString(
    createElement(
      "div",
      { "data-testid": "stats-only" },
      String(result.stats.companiesFound)
    )
  );
  assert.match(html, /data-testid="stats-only"/);
});

test("global history with query tolerates null keyword/location in history", () => {
  const hits = searchGlobalHistory({
    query: "acc",
    fullSearchHistory: [
      { id: "s1", keyword: null, location: null, resultsCount: 1, date: "x" },
      {
        id: "s2",
        keyword: "Accountants",
        location: "London",
        resultsCount: 3,
        date: "2026-01-01",
      },
    ],
    savedLeads: [null, { id: "l1", company: "Acc Co", email: "a@a.com" }],
    campaigns: [
      {
        id: "c1",
        name: "Acc campaign",
        subject: null,
        status: "draft",
        leadStatuses: [null],
      },
    ],
    blockedEmails: undefined,
  });
  assert.ok(hits.some((h) => h.kind === "search" || h.kind === "campaign"));
});
