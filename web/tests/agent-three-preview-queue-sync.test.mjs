import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { auditGlobalEmailRecipients } from "../src/lib/global-email-deduplication.ts";
import { syncCampaignQueueToAuthoritativePreview } from "../src/lib/agent-three-eligibility-sync.ts";
import {
  fingerprintsMatch,
  PREVIEW_QUEUE_MISMATCH_MESSAGE,
  previewEligibleFingerprint,
  queueReadyFingerprint,
} from "../src/lib/eligibility-fingerprint.ts";
import { evaluateAgentThreePreflight } from "../src/lib/agent-three-preflight.ts";
import { assertNoCommercialDatabaseAccess } from "./helpers/commercial-database-guard.mjs";

assertNoCommercialDatabaseAccess(import.meta.url);

const at = "2026-09-02T10:00:00.000Z";
const CAMPAIGN_ID = "camp-current";

function readyLead(index) {
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
    emailValidationStatus: "unknown",
    emailValidationReason: "mailbox_not_verified",
    hasMxRecords: true,
    emailSourceUrl: `https://company-${index}.example/contact`,
    emailSourceType: "website_contact",
    emailDiscoveryMethod: "website_contact",
    emailIsGuessed: false,
    synthetic: false,
    sourceKind: "serpapi",
    locationMatch: "verified",
    requestedLocation: "",
  };
}

function recipients(leads) {
  return leads.map((lead) => ({
    leadId: lead.id,
    company: lead.company,
    email: lead.email,
    lead,
  }));
}

function queueItem(lead, status = "ready") {
  return {
    id: `queue-${lead.id}`,
    leadId: lead.id,
    campaignProfileId: "panek-puglesi",
    campaignId: CAMPAIGN_ID,
    companyName: lead.company,
    originalEmail: lead.email,
    normalizedEmail: lead.normalizedEmail,
    sector: "Medical",
    location: "London",
    validationStatus: "unknown",
    validationReason: "mailbox_not_verified",
    hasMxRecords: true,
    queueStatus: status,
    createdAt: at,
    updatedAt: at,
    attemptCount: 0,
  };
}

function officialPreview(leads, history) {
  return auditGlobalEmailRecipients({
    operation: "panek-puglesi",
    campaignId: CAMPAIGN_ID,
    contactKind: "first_contact",
    companiesFound: leads.length,
    recipients: recipients(leads),
    history,
  });
}

function stalePreviewWithoutHistory(leads) {
  return officialPreview(leads, []);
}

function signature() {
  return {
    enabled: true,
    body: "<p>P&P</p>",
    operation: "panek-puglesi",
  };
}

function campaign() {
  return {
    id: CAMPAIGN_ID,
    campaignProfileId: "panek-puglesi",
    subject: "Hello",
    body: "<p>Body</p>",
  };
}

test("same-operation confirmed realmente bloqueia e other-operation só alerta", () => {
  const leads = Array.from({ length: 75 }, (_, index) => readyLead(index));
  const history = [
    {
      operation: "panek-puglesi",
      normalizedEmail: leads[10].email,
      campaignId: "old-pnp",
      campaignName: "Old P&P",
      sentAt: at,
      providerMessageId: "provider-same-op",
    },
    {
      operation: "modeclean",
      normalizedEmail: leads[20].email,
      campaignId: "modeclean-old",
      campaignName: "Modeclean",
      sentAt: at,
      providerMessageId: "provider-other-1",
    },
    {
      operation: "modeclean",
      normalizedEmail: leads[21].email,
      campaignId: "modeclean-old",
      campaignName: "Modeclean",
      sentAt: at,
      providerMessageId: "provider-other-2",
    },
  ];
  const preview = officialPreview(leads, history);
  assert.equal(preview.companiesFound, 75);
  assert.equal(preview.alreadyContactedSameOperation, 1);
  assert.equal(preview.otherOperationWarnings, 2);
  assert.equal(preview.finalSendCount, 74);
  assert.equal(preview.decisions[10].included, false);
  assert.equal(preview.decisions[20].included, true);
  assert.ok(preview.decisions[20].otherOperationContact);
});

