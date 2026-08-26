import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
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

const now = "2026-08-26T17:14:24.192Z";
const later = "2026-08-26T17:20:00.000Z";
const REAL_DB = "C:/Users/Pugliese/Documents/pnp_lead_finder/data/pnp-lead-finder.sqlite";
const CASTELNAU_ID =
  "agent-three-panek-puglesi-camp-1787764449795-2026-08-26T17:14:14.585Z-0-serp-ChIJ07Rl_bIPdkgRIXt37CkX6-M";
const DENTISTRY_ID =
  "agent-three-panek-puglesi-camp-1787764449795-2026-08-26T17:14:14.585Z-1-serp-ChIJ1wCtu2UEdkgRntouC5-kNxY";
const READY_ID =
  "agent-three-panek-puglesi-camp-1787764449795-2026-08-26T17:14:14.585Z-2-serp-ChIJ2UHJgogNdkgRSGJazDdt8jA";

const confirmedRecords = [
  {
    id: "intent-5a16e25e-9037-4183-a8ac-c5acfe4f5ffc",
    campaignId: "camp-1787764449795",
    leadId: "serp-ChIJ07Rl_bIPdkgRIXt37CkX6-M",
    email: "info@castelnaudentists.com",
    operation: "panek-puglesi",
    queueItemId: CASTELNAU_ID,
    providerMessageId: "<e29263ca-9dbe-4c0e-ccb1-8250f538261b@gmail.com>",
    confirmedAt: "2026-08-26T17:14:24.192Z",
    status: "confirmed",
  },
  {
    id: "intent-fc113eb7-3090-4499-8686-2c6c767e3947",
    campaignId: "camp-1787764449795",
    leadId: "serp-ChIJ1wCtu2UEdkgRntouC5-kNxY",
    email: "support@dentistryforyou.co.uk",
    operation: "panek-puglesi",
    queueItemId: DENTISTRY_ID,
    providerMessageId: "<bc0d70ff-b0b7-d80e-7650-33d4eb2a1cf2@gmail.com>",
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
    "camp-1787764449795",
    now
  );
  return loadAgentThreeLeads(
    selected,
    "panek-puglesi",
    "camp-1787764449795",
    [
      lead("serp-ChIJ07Rl_bIPdkgRIXt37CkX6-M", "info@castelnaudentists.com"),
      lead("serp-ChIJ1wCtu2UEdkgRntouC5-kNxY", "support@dentistryforyou.co.uk"),
      lead("serp-ChIJ2UHJgogNdkgRSGJazDdt8jA", "info@pmcdental.uk"),
    ],
    50,
    now
  ).snapshot;
}

test("A: SMTP sucesso + updateCampaign falha mantém SENT_CONFIRMED", async () => {
  let snapshot = loadedSnapshot();
  snapshot = startAgentThree(snapshot, "panek-puglesi", true, now).snapshot;
  const claimed = claimNextAgentThreeItem(snapshot, "panek-puglesi", now);
  const smtpResult = {
    status: "sent",
    message: "E-mail enviado.",
    messageId: "<e29263ca-9dbe-4c0e-ccb1-8250f538261b@gmail.com>",
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
    "<e29263ca-9dbe-4c0e-ccb1-8250f538261b@gmail.com>"
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
    id: CASTELNAU_ID,
    leadId: "serp-ChIJ07Rl_bIPdkgRIXt37CkX6-M",
    campaignId: "camp-1787764449795",
    campaignProfileId: "panek-puglesi",
    normalizedEmail: "info@castelnaudentists.com",
    originalEmail: "info@castelnaudentists.com",
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
    (item, index) => ({
      ...item,
      id: index === 0 ? CASTELNAU_ID : index === 1 ? DENTISTRY_ID : item.id,
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
  claimed.snapshot.operations["panek-puglesi"].queue[0].id = CASTELNAU_ID;
  claimed.item.id = CASTELNAU_ID;
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
    id: CASTELNAU_ID,
    leadId: "serp-ChIJ07Rl_bIPdkgRIXt37CkX6-M",
    campaignId: "camp-1787764449795",
    campaignProfileId: "panek-puglesi",
    normalizedEmail: "info@castelnaudentists.com",
    originalEmail: "info@castelnaudentists.com",
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
        recipient: "info@castelnaudentists.com",
        subject: "x",
        campaignId: "camp-1787764449795",
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

test("L: fila atual 2 sent / 48 ready permanece intacta no SQLite real", () => {
  const db = new DatabaseSync(REAL_DB, { readOnly: true });
  try {
    const agent = JSON.parse(
      db.prepare("SELECT data_json FROM commercial_state WHERE store_key=?").get("pnp-agent-three").data_json
    );
    const op = agent.operations["panek-puglesi"];
    const counts = op.queue.reduce((acc, item) => {
      acc[item.queueStatus] = (acc[item.queueStatus] || 0) + 1;
      return acc;
    }, {});
    const sends = db.prepare("SELECT id, status, provider_message_id FROM send_history").all();
    assert.equal(op.queue.length, 50);
    assert.equal(counts.sent, 2);
    assert.equal(counts.ready, 48);
    assert.equal(counts.sending || 0, 0);
    assert.equal(op.status, "paused");
    assert.equal(op.queue[0].id, CASTELNAU_ID);
    assert.equal(op.queue[1].id, DENTISTRY_ID);
    assert.equal(op.queue[2].id, READY_ID);
    assert.equal(sends.length, 2);
    assert.equal(sends.every((row) => row.status === "confirmed"), true);
  } finally {
    db.close();
  }
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
    id: CASTELNAU_ID,
    leadId: "serp-ChIJ07Rl_bIPdkgRIXt37CkX6-M",
    campaignId: "camp-1787764449795",
    campaignProfileId: "panek-puglesi",
    normalizedEmail: "info@castelnaudentists.com",
    originalEmail: "info@castelnaudentists.com",
  };
  assert.equal(matchPersistedSend(item, confirmedRecords).queueItemId, CASTELNAU_ID);
});

test("campaign reconciliation preenche sentCount a partir do history", () => {
  const campaign = reconcileCampaignFromSendHistory(
    {
      id: "camp-1787764449795",
      campaignProfileId: "panek-puglesi",
      leadIds: [
        "serp-ChIJ07Rl_bIPdkgRIXt37CkX6-M",
        "serp-ChIJ1wCtu2UEdkgRntouC5-kNxY",
        "serp-ChIJ2UHJgogNdkgRSGJazDdt8jA",
      ],
      leadStatuses: [
        { leadId: "serp-ChIJ07Rl_bIPdkgRIXt37CkX6-M", status: "pending" },
        { leadId: "serp-ChIJ1wCtu2UEdkgRntouC5-kNxY", status: "pending" },
        { leadId: "serp-ChIJ2UHJgogNdkgRSGJazDdt8jA", status: "pending" },
      ],
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
