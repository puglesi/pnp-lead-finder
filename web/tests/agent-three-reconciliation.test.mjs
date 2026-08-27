import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  claimNextAgentThreeItem,
  createInitialAgentThreeSnapshot,
  loadAgentThreeLeads,
  normalizeAgentThreeSnapshot,
  resumeAgentThree,
  selectAgentThreeCampaign,
  startAgentThree,
} from "../src/lib/agent-three-queue.ts";
import { applyAgentThreeSmtpResult } from "../src/lib/agent-three-delivery.ts";
import {
  decideRunnerContinuation,
  isConfirmedSendRecord,
  isConfirmedSmtpDelivery,
  matchPersistedSend,
  persistCampaignAfterConfirmedSend,
  reconcileAgentThreeOperation,
  reconcileCampaignFromSendHistory,
  shouldSkipSmtpForItem,
} from "../src/lib/agent-three-reconciliation.ts";
import {
  AgentThreeTimeoutError,
  isAgentThreeHeartbeatStale,
  withTimeout,
} from "../src/lib/agent-three-timeouts.ts";
import { sendAgentThreeSmtp } from "../src/lib/server/agent-three-smtp-core.ts";
import { assertNoCommercialDatabaseAccess } from "./helpers/commercial-database-guard.mjs";

assertNoCommercialDatabaseAccess(import.meta.url);

const now = "2026-08-26T17:14:24.192Z";
const later = "2026-08-26T17:20:00.000Z";
const CAMPAIGN_ID = "fixture-reconciliation-campaign";
const QUEUE_IDS = Array.from({ length: 5 }, (_, index) =>
  `fixture-reconciliation-queue-${index + 1}`
);
const LEAD_IDS = Array.from({ length: 5 }, (_, index) =>
  `fixture-reconciliation-lead-${index + 1}`
);
const EMAILS = Array.from({ length: 5 }, (_, index) =>
  `recipient-${index + 1}@example.test`
);
const PROVIDER_MESSAGE_IDS = [
  "<fixture-provider-message-1@example.test>",
  "<fixture-provider-message-2@example.test>",
];

const confirmedRecords = [
  {
    id: "fixture-send-intent-1",
    campaignId: CAMPAIGN_ID,
    leadId: LEAD_IDS[0],
    email: EMAILS[0],
    operation: "panek-puglesi",
    queueItemId: QUEUE_IDS[0],
    providerMessageId: PROVIDER_MESSAGE_IDS[0],
    confirmedAt: "2026-08-26T17:14:24.192Z",
    status: "confirmed",
  },
  {
    id: "fixture-send-intent-2",
    campaignId: CAMPAIGN_ID,
    leadId: LEAD_IDS[1],
    email: EMAILS[1],
    operation: "panek-puglesi",
    queueItemId: QUEUE_IDS[1],
    providerMessageId: PROVIDER_MESSAGE_IDS[1],
    confirmedAt: "2026-08-26T17:14:24.656Z",
    status: "confirmed",
  },
];

function lead(id, email) {
  return {
    id,
    company: id,
    website: "https://example.test",
    email,
    phone: "",
    address: "London",
    category: "dentist",
    aiScore: 80,
    emailValidationStatus: "valid",
    emailValidationReason: "confirmed",
    normalizedEmail: email,
    synthetic: false,
    emailIsGuessed: false,
    emailSourceUrl: "https://example.test/contact",
    emailDiscoveryMethod: "website_contact",
  };
}

function loadedSnapshot() {
  const selected = selectAgentThreeCampaign(
    createInitialAgentThreeSnapshot(),
    "panek-puglesi",
    CAMPAIGN_ID,
    now
  );
  const loaded = loadAgentThreeLeads(
    selected,
    "panek-puglesi",
    CAMPAIGN_ID,
    [
      ...LEAD_IDS.map((leadId, index) => lead(leadId, EMAILS[index])),
    ],
    5,
    now
  ).snapshot;
  loaded.operations["panek-puglesi"].queue = loaded.operations[
    "panek-puglesi"
  ].queue.map((item, index) => ({ ...item, id: QUEUE_IDS[index] }));
  return loaded;
}

test("A: SMTP sucesso + updateCampaign falha mantém SENT_CONFIRMED", async () => {
  let snapshot = loadedSnapshot();
  snapshot = startAgentThree(snapshot, "panek-puglesi", true, now).snapshot;
  const claimed = claimNextAgentThreeItem(snapshot, "panek-puglesi", now);
  const smtpResult = {
    status: "sent",
    message: "E-mail enviado.",
    messageId: PROVIDER_MESSAGE_IDS[0],
  };
  const applied = applyAgentThreeSmtpResult(
    claimed.snapshot,
    "panek-puglesi",
    claimed.item.id,
    smtpResult,
    now
  );
  const persist = await persistCampaignAfterConfirmedSend(() => {
    throw new Error("Banco local indisponível — ações que alteram dados e envios estão bloqueadas.");
  });
  assert.equal(persist.ok, false);
  assert.equal(applied.snapshot.operations["panek-puglesi"].queue[0].queueStatus, "sent");
  assert.equal(
    applied.snapshot.operations["panek-puglesi"].queue[0].providerMessageId,
    PROVIDER_MESSAGE_IDS[0]
  );
  assert.equal(isConfirmedSmtpDelivery(smtpResult), true);
  const next = decideRunnerContinuation({
    confirmed: true,
    campaignPersistFailed: true,
    shouldPause: false,
    hasReady: true,
  });
  assert.equal(next, "continue");
});

