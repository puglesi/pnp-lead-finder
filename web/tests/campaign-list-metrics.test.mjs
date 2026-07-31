import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  countConfirmedSmtpSends,
  getCampaignListProgressPercent,
  getCampaignListViewStats,
  getCampaignsListTotalSent,
} from "../src/lib/campaign-list-metrics.ts";

function legacyCampaign(overrides = {}) {
  return {
    id: "nova-lista",
    name: "Nova lista",
    campaignProfileId: "panek-puglesi",
    emailProvider: "simulate",
    subject: "Assunto",
    body: "Corpo",
    leadIds: Array.from({ length: 98 }, (_, i) => `lead-${i}`),
    leadStatuses: Array.from({ length: 96 }, (_, i) => ({
      leadId: `lead-${i}`,
      status: i < 48 ? "sent" : "failed",
      // No real SMTP providerMessageId
      providerMessageId: i < 48 ? undefined : undefined,
      errorCode: i >= 48 ? "NOT_CONFIGURED" : undefined,
    })),
    // Legacy counters that the list page must ignore
    sentCount: 96,
    failedCount: 96,
    openedCount: 10,
    clickedCount: 5,
    repliedCount: 2,
    status: "active",
    ...overrides,
  };
}

test("lista /campanhas: sentCount legado 96 sem providerMessageId real ⇒ 0 enviados", () => {
  const campaign = legacyCampaign();
  assert.equal(campaign.sentCount, 96);
  assert.equal(countConfirmedSmtpSends(campaign), 0);
  assert.equal(getCampaignListProgressPercent(campaign), 0);
  assert.equal(getCampaignsListTotalSent([campaign, legacyCampaign({ id: "b" })]), 0);
});

test("lista /campanhas: progresso 98% legado (failed+sent) vira 0%", () => {
  const campaign = legacyCampaign({
    sentCount: 96,
    failedCount: 2,
  });
  // Old formula would be (96+2)/98 ≈ 100%; new formula is confirmed/total only.
  assert.equal(getCampaignListProgressPercent(campaign), 0);
});

test("lista /campanhas: stats de header ignoram sentCount e mostram 0", () => {
  const campaigns = [
    legacyCampaign({ id: "c1", name: "Nova lista" }),
    legacyCampaign({
      id: "c2",
      name: "Outra",
      leadIds: Array.from({ length: 10 }, (_, i) => `x-${i}`),
      leadStatuses: [],
      sentCount: 10,
    }),
  ];
  const stats = getCampaignListViewStats(campaigns);
  assert.equal(stats.total, 2);
  assert.equal(stats.totalSent, 0);
  assert.equal(stats.avgResponseRate, 0);
});

test("lista /campanhas: só conta envio com providerMessageId SMTP real", () => {
  const campaign = legacyCampaign({
    emailProvider: "smtp-gmail",
    leadStatuses: [
      {
        leadId: "lead-0",
        status: "sent",
        providerMessageId: "<real-smtp-message@smtp.gmail.com>",
      },
      {
        leadId: "lead-1",
        status: "sent",
        providerMessageId: "sim-fake",
      },
      {
        leadId: "lead-2",
        status: "sent",
      },
      {
        leadId: "lead-3",
        status: "failed",
        errorCode: "NOT_CONFIGURED",
      },
    ],
    leadIds: ["lead-0", "lead-1", "lead-2", "lead-3"],
    sentCount: 96,
  });
  assert.equal(countConfirmedSmtpSends(campaign), 1);
  assert.equal(getCampaignListProgressPercent(campaign), 25);
});

test("lista /campanhas: página e tabela usam campaign-list-metrics", () => {
  const page = readFileSync(
    new URL("../src/app/(dashboard)/campanhas/page.tsx", import.meta.url),
    "utf8"
  );
  const table = readFileSync(
    new URL("../src/components/campaigns/campaign-list-table.tsx", import.meta.url),
    "utf8"
  );
  assert.equal(page.includes("getCampaignListViewStats"), true);
  assert.equal(page.includes("normalizeLegacyDeliveryMetrics"), true);
  assert.equal(page.includes("enrichCampaignStats"), false);
  assert.equal(table.includes("countConfirmedSmtpSends"), true);
  assert.equal(table.includes("getCampaignListProgressPercent"), true);
  assert.equal(table.includes("campaign.sentCount"), false);
  assert.equal(table.includes("getSendProgress"), false);
});
