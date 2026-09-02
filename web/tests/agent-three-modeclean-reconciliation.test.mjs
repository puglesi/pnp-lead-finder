import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialAgentThreeSnapshot,
  normalizeAgentThreeSnapshot,
  retryAgentThreeItem,
} from "../src/lib/agent-three-queue.ts";
import { reconcileAgentThreeOperation } from "../src/lib/agent-three-reconciliation.ts";

const CAMPAIGN_ID = "modeclean-reconciliation-campaign";
const baseTime = "2026-08-27T17:31:18.840Z";
const providerId = (index) => `<modeclean-provider-${index}@gmail.com>`;
const queueId = (index) =>
  `modeclean-queue-${String(index).padStart(3, "0")}`;

function item(index) {
  const email = `recipient-${index}@example.test`;
  return {
    id: queueId(index),
    leadId: `modeclean-lead-${index}`,
    campaignProfileId: "modeclean",
    campaignId: CAMPAIGN_ID,
    companyName: `Company ${index}`,
    originalEmail: email,
    normalizedEmail: email,
    sector: "accounting",
    location: "London",
    validationStatus: "valid",
    validationReason: "confirmed",
    queueStatus: "ready",
    createdAt: baseTime,
    updatedAt: baseTime,
    attemptCount: 0,
  };
}

function modecleanSnapshot() {
  const snapshot = createInitialAgentThreeSnapshot();
  snapshot.selectedProfileId = "modeclean";
  snapshot.operations.modeclean = {
    ...snapshot.operations.modeclean,
    status: "paused",
    currentCampaignId: CAMPAIGN_ID,
    queue: Array.from({ length: 165 }, (_, index) => item(index)),
  };
  return snapshot;
}

const confirmedHistory = Array.from({ length: 134 }, (_, index) => ({
  id: `intent-${index}`,
  campaignId: CAMPAIGN_ID,
  leadId: `modeclean-lead-${index}`,
  email: `recipient-${index}@example.test`,
  operation: "modeclean",
  queueItemId: queueId(index),
  providerMessageId: providerId(index),
  confirmedAt: `2026-08-27T17:40:${String(index % 60).padStart(2, "0")}.000Z`,
  status: "confirmed",
}));

const failedAuthHistory = {
  id: "intent-ajm-financial",
  campaignId: CAMPAIGN_ID,
  leadId: "modeclean-lead-134",
  email: "andrew@ajmfinancial.co.uk",
  operation: "modeclean",
  queueItemId: queueId(134),
  providerMessageId: null,
  attemptedAt: "2026-08-27T17:48:50.735Z",
  confirmedAt: null,
  status: "failed",
  error: "SMTP não autenticado — verifique usuário e senha de app no servidor.",
};

test("Modeclean A/B/D: 134 confirmed, failed_auth terminal e 30 ready", () => {
  const originalIds = modecleanSnapshot().operations.modeclean.queue.map(
    (entry) => entry.id
  );
  const result = reconcileAgentThreeOperation(
    modecleanSnapshot(),
    "modeclean",
    [...confirmedHistory, failedAuthHistory],
    "2026-08-27T18:00:00.000Z"
  );
  const operation = result.snapshot.operations.modeclean;
  const counts = operation.queue.reduce((acc, entry) => {
    acc[entry.queueStatus] = (acc[entry.queueStatus] ?? 0) + 1;
    return acc;
  }, {});

  assert.deepEqual(counts, { sent: 134, failed_auth: 1, ready: 30 });
  assert.equal(operation.status, "paused");
  assert.equal(result.confirmedCount, 134);
  assert.equal(result.failedCount, 1);
  assert.equal(result.unknownCount, 0);
  assert.deepEqual(
    operation.queue.map((entry) => entry.id),
    originalIds,
    "queueItemIds must not be recreated"
  );
  assert.equal(operation.queue[134].providerMessageId, undefined);
  assert.equal(operation.queue[0].providerMessageId, providerId(0));
});

test("Modeclean C/E: failed_auth não volta para ready após reload nem retry automático", () => {
  const reconciled = reconcileAgentThreeOperation(
    modecleanSnapshot(),
    "modeclean",
    [...confirmedHistory, failedAuthHistory],
    "2026-08-27T18:00:00.000Z"
  ).snapshot;
  const reloaded = normalizeAgentThreeSnapshot(reconciled);
  assert.equal(reloaded.operations.modeclean.queue[134].queueStatus, "failed_auth");
  const afterRetryAttempt = retryAgentThreeItem(
    reloaded,
    "modeclean",
    queueId(134),
    "2026-08-27T18:01:00.000Z"
  );
  assert.equal(afterRetryAttempt.operations.modeclean.queue[134].queueStatus, "failed_auth");
});

test("Modeclean F: reconciliação é zero-SMTP/zero-SerpAPI", () => {
  const source = String(reconcileAgentThreeOperation);
  assert.equal(source.includes("sendMail"), false);
  assert.equal(source.includes("serpapi.com"), false);
});