test("B: SMTP sucesso + falha de UI não duplica", () => {
  const item = {
    id: QUEUE_IDS[0],
    leadId: LEAD_IDS[0],
    campaignId: CAMPAIGN_ID,
    campaignProfileId: "panek-puglesi",
    normalizedEmail: EMAILS[0],
    originalEmail: EMAILS[0],
    queueStatus: "ready",
  };
  const first = shouldSkipSmtpForItem(item, confirmedRecords);
  const second = shouldSkipSmtpForItem(
    { ...item, queueStatus: "sending" },
    confirmedRecords
  );
  assert.equal(first.providerMessageId, confirmedRecords[0].providerMessageId);
  assert.equal(second.providerMessageId, confirmedRecords[0].providerMessageId);
});

test("C: reload READY no client mas confirmed no SQLite vira SENT_CONFIRMED", () => {
  let snapshot = loadedSnapshot();
  snapshot.operations["panek-puglesi"].queue = snapshot.operations["panek-puglesi"].queue.map(
    (item) => ({
      ...item,
      queueStatus: "ready",
    })
  );
  const result = reconcileAgentThreeOperation(
    snapshot,
    "panek-puglesi",
    confirmedRecords,
    later
  );
  const queue = result.snapshot.operations["panek-puglesi"].queue;
  assert.equal(queue[0].queueStatus, "sent");
  assert.equal(queue[1].queueStatus, "sent");
  assert.equal(queue[2].queueStatus, "ready");
  assert.equal(shouldSkipSmtpForItem(queue[0], confirmedRecords) !== null, true);
});

test("D: restart SENDING + confirmed history vira sent", () => {
  let snapshot = loadedSnapshot();
  snapshot = startAgentThree(snapshot, "panek-puglesi", true, now).snapshot;
  const claimed = claimNextAgentThreeItem(snapshot, "panek-puglesi", now);
  const result = reconcileAgentThreeOperation(
    claimed.snapshot,
    "panek-puglesi",
    confirmedRecords,
    later
  );
  assert.equal(result.snapshot.operations["panek-puglesi"].queue[0].queueStatus, "sent");
});

test("E: restart SENDING sem prova vira UNKNOWN sem retry", () => {
  let snapshot = loadedSnapshot();
  snapshot = startAgentThree(snapshot, "panek-puglesi", true, now).snapshot;
  const claimed = claimNextAgentThreeItem(snapshot, "panek-puglesi", now);
  const restored = normalizeAgentThreeSnapshot(structuredClone(claimed.snapshot));
  assert.equal(restored.operations["panek-puglesi"].queue[0].queueStatus, "unknown");
  const resumed = resumeAgentThree(restored, "panek-puglesi", true, later);
  assert.notEqual(resumed.snapshot.operations["panek-puglesi"].queue[0].queueStatus, "ready");
  const next = claimNextAgentThreeItem(resumed.snapshot, "panek-puglesi", later);
  assert.notEqual(next.item?.id, claimed.item.id);
});

test("F: falha de campaign persistence não mata os próximos", () => {
  const decision = decideRunnerContinuation({
    confirmed: true,
    campaignPersistFailed: true,
    shouldPause: true,
    hasReady: true,
  });
  assert.equal(decision, "continue");
});

