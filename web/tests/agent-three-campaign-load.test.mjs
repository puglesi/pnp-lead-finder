import assert from "node:assert/strict";
import test from "node:test";
import {
  countAgentThreeExcludedRecipients,
  describeAgentThreeEmptyQueue,
  getAgentThreeLoadableLeadIds,
  isNotConfiguredCampaignFailure,
  recoverNotConfiguredCampaignLeadStatuses,
} from "../src/lib/agent-three-campaign-load.ts";
import {
  isConfirmedCampaignDelivery,
  reconcileCampaignDelivery,
} from "../src/lib/campaign-delivery-metrics.ts";
import {
  applyCampaignDeliveryReconciliation,
  getCampaignDeliverySnapshot,
  getSendProgress,
} from "../src/lib/campaign-metrics.ts";

function campaign(overrides = {}) {
  return {
    id: "campaign-nc",
    name: "Campanha NC",
    campaignProfileId: "panek-puglesi",
    leadIds: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "sim"],
    leadStatuses: [
      { leadId: "a", status: "failed", errorCode: "NOT_CONFIGURED" },
      { leadId: "b", status: "failed", errorCode: "NOT_CONFIGURED" },
      { leadId: "c", status: "failed", errorCode: "NOT_CONFIGURED" },
      { leadId: "d", status: "failed", errorCode: "NOT_CONFIGURED" },
      { leadId: "e", status: "failed", errorCode: "NOT_CONFIGURED" },
      { leadId: "f", status: "failed", errorCode: "NOT_CONFIGURED" },
      { leadId: "g", status: "failed", errorCode: "NOT_CONFIGURED" },
      { leadId: "h", status: "failed", errorCode: "NOT_CONFIGURED" },
      { leadId: "i", status: "failed", errorCode: "NOT_CONFIGURED" },
      { leadId: "j", status: "failed", errorCode: "NOT_CONFIGURED" },
      {
        leadId: "k",
        status: "sent",
        sentAt: "2026-07-28T10:00:00.000Z",
        providerMessageId: "real-smtp-message",
      },
      {
        leadId: "sim",
        status: "sent",
        sentAt: "2026-07-28T10:00:00.000Z",
        providerMessageId: "sim-123-fake",
      },
    ],
    sendErrors: [
      {
        id: "err-a",
        leadId: "a",
        email: "a@example.test",
        company: "A",
        errorCode: "NOT_CONFIGURED",
        errorMessage: "SMTP ausente",
        provider: "smtp",
        occurredAt: "2026-07-28T10:00:00.000Z",
        batchNumber: 1,
      },
    ],
    failedCount: 10,
    sentCount: 96,
    openedCount: 0,
    clickedCount: 0,
    repliedCount: 0,
    ...overrides,
  };
}

test("campaign-load 1. NOT_CONFIGURED é recuperável", () => {
  assert.equal(
    isNotConfiguredCampaignFailure({
      leadId: "x",
      status: "failed",
      errorCode: "NOT_CONFIGURED",
    }),
    true
  );
  assert.equal(
    isNotConfiguredCampaignFailure({
      leadId: "y",
      status: "failed",
      errorCode: "SMTP_REJECTED",
    }),
    false
  );
});

test("campaign-load 2. 10 NOT_CONFIGURED e sim- enviados voltam; real permanece", () => {
  const recovered = recoverNotConfiguredCampaignLeadStatuses(campaign());
  assert.equal(recovered.recoveredCount, 11);
  assert.equal(recovered.failedCount, 0);
  assert.equal(recovered.sentCount, 1);
  assert.equal(
    recovered.leadStatuses.filter((status) => status.status === "pending")
      .length,
    11
  );
  assert.equal(
    recovered.leadStatuses.find((status) => status.leadId === "k")?.status,
    "sent"
  );
  assert.equal(
    recovered.leadStatuses.find((status) => status.leadId === "sim")?.status,
    "pending"
  );
  assert.equal(recovered.sendErrors.length, 0);
});

test("campaign-load 3. loadable inclui NOT_CONFIGURED/sim e exclui enviados reais", () => {
  const reconciled = reconcileCampaignDelivery(campaign());
  const ids = getAgentThreeLoadableLeadIds({
    ...campaign(),
    leadStatuses: reconciled.leadStatuses,
    sentCount: reconciled.sentCount,
  });
  assert.equal(ids.includes("k"), false);
  assert.equal(ids.includes("a"), true);
  assert.equal(ids.includes("sim"), true);
});

