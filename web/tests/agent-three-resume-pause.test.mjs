import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  claimNextAgentThreeItem,
  configureAgentThreeLimit,
  createInitialAgentThreeSnapshot,
  loadAgentThreeLeads,
  pauseAgentThree,
  resumeAgentThree,
  selectAgentThreeCampaign,
  startAgentThree,
} from "../src/lib/agent-three-queue.ts";
import { applyAgentThreeSmtpResult } from "../src/lib/agent-three-delivery.ts";
import {
  reconcileAgentThreeOperation,
  shouldPauseRunningQueueForUnresolvedItems,
} from "../src/lib/agent-three-reconciliation.ts";
import { isAgentThreeHeartbeatStale } from "../src/lib/agent-three-timeouts.ts";
import { evaluateAgentThreePreflight } from "../src/lib/agent-three-preflight.ts";
import {
  fingerprintsMatch,
  PREVIEW_QUEUE_MISMATCH_MESSAGE,
  previewEligibleFingerprint,
  queueReadyFingerprint,
} from "../src/lib/eligibility-fingerprint.ts";
import { assertNoCommercialDatabaseAccess } from "./helpers/commercial-database-guard.mjs";

assertNoCommercialDatabaseAccess(import.meta.url);

const now = "2026-09-02T17:36:00.000Z";
const later = "2026-09-02T17:37:27.122Z";
const CAMPAIGN_ID = "camp-current-resume";
const OLD_CAMPAIGN_ID = "camp-1787841133377";

function lead(index) {
  return {
    id: `lead-${index}`,
    company: `Company ${index}`,
    website: `https://company-${index}.example`,
    email: `person-${index}@company-${index}.example`,
    normalizedEmail: `person-${index}@company-${index}.example`,
    phone: "",
    address: "London",
    category: "Medical",
    aiScore: 90,
    emailValidationStatus: "valid",
    emailValidationReason: "confirmed",
    hasMxRecords: true,
    emailSourceUrl: `https://company-${index}.example/contact`,
    emailDiscoveryMethod: "website_contact",
    emailIsGuessed: false,
    synthetic: false,
  };
}

function pausedWithReadyAndForeignUnknown() {
  const leads = [lead(1), lead(2), lead(3)];
  let snapshot = createInitialAgentThreeSnapshot();
  snapshot = selectAgentThreeCampaign(
    snapshot,
    "panek-puglesi",
    CAMPAIGN_ID,
    now
  );
  snapshot = configureAgentThreeLimit(
    snapshot,
    "panek-puglesi",
    50,
    true,
    now
  );
  const loaded = loadAgentThreeLeads(
    snapshot,
    "panek-puglesi",
    CAMPAIGN_ID,
    leads,
    3,
    now
  );
  snapshot = loaded.snapshot;
  const prepared = startAgentThree(snapshot, "panek-puglesi", true, now);
  snapshot = pauseAgentThree(prepared.snapshot, "panek-puglesi", now);
  const operation = snapshot.operations["panek-puglesi"];
  snapshot = {
    ...snapshot,
    operations: {
      ...snapshot.operations,
      "panek-puglesi": {
        ...operation,
        stopReason: "Motivo histórico transitório",
        lastActivityAt: "2026-08-01T00:00:00.000Z",
        processedCount: 0,
        queue: [
          ...operation.queue,
          {
            id: "agent-three-panek-puglesi-old-unknown",
            leadId: "old-lead",
            campaignProfileId: "panek-puglesi",
            campaignId: OLD_CAMPAIGN_ID,
            companyName: "Old",
            originalEmail: "admin@ortholongevity.co.uk",
            normalizedEmail: "admin@ortholongevity.co.uk",
            sector: "",
            location: "",
            validationStatus: "unknown",
            validationReason: "mailbox_not_verified",
            queueStatus: "unknown",
            createdAt: "2026-08-27T14:32:20.695Z",
            updatedAt: "2026-08-27T14:32:20.695Z",
            attemptCount: 1,
            errorMessage: "UNKNOWN_RECONCILIATION_REQUIRED",
          },
        ],
      },
    },
  };
  return snapshot;
}

test("A) paused + Resume + gates PASS → running", () => {
  const paused = pausedWithReadyAndForeignUnknown();
  const resumed = resumeAgentThree(paused, "panek-puglesi", true, later);
  assert.equal(resumed.started, true);
  const operation = resumed.snapshot.operations["panek-puglesi"];
  assert.equal(operation.status, "running");
  const ready = operation.queue.filter(
    (item) =>
      item.campaignId === CAMPAIGN_ID && item.queueStatus === "ready"
  );
  assert.equal(ready.length, 3);
  const claimed = claimNextAgentThreeItem(
    resumed.snapshot,
    "panek-puglesi",
    later
  );
  assert.ok(claimed.item);
  assert.equal(claimed.item.campaignId, CAMPAIGN_ID);
  assert.equal(claimed.snapshot.operations["panek-puglesi"].status, "running");
});

test("B) stopReason histórico não re-pausa no Resume nem no reconcile", () => {
  const paused = pausedWithReadyAndForeignUnknown();
  const resumed = resumeAgentThree(paused, "panek-puglesi", true, later);
  assert.equal(resumed.snapshot.operations["panek-puglesi"].stopReason, null);
  const reconciled = reconcileAgentThreeOperation(
    resumed.snapshot,
    "panek-puglesi",
    [],
    later
  );
  assert.equal(reconciled.snapshot.operations["panek-puglesi"].status, "running");
  assert.equal(
    shouldPauseRunningQueueForUnresolvedItems(
      reconciled.snapshot.operations["panek-puglesi"]
    ),
    false
  );
});