test("G: runner always clears running flags in finally — source contract", () => {
  const source = readFileSync(
    new URL("../src/hooks/use-agent-three-runner.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /finally \{/);
  assert.match(source, /activeLoops\.current\.delete\(profileId\)/);
  assert.match(source, /persistCampaignAfterConfirmedSend/);
  assert.match(source, /reconcileProfile/);
});

test("H: heartbeat stale é detectado", () => {
  assert.equal(
    isAgentThreeHeartbeatStale("2026-08-26T17:14:23.237Z", "running", Date.parse("2026-08-26T18:02:00.000Z")),
    true
  );
  assert.equal(
    isAgentThreeHeartbeatStale("2026-08-26T17:14:23.237Z", "paused", Date.parse("2026-08-26T18:02:00.000Z")),
    false
  );
});

test("I: timeout não deixa promise pendurada", async () => {
  const hanging = new Promise(() => {});
  await assert.rejects(
    () => withTimeout(hanging, 20, "sendMail"),
    (error) => error instanceof AgentThreeTimeoutError
  );
});

test("J: SENT_CONFIRMED nunca chama SMTP outra vez", async () => {
  let smtpCalls = 0;
  const item = {
    id: QUEUE_IDS[0],
    leadId: LEAD_IDS[0],
    campaignId: CAMPAIGN_ID,
    campaignProfileId: "panek-puglesi",
    normalizedEmail: EMAILS[0],
    originalEmail: EMAILS[0],
    queueStatus: "sent",
    providerMessageId: confirmedRecords[0].providerMessageId,
  };
  const skip = shouldSkipSmtpForItem(item, confirmedRecords);
  if (!skip) smtpCalls += 1;
  assert.equal(smtpCalls, 0);
  const mock = {
    environment: { AGENT3_REAL_SEND_ENABLED: "false" },
    createTransport() {
      smtpCalls += 1;
      return { async sendMail() { return { messageId: "x" }; } };
    },
  };
  if (!shouldSkipSmtpForItem(item, confirmedRecords)) {
    await sendAgentThreeSmtp(
      {
        operation: "panek-puglesi",
        recipient: EMAILS[0],
        subject: "x",
        campaignId: CAMPAIGN_ID,
        leadId: item.leadId,
        queueItemId: item.id,
      },
      mock
    );
  }
  assert.equal(smtpCalls, 0);
});

test("K: providerMessageId obrigatório para confirmed", () => {
  assert.equal(
    isConfirmedSendRecord({
      ...confirmedRecords[0],
      providerMessageId: "",
    }),
    false
  );
  assert.equal(isConfirmedSendRecord(confirmedRecords[0]), true);
  assert.equal(isConfirmedSmtpDelivery({ status: "sent" }), false);
  assert.equal(
    isConfirmedSmtpDelivery({
      status: "sent",
      messageId: confirmedRecords[0].providerMessageId,
    }),
    true
  );
});

test("L: fixture stale reconcilia 2 confirmed / 3 ready sem banco externo", () => {
  const staleSnapshot = loadedSnapshot();
  const staleOperation = staleSnapshot.operations["panek-puglesi"];
  staleOperation.status = "paused";
  staleOperation.processedCount = 0;
  staleOperation.queue = staleOperation.queue.map((item) => ({
    ...item,
    queueStatus: "ready",
    providerMessageId: undefined,
    sentAt: undefined,
  }));

  const result = reconcileAgentThreeOperation(
    staleSnapshot,
    "panek-puglesi",
    confirmedRecords,
    later
  );
  const operation = result.snapshot.operations["panek-puglesi"];
  const counts = operation.queue.reduce((acc, item) => {
    acc[item.queueStatus] = (acc[item.queueStatus] || 0) + 1;
    return acc;
  }, {});

  assert.equal(operation.queue.length, 5);
  assert.equal(counts.sent, 2);
  assert.equal(counts.ready, 3);
  assert.equal(counts.sending || 0, 0);
  assert.equal(operation.status, "paused");
  assert.deepEqual(operation.queue.map((item) => item.id), QUEUE_IDS);
  assert.deepEqual(
    operation.queue.slice(0, 2).map((item) => item.providerMessageId),
    PROVIDER_MESSAGE_IDS
  );
  assert.equal(operation.processedCount, 2);
  assert.equal(result.confirmedCount, 2);
});

test("M: zero emails reais nesta suíte", () => {
  const source = readFileSync(
    new URL("../src/lib/agent-three-reconciliation.ts", import.meta.url),
    "utf8"
  );
  assert.equal(source.includes("nodemailer"), false);
  assert.equal(source.includes("sendMail"), false);
});

test("N: zero SerpAPI real nesta suíte", () => {
  const source = readFileSync(
    new URL("../src/lib/agent-three-reconciliation.ts", import.meta.url),
    "utf8"
  );
  assert.equal(source.toLowerCase().includes("serpapi.com"), false);
  assert.equal(source.includes("executeSearch"), false);
});

test("matchPersistedSend usa queueItemId e não recria ids", () => {
  const item = {
    id: QUEUE_IDS[0],
    leadId: LEAD_IDS[0],
    campaignId: CAMPAIGN_ID,
    campaignProfileId: "panek-puglesi",
    normalizedEmail: EMAILS[0],
    originalEmail: EMAILS[0],
  };
  assert.equal(matchPersistedSend(item, confirmedRecords).queueItemId, QUEUE_IDS[0]);
});

test("campaign reconciliation preenche sentCount a partir do history", () => {
  const campaign = reconcileCampaignFromSendHistory(
    {
      id: CAMPAIGN_ID,
      campaignProfileId: "panek-puglesi",
      leadIds: LEAD_IDS,
      leadStatuses: LEAD_IDS.map((leadId) => ({ leadId, status: "pending" })),
      sentCount: 0,
      failedCount: 0,
    },
    confirmedRecords
  );
  assert.equal(campaign.sentCount, 2);
  assert.equal(campaign.failedCount, 0);
  assert.equal(campaign.leadStatuses[0].status, "sent");
  assert.equal(
    campaign.leadStatuses[0].providerMessageId,
    confirmedRecords[0].providerMessageId
  );
});