test("campaign-load 4. zero explica motivo real em vez de só 0", () => {
  assert.equal(
    describeAgentThreeEmptyQueue({
      hasCampaign: true,
      campaignRecipientCount: 0,
      loadableCount: 0,
      resolvedLeadCount: 0,
      readyCount: 0,
      alreadySentCount: 0,
      confirmedDeliveryCount: 0,
      recoveredNotConfiguredCount: 0,
      missingLeadCount: 0,
      removedCount: 0,
      dnsErrorCount: 0,
      noEligibleMessage: "sem elegíveis",
    }),
    "A campanha não possui destinatários."
  );
  assert.equal(
    describeAgentThreeEmptyQueue({
      hasCampaign: true,
      campaignRecipientCount: 5,
      loadableCount: 0,
      resolvedLeadCount: 0,
      readyCount: 0,
      alreadySentCount: 0,
      confirmedDeliveryCount: 5,
      recoveredNotConfiguredCount: 0,
      missingLeadCount: 0,
      removedCount: 0,
      dnsErrorCount: 0,
      noEligibleMessage: "sem elegíveis",
    }),
    "Todos os destinatários já foram enviados com sucesso."
  );
});

test("campaign-load 5. sentCount stale 96 cai para 0 sem confirmação real", () => {
  const stale = campaign({
    leadIds: Array.from({ length: 98 }, (_, i) => `lead-${i}`),
    leadStatuses: Array.from({ length: 96 }, (_, i) => ({
      leadId: `lead-${i}`,
      status: "sent",
      providerMessageId: `sim-${i}`,
    })),
    sentCount: 96,
  });
  const reconciled = reconcileCampaignDelivery(stale);
  assert.equal(reconciled.sentCount, 0);
  assert.equal(reconciled.demotedUnconfirmedSentCount, 96);
  assert.equal(
    reconciled.leadStatuses.every((status) => status.status === "pending"),
    true
  );
  assert.equal(
    isConfirmedCampaignDelivery({
      leadId: "x",
      status: "sent",
      providerMessageId: "sim-1",
    }),
    false
  );
  assert.equal(
    isConfirmedCampaignDelivery({
      leadId: "opened-without-smtp",
      status: "opened",
      providerMessageId: "sim-open",
    }),
    false
  );
  assert.equal(
    isConfirmedCampaignDelivery({
      leadId: "y",
      status: "sent",
      providerMessageId: "smtp-real-id",
    }),
    true
  );
});

test("campaign-load 6. excluídos contam 2, não 98 prontos na fila", () => {
  const queueItems = Array.from({ length: 96 }, (_, i) => ({
    queueStatus: "ready",
    id: `q-${i}`,
  }));
  assert.equal(
    countAgentThreeExcludedRecipients({
      campaignRecipientCount: 98,
      queueItems,
      confirmedSentCount: 0,
    }),
    2
  );
  assert.equal(
    countAgentThreeExcludedRecipients({
      campaignRecipientCount: 98,
      queueItems: [
        ...queueItems,
        { queueStatus: "blocked" },
        { queueStatus: "blocked" },
      ],
      confirmedSentCount: 0,
    }),
    2
  );
  // Reload with all 96 already ready must still report only 2 missing duplicates.
  assert.notEqual(
    countAgentThreeExcludedRecipients({
      campaignRecipientCount: 98,
      queueItems,
      confirmedSentCount: 0,
    }),
    98
  );
});

test("campaign-load 7. lista /campanhas zera 96 enviados e 98% legados", () => {
  const legacy = {
    id: "nova-lista",
    name: "Nova lista",
    campaignProfileId: "panek-puglesi",
    emailProvider: "simulate",
    leadIds: Array.from({ length: 98 }, (_, i) => `lead-${i}`),
    leadStatuses: Array.from({ length: 96 }, (_, i) => ({
      leadId: `lead-${i}`,
      status: i % 2 === 0 ? "failed" : "sent",
      errorCode: i % 2 === 0 ? "NOT_CONFIGURED" : undefined,
      providerMessageId: i % 2 === 0 ? undefined : `sim-${i}`,
    })),
    sentCount: 96,
    failedCount: 96,
    openedCount: 12,
    clickedCount: 4,
    repliedCount: 2,
    sendErrors: [
      {
        id: "e1",
        leadId: "lead-0",
        email: "a@test",
        company: "A",
        errorCode: "NOT_CONFIGURED",
        errorMessage: "SMTP ausente",
        provider: "simulate",
        occurredAt: "2026-07-28T10:00:00.000Z",
        batchNumber: 1,
      },
    ],
  };
  const migrated = applyCampaignDeliveryReconciliation(legacy);
  assert.equal(migrated.sentCount, 0);
  assert.equal(migrated.failedCount, 0);
  assert.equal(migrated.openedCount, 0);
  assert.equal(migrated.clickedCount, 0);
  assert.equal(migrated.repliedCount, 0);
  assert.equal(getSendProgress(migrated), 0);
  assert.equal(getCampaignDeliverySnapshot(legacy).sentCount, 0);
  assert.equal(getSendProgress(legacy), 0);
});
