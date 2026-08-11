import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isCampaignFullyDelivered,
  getCampaignEffectiveStatus,
  withCampaignCompletionStatus,
} from "../src/lib/campaign-completion.ts";
import {
  buildClearedLeadUiState,
  getClearUiPreserveContract,
  shouldSkipSessionUiReset,
  CLEAR_UI_TOAST,
} from "../src/lib/clear-ui-session.ts";
import { applyCampaignDeliveryReconciliation } from "../src/lib/campaign-metrics.ts";
import { getCampaignListViewStats } from "../src/lib/campaign-list-metrics.ts";
import { advancePipelineStage } from "../src/lib/lead-batch.ts";

function smtpStatus(leadId, status = "sent") {
  return {
    leadId,
    status,
    providerMessageId: `smtp-real-${leadId}`,
    sentAt: "2026-08-01T12:00:00.000Z",
  };
}

function campaign25of25(overrides = {}) {
  const leadIds = Array.from({ length: 25 }, (_, i) => `lead-${i}`);
  return {
    id: "camp-mortgage-25",
    name: "Mortgage Adviser London",
    status: "active",
    leadIds,
    leadStatuses: leadIds.map((id) => smtpStatus(id)),
    sentCount: 0,
    failedCount: 0,
    openedCount: 0,
    clickedCount: 0,
    repliedCount: 0,
    batchId: "batch-mortgage-99",
    emailProvider: "smtp",
    ...overrides,
  };
}

test("ui clean 1. app opens with clean form contract (no keyword/location restore)", () => {
  const leadStore = readFileSync(
    new URL("../src/store/lead-store.ts", import.meta.url),
    "utf8"
  );
  const batchStore = readFileSync(
    new URL("../src/store/batch-pipeline-store.ts", import.meta.url),
    "utf8"
  );
  // Session UI fields not partialized → Nova Busca opens empty
  const partializeBlock = leadStore.slice(
    leadStore.indexOf("partialize:"),
    leadStore.indexOf("partialize:") + 800
  );
  assert.equal(partializeBlock.includes("currentKeyword"), false);
  assert.equal(partializeBlock.includes("currentLocation"), false);
  assert.equal(partializeBlock.includes("currentLeads"), false);
  assert.equal(partializeBlock.includes("savedLeads"), true);
  assert.equal(partializeBlock.includes("fullSearchHistory"), true);
  // Active batch is session UI, batches are durable
  const batchPartial = batchStore.slice(
    batchStore.indexOf("partialize:"),
    batchStore.indexOf("partialize:") + 400
  );
  assert.equal(batchPartial.includes("activeBatchId"), false);
  assert.equal(batchPartial.includes("batches"), true);

  const cleared = buildClearedLeadUiState();
  assert.equal(cleared.currentKeyword, "");
  assert.equal(cleared.currentLocation, "");
  assert.equal(cleared.currentLeads.length, 0);
});

test("ui clean 2. clear button contract never lists durable data for deletion", () => {
  const preserved = getClearUiPreserveContract();
  for (const key of [
    "savedLeads",
    "fullSearchHistory",
    "campaigns",
    "batches",
    "settings",
    "smtp",
    "templates",
    "deliveryMetrics",
  ]) {
    assert.equal(preserved.includes(key), true, `must preserve ${key}`);
  }
  assert.equal(CLEAR_UI_TOAST.includes("preservados"), true);

  const navbar = readFileSync(
    new URL("../src/components/layout/navbar.tsx", import.meta.url),
    "utf8"
  );
  assert.equal(navbar.includes("Limpar interface"), true);
  assert.equal(navbar.includes("clearUiSessionState"), true);
  assert.equal(navbar.includes("CLEAR_UI_TOAST"), true);
});

test("ui clean 3. batchId / campaign deep links skip session wipe", () => {
  assert.equal(shouldSkipSessionUiReset("/agente-1", "batchId=batch-x"), true);
  assert.equal(shouldSkipSessionUiReset("/agente-2", "?batchId=abc"), true);
  assert.equal(
    shouldSkipSessionUiReset("/campanhas/camp-1", ""),
    true
  );
  assert.equal(shouldSkipSessionUiReset("/campanhas/nova", "batchId=b1"), true);
  assert.equal(shouldSkipSessionUiReset("/", ""), false);
  assert.equal(shouldSkipSessionUiReset("/busca", ""), false);
  assert.equal(shouldSkipSessionUiReset("/campanhas/nova", ""), false);
});

test("ui clean 4. campaign 25/25 SMTP → Concluída and not re-sendable", () => {
  const camp = campaign25of25();
  assert.equal(isCampaignFullyDelivered(camp), true);
  assert.equal(getCampaignEffectiveStatus(camp), "completed");

  const withStatus = withCampaignCompletionStatus(camp);
  assert.equal(withStatus.status, "completed");

  const reconciled = applyCampaignDeliveryReconciliation(camp);
  assert.equal(reconciled.status, "completed");
  assert.equal(reconciled.sentCount, 25);
  assert.equal(reconciled.failedCount, 0);

  const stats = getCampaignListViewStats([reconciled]);
  assert.equal(stats.completed, 1);
  assert.equal(stats.totalSent, 25);
});

test("ui clean 5. incomplete campaign stays non-completed", () => {
  const leadIds = Array.from({ length: 25 }, (_, i) => `lead-${i}`);
  const camp = campaign25of25({
    leadStatuses: [
      ...leadIds.slice(0, 10).map((id) => smtpStatus(id)),
      ...leadIds.slice(10).map((id) => ({ leadId: id, status: "pending" })),
    ],
    status: "active",
  });
  assert.equal(isCampaignFullyDelivered(camp), false);
  assert.equal(getCampaignEffectiveStatus(camp), "active");
  const reconciled = applyCampaignDeliveryReconciliation(camp);
  assert.equal(reconciled.status, "active");
  assert.equal(reconciled.sentCount, 10);
});

test("ui clean 6. pipeline advances to Envio concluído", () => {
  assert.equal(advancePipelineStage("send", "complete"), "complete");
  assert.equal(advancePipelineStage("complete", "send"), "complete");
  const types = readFileSync(
    new URL("../src/types/batch.ts", import.meta.url),
    "utf8"
  );
  assert.equal(types.includes("Envio concluído"), true);
  assert.equal(types.includes('"complete"'), true);
});

test("ui clean 7. Agent 3 blocks Start when campaign fully delivered", () => {
  const agent3 = readFileSync(
    new URL(
      "../src/components/agents/agent-three-sender.tsx",
      import.meta.url
    ),
    "utf8"
  );
  assert.equal(agent3.includes("isCampaignFullyDelivered"), true);
  assert.equal(agent3.includes("campaignFullyDelivered"), true);
  assert.equal(
    agent3.includes("Campanha concluída — destinatários já enviados") ||
      agent3.includes("todos os destinatários já foram enviados") ||
      agent3.includes("campaignCompleted") ||
      agent3.includes("describeAgentThreeStartBlock"),
    true
  );
});

test("ui clean 8. official path wiring remains (busca → a1 → a2 → campanha → a3)", () => {
  const shell = readFileSync(
    new URL("../src/components/layout/app-shell.tsx", import.meta.url),
    "utf8"
  );
  const indicator = readFileSync(
    new URL(
      "../src/components/pipeline/batch-pipeline-indicator.tsx",
      import.meta.url
    ),
    "utf8"
  );
  assert.equal(shell.includes("SessionUiBootstrap"), true);
  assert.equal(indicator.includes("garimpo"), true);
  assert.equal(indicator.includes("validation"), true);
  assert.equal(indicator.includes("complete"), true);
});