test("preview 75 / queue stale → fingerprint mismatch bloqueia Start", () => {
  const leads = Array.from({ length: 75 }, (_, index) => readyLead(index));
  const stalePreview = stalePreviewWithoutHistory(leads);
  const queue = leads.slice(0, 74).map((lead) => queueItem(lead));
  assert.equal(stalePreview.finalSendCount, 75);
  assert.equal(queue.length, 74);
  assert.equal(
    fingerprintsMatch(
      previewEligibleFingerprint(stalePreview),
      queueReadyFingerprint(queue)
    ),
    false
  );
  const preflight = evaluateAgentThreePreflight({
    operation: "panek-puglesi",
    hasHydrated: true,
    officialSignature: signature(),
    senderFromEmail: "outreach@example.test",
    campaign: campaign(),
    dbWritable: true,
    readyCount: 74,
    confirmedCount: 0,
    queueMatchesPreview: false,
  });
  assert.equal(preflight.ok, false);
  assert.equal(preflight.errorMessage, PREVIEW_QUEUE_MISMATCH_MESSAGE);
});

test("sync → preview e queue iguais; same-operation não entra na fila", () => {
  const leads = Array.from({ length: 75 }, (_, index) => readyLead(index));
  const history = [
    {
      operation: "panek-puglesi",
      normalizedEmail: leads[10].email,
      campaignId: "old-pnp",
      campaignName: "Old P&P",
      sentAt: at,
      providerMessageId: "provider-same-op",
    },
  ];
  const preview = officialPreview(leads, history);
  const staleQueue = leads.map((lead) => queueItem(lead));
  const synced = syncCampaignQueueToAuthoritativePreview({
    queue: staleQueue,
    campaignId: CAMPAIGN_ID,
    preview,
    occurredAt: at,
  });
  assert.equal(preview.finalSendCount, 74);
  assert.equal(synced.readyCount, 74);
  assert.equal(synced.blockedCount, 1);
  assert.equal(
    synced.queue.find((item) => item.leadId === "lead-10").queueStatus,
    "blocked"
  );
  assert.equal(
    synced.queue.find((item) => item.leadId === "lead-10").id,
    "queue-lead-10"
  );
  assert.equal(
    fingerprintsMatch(
      previewEligibleFingerprint(preview),
      queueReadyFingerprint(synced.queue)
    ),
    true
  );
});

test("fingerprint match + preflight PASS libera Start; zero SMTP real", () => {
  const leads = Array.from({ length: 74 }, (_, index) => readyLead(index));
  const preview = stalePreviewWithoutHistory(leads);
  const queue = leads.map((lead) => queueItem(lead));
  assert.equal(
    fingerprintsMatch(
      previewEligibleFingerprint(preview),
      queueReadyFingerprint(queue)
    ),
    true
  );
  const preflight = evaluateAgentThreePreflight({
    operation: "panek-puglesi",
    hasHydrated: true,
    officialSignature: signature(),
    senderFromEmail: "outreach@example.test",
    campaign: campaign(),
    dbWritable: true,
    readyCount: 74,
    confirmedCount: 0,
    queueMatchesPreview: true,
  });
  assert.equal(preflight.ok, true);
  assert.equal(preflight.errorMessage, null);
  const sendRoute = readFileSync(
    new URL("../src/app/api/agent-3/send/route.ts", import.meta.url),
    "utf8"
  );
  assert.match(
    sendRoute.slice(0, sendRoute.indexOf("export async function POST")),
    /verifyServerAgentThreeSmtp\(operation\)/
  );
  assert.doesNotMatch(
    sendRoute.slice(0, sendRoute.indexOf("export async function POST")),
    /sendServerAgentThreeSmtp\(body\)/
  );
});