test("C) até acabar a lista ignora limite antigo de 50", () => {
  let snapshot = pausedWithReadyAndForeignUnknown();
  snapshot = {
    ...snapshot,
    operations: {
      ...snapshot.operations,
      "panek-puglesi": {
        ...snapshot.operations["panek-puglesi"],
        numericLimit: 50,
        untilQueueEnds: true,
        processedCount: 50,
      },
    },
  };
  const resumed = resumeAgentThree(snapshot, "panek-puglesi", true, later);
  const claimed = claimNextAgentThreeItem(
    resumed.snapshot,
    "panek-puglesi",
    later
  );
  assert.ok(claimed.item);
  assert.equal(resumed.snapshot.operations["panek-puglesi"].untilQueueEnds, true);
});

test("D) heartbeat antigo é resetado no Resume", () => {
  const paused = pausedWithReadyAndForeignUnknown();
  assert.equal(
    paused.operations["panek-puglesi"].lastActivityAt,
    "2026-08-01T00:00:00.000Z"
  );
  const resumed = resumeAgentThree(paused, "panek-puglesi", true, later);
  assert.equal(
    resumed.snapshot.operations["panek-puglesi"].lastActivityAt,
    later
  );
  assert.equal(
    isAgentThreeHeartbeatStale(
      resumed.snapshot.operations["panek-puglesi"].lastActivityAt,
      "running",
      Date.parse(later) + 1_000
    ),
    false
  );
});

test("E) novo authentication_error ainda pausa", () => {
  const paused = pausedWithReadyAndForeignUnknown();
  const resumed = resumeAgentThree(paused, "panek-puglesi", true, later);
  const claimed = claimNextAgentThreeItem(
    resumed.snapshot,
    "panek-puglesi",
    later
  );
  const applied = applyAgentThreeSmtpResult(
    claimed.snapshot,
    "panek-puglesi",
    claimed.item.id,
    {
      status: "authentication_error",
      message: "535 authentication failed",
    },
    later
  );
  assert.equal(applied.shouldPause, true);
  assert.equal(applied.snapshot.operations["panek-puglesi"].status, "paused");
});

test("F) novo DB unavailable ainda bloqueia o preflight", () => {
  const preflight = evaluateAgentThreePreflight({
    operation: "panek-puglesi",
    hasHydrated: true,
    officialSignature: {
      enabled: true,
      body: "<p>P&P</p>",
      operation: "panek-puglesi",
    },
    senderFromEmail: "outreach@example.test",
    campaign: {
      id: CAMPAIGN_ID,
      campaignProfileId: "panek-puglesi",
      subject: "Hello",
      body: "<p>Body</p>",
    },
    dbWritable: false,
    readyCount: 74,
    confirmedCount: 0,
    queueMatchesPreview: true,
  });
  assert.equal(preflight.ok, false);
  assert.match(preflight.errorMessage ?? "", /banco local/i);
});

test("G) fingerprint mismatch ainda bloqueia", () => {
  const preflight = evaluateAgentThreePreflight({
    operation: "panek-puglesi",
    hasHydrated: true,
    officialSignature: {
      enabled: true,
      body: "<p>P&P</p>",
      operation: "panek-puglesi",
    },
    senderFromEmail: "outreach@example.test",
    campaign: {
      id: CAMPAIGN_ID,
      campaignProfileId: "panek-puglesi",
      subject: "Hello",
      body: "<p>Body</p>",
    },
    dbWritable: true,
    readyCount: 74,
    confirmedCount: 0,
    queueMatchesPreview: false,
  });
  assert.equal(preflight.ok, false);
  assert.equal(preflight.errorMessage, PREVIEW_QUEUE_MISMATCH_MESSAGE);
  assert.equal(
    fingerprintsMatch(
      previewEligibleFingerprint({
        decisions: [
          { included: true, leadId: "a", normalizedEmail: "a@x.test" },
          { included: true, leadId: "b", normalizedEmail: "b@x.test" },
        ],
      }),
      queueReadyFingerprint([
        { leadId: "a", normalizedEmail: "a@x.test", queueStatus: "ready" },
      ])
    ),
    false
  );
});

test("H) nenhum sendMail no teste de Resume", () => {
  const source = readFileSync(
    new URL("../src/lib/agent-three-reconciliation.ts", import.meta.url),
    "utf8"
  );
  const runner = readFileSync(
    new URL("../src/hooks/use-agent-three-runner.ts", import.meta.url),
    "utf8"
  );
  assert.equal(source.includes("sendMail"), false);
  assert.equal(source.includes("nodemailer"), false);
  assert.match(runner, /shouldPauseRunningQueueForUnresolvedItems|currentCampaignId/);
  const paused = pausedWithReadyAndForeignUnknown();
  const idsBefore = paused.operations["panek-puglesi"].queue
    .filter((item) => item.campaignId === CAMPAIGN_ID)
    .map((item) => item.id);
  const resumed = resumeAgentThree(paused, "panek-puglesi", true, later);
  const idsAfter = resumed.snapshot.operations["panek-puglesi"].queue
    .filter((item) => item.campaignId === CAMPAIGN_ID)
    .map((item) => item.id);
  assert.deepEqual(idsAfter, idsBefore);
});
