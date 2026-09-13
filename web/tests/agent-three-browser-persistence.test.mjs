import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  mergeAgentThreeBrowserPreferences,
  selectAgentThreeBrowserPreferences,
} from "../src/lib/agent-three-browser-persistence.ts";
import { createInitialAgentThreeSnapshot } from "../src/lib/agent-three-queue.ts";
import {
  createQuotaSafeStateStorage,
  setStorageItemWithoutQuotaFailure,
} from "../src/lib/quota-safe-storage.ts";

const at = "2026-09-04T18:43:27.353Z";

function queueItem(index) {
  return {
    id: `queue-${index}`,
    leadId: `lead-${index}`,
    campaignProfileId: "panek-puglesi",
    campaignId: "campaign-official",
    companyName: `Company ${index} ${"x".repeat(100)}`,
    originalEmail: `lead-${index}@example.test`,
    normalizedEmail: `lead-${index}@example.test`,
    sector: "Test",
    location: "London",
    validationStatus: "valid",
    validationReason: "fixture",
    queueStatus: "sent",
    createdAt: at,
    updatedAt: at,
    sentAt: at,
    attemptCount: 1,
    providerMessageId: `provider-${index}`,
  };
}

function largeOfficialSnapshot() {
  const snapshot = createInitialAgentThreeSnapshot();
  const queue = Array.from({ length: 1_000 }, (_, index) => queueItem(index));
  snapshot.selectedProfileId = "modeclean";
  snapshot.operations["panek-puglesi"] = {
    ...snapshot.operations["panek-puglesi"],
    status: "completed",
    currentCampaignId: "campaign-official",
    queue,
    selectedLeadIds: queue.map((item) => item.leadId),
    sentIndex: queue.map((item) => ({
      queueItemId: item.id,
      leadId: item.leadId,
      normalizedEmail: item.normalizedEmail,
      campaignProfileId: "panek-puglesi",
      campaignId: "campaign-official",
      sentAt: at,
      providerMessageId: item.providerMessageId,
    })),
    history: queue.map((item, index) => ({
      id: `history-${index}`,
      action: "item_sent",
      occurredAt: at,
      campaignId: "campaign-official",
      queueItemId: item.id,
      detail: "Item enviado.",
    })),
    numericLimit: 75,
    untilQueueEnds: true,
    minIntervalSeconds: 2,
    maxIntervalSeconds: 5,
  };
  return snapshot;
}

test("pnp-agent-three gigante vira cache pequeno sem queue/history/recipients", () => {
  const official = largeOfficialSnapshot();
  const legacyEnvelope = JSON.stringify({ state: official, version: 1 });
  const preferences = selectAgentThreeBrowserPreferences(official);
  const reducedEnvelope = JSON.stringify({ state: preferences, version: 2 });

  assert.ok(Buffer.byteLength(legacyEnvelope) > 500_000);
  assert.ok(Buffer.byteLength(reducedEnvelope) < 1_024);
  assert.ok(Buffer.byteLength(reducedEnvelope) * 500 < Buffer.byteLength(legacyEnvelope));
  for (const forbidden of [
    "queue",
    "selectedLeadIds",
    "sentIndex",
    "history",
    "providerMessageId",
    "recipients",
    "leadStatuses",
  ]) {
    assert.equal(reducedEnvelope.includes(`\"${forbidden}\"`), false);
  }

  const values = new Map([["pnp-agent-three", legacyEnvelope]]);
  const quotaStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (value.length > 2_000) {
        const error = new Error("quota");
        error.name = "QuotaExceededError";
        throw error;
      }
      values.set(key, value);
    },
    removeItem: (key) => values.delete(key),
  };
  const safeStorage = createQuotaSafeStateStorage(quotaStorage);
  assert.doesNotThrow(() =>
    safeStorage.setItem("pnp-agent-three", reducedEnvelope)
  );
  assert.equal(values.get("pnp-agent-three"), reducedEnvelope);
});

test("localStorage vazio mantém integralmente o snapshot oficial do SQLite", () => {
  const official = largeOfficialSnapshot();
  const restored = mergeAgentThreeBrowserPreferences(official, undefined);
  assert.strictEqual(restored, official);
  assert.equal(restored.operations["panek-puglesi"].queue.length, 1_000);
  assert.equal(restored.operations["panek-puglesi"].sentIndex.length, 1_000);
  assert.equal(restored.operations["panek-puglesi"].history.length, 1_000);
});

test("migração de cache legado aplica só preferências e não duplica queue", () => {
  const official = largeOfficialSnapshot();
  const legacy = largeOfficialSnapshot();
  legacy.operations["panek-puglesi"].queue = [queueItem(9_999)];
  legacy.operations["panek-puglesi"].sentIndex = [];
  legacy.operations["panek-puglesi"].history = [];
  legacy.operations["panek-puglesi"].numericLimit = 25;
  legacy.operations["panek-puglesi"].minIntervalSeconds = 10;
  legacy.operations["panek-puglesi"].maxIntervalSeconds = 20;

  const restored = mergeAgentThreeBrowserPreferences(official, legacy);
  assert.equal(restored.operations["panek-puglesi"].queue.length, 1_000);
  assert.deepEqual(
    restored.operations["panek-puglesi"].queue.map((item) => item.id),
    official.operations["panek-puglesi"].queue.map((item) => item.id)
  );
  assert.equal(restored.operations["panek-puglesi"].sentIndex.length, 1_000);
  assert.equal(restored.operations["panek-puglesi"].history.length, 1_000);
  assert.equal(restored.operations["panek-puglesi"].numericLimit, 25);
  assert.equal(restored.operations["panek-puglesi"].minIntervalSeconds, 10);
  assert.equal(restored.operations["panek-puglesi"].maxIntervalSeconds, 20);
});

test("QuotaExceededError no cache nunca é propagado e não remove outras chaves", () => {
  const values = new Map([
    ["pnp-campaigns", "official-campaign-cache"],
    ["pnp-email-blocklist", "official-blocklist-cache"],
  ]);
  const fullStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: () => {
      const error = new Error("full");
      error.name = "QuotaExceededError";
      throw error;
    },
    removeItem: (key) => values.delete(key),
  };

  assert.doesNotThrow(() =>
    createQuotaSafeStateStorage(fullStorage).setItem("pnp-agent-three", "{}")
  );
  assert.equal(
    setStorageItemWithoutQuotaFailure(fullStorage, "migration-marker", "1"),
    false
  );
  assert.equal(values.get("pnp-campaigns"), "official-campaign-cache");
  assert.equal(values.get("pnp-email-blocklist"), "official-blocklist-cache");
});

test("hidratação é SQLite-first e persistência de browser tem zero SMTP/SerpAPI", () => {
  const bootstrap = readFileSync(
    new URL("../src/components/providers/local-data-bootstrap.tsx", import.meta.url),
    "utf8"
  );
  const browserPersistence = readFileSync(
    new URL("../src/lib/agent-three-browser-persistence.ts", import.meta.url),
    "utf8"
  );
  const hydrateIndex = bootstrap.indexOf("hydrateStores(hydration)");
  const cacheIndex = bootstrap.indexOf("await rehydratePersistCaches()", hydrateIndex);
  assert.ok(hydrateIndex >= 0);
  assert.ok(cacheIndex > hydrateIndex);
  assert.match(
    bootstrap,
    /useAgentThreeStore\.subscribe\(\(state\) => queue\("pnp-agent-three", state\)\)/
  );
  assert.doesNotMatch(browserPersistence, /smtp|serpapi|\/api\/email\/send/i);
});
