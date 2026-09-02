import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalDatabaseAdapter } from "../src/lib/server/local-database.ts";

const at = "2026-09-02T10:00:00.000Z";

function lead(id = "lead-1") {
  return {
    id,
    company: `Company ${id}`,
    website: `https://${id}.example.test`,
    email: `${id}@example.test`,
    phone: "",
    address: "London",
    category: "Test",
    aiScore: 90,
    emailValidationStatus: "valid",
    emailSourceUrl: `https://${id}.example.test/contact`,
    synthetic: false,
    sourceKind: "autonomous",
    createdAt: at,
    lastProcessedAt: at,
  };
}

function campaign(id = "campaign-1", updatedAt = at) {
  return {
    id,
    campaignProfileId: "panek-puglesi",
    contactKind: "first_contact",
    name: `Campaign ${id}`,
    subject: "Subject",
    body: "<p>Body</p>",
    fromName: "P&P",
    fromEmail: "outreach@example.test",
    replyTo: "reply@example.test",
    unsubscribeLink: "https://example.test/unsubscribe",
    followUp: { enabled: false, delayDays: 3, subject: "", body: "" },
    leadIds: ["lead-1"],
    leadStatuses: [{ leadId: "lead-1", status: "pending" }],
    leadSource: "saved",
    status: "saved",
    createdAt: at,
    updatedAt,
    sentCount: 0,
    openedCount: 0,
    clickedCount: 0,
    repliedCount: 0,
    failedCount: 0,
    attachment: null,
    signature: { enabled: true, body: "<p>Signature</p>", operation: "panek-puglesi" },
    batchSend: { batchSize: 50, delayBetweenBatchesMs: 0, delayBetweenEmailsMs: 0, autoSaveSentLeads: true, dailyLimit: 0 },
    sendErrors: [],
    emailProvider: "smtp-gmail",
  };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pnp-authority-"));
  const options = {
    databasePath: join(root, "data", "fixture.sqlite"),
    backupDirectory: join(root, "backups"),
    allowVercel: true,
  };
  return { root, options, database: new LocalDatabaseAdapter(options) };
}

function cleanup(fx) {
  try { fx.database.close(); } catch {}
  rmSync(fx.root, { recursive: true, force: true });
}

test("A/B/I: campanha imediata sobrevive a reload e cache Zustand vazio", () => {
  const fx = fixture();
  try {
    fx.database.putCampaign(campaign());
    fx.database.saveCommercialStore("pnp-campaigns", { campaigns: [] });
    assert.equal(fx.database.hydration().stores["pnp-campaigns"].campaigns[0].id, "campaign-1");
    fx.database.close();
    fx.database = new LocalDatabaseAdapter(fx.options);
    assert.equal(fx.database.hydration().stores["pnp-campaigns"].campaigns[0].id, "campaign-1");
  } finally { cleanup(fx); }
});

test("C/I: blocklist SQLite não é substituída por cache vazio", () => {
  const fx = fixture();
  try {
    fx.database.putBlocklistEntries([{ id: "block-1", normalizedEmail: "blocked@example.test", reason: "manual", operation: "both", blockedAt: at, source: "manual", note: "fixture" }]);
    fx.database.saveCommercialStore("pnp-email-blocklist", { entries: [] });
    const restored = fx.database.hydration().stores["pnp-email-blocklist"].entries;
    assert.equal(restored.length, 1);
    assert.equal(restored[0].normalizedEmail, "blocked@example.test");
  } finally { cleanup(fx); }
});

test("D: send_history reaparece na hidratação oficial e gera recuperação comprovável", () => {
  const fx = fixture();
  try {
    const sent = campaign();
    sent.status = "completed";
    sent.leadStatuses = [{ leadId: "lead-1", status: "sent", sentAt: at, providerMessageId: "provider-fixture-1" }];
    sent.sentCount = 1;
    fx.database.saveCommercialStore("pnp-lead-finder", { savedLeads: [lead()] });
    fx.database.putCampaign(sent);
    assert.equal(fx.database.hydration().sendHistory.length, 1);
    fx.database.deleteCampaign(sent.id);
    const recovered = fx.database.hydration().recoveredCampaigns;
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].label, "Campanha histórica recuperada");
    assert.equal(recovered[0].confirmed, 1);
  } finally { cleanup(fx); }
});

test("E/J: busca persiste e hidratação/restart são idempotentes", () => {
  const fx = fixture();
  try {
    const record = { id: "search-1", keyword: "Test", location: "London", resultsCount: 1, date: at, leads: [lead()] };
    fx.database.mergeLegacySnapshot({ migrationVersion: 1, stores: { "pnp-lead-finder": { savedLeads: [lead()], fullSearchHistory: [record] } }, indexedDb: { signatures: [], searchBatches: [] } });
    fx.database.mergeLegacySnapshot({ migrationVersion: 1, stores: { "pnp-lead-finder": { savedLeads: [], fullSearchHistory: [] } }, indexedDb: { signatures: [], searchBatches: [] } });
    assert.equal(fx.database.hydration().stores["pnp-lead-finder"].fullSearchHistory.length, 1);
    fx.database.close();
    fx.database = new LocalDatabaseAdapter(fx.options);
    assert.equal(fx.database.hydration().stores["pnp-lead-finder"].fullSearchHistory[0].id, "search-1");
  } finally { cleanup(fx); }
});

test("I: recovery cache adiciona ausentes sem substituir SQLite existente", () => {
  const fx = fixture();
  try {
    fx.database.putCampaign(campaign("official", "2026-09-02T12:00:00.000Z"));
    const stale = { ...campaign("official", "2026-01-01T00:00:00.000Z"), name: "STALE" };
    fx.database.mergeLegacySnapshot({ migrationVersion: 1, stores: { "pnp-campaigns": { campaigns: [stale, campaign("cache-only")] } }, indexedDb: { signatures: [], searchBatches: [] } });
    const campaigns = fx.database.hydration().stores["pnp-campaigns"].campaigns;
    assert.equal(campaigns.find((item) => item.id === "official").name, "Campaign official");
    assert.ok(campaigns.some((item) => item.id === "cache-only"));
  } finally { cleanup(fx); }
});

test("K: hidratação é idempotente após reload", () => {
  const fx = fixture();
  try {
    fx.database.putCampaign(campaign());
    fx.database.putBlocklistEntries([{
      id: "block-k",
      normalizedEmail: "k@example.test",
      reason: "manual",
      operation: "both",
      blockedAt: at,
      source: "manual",
    }]);
    const first = fx.database.hydration();
    const second = fx.database.hydration();
    assert.deepEqual(
      first.stores["pnp-campaigns"].campaigns.map((item) => item.id),
      second.stores["pnp-campaigns"].campaigns.map((item) => item.id)
    );
    assert.deepEqual(
      first.stores["pnp-email-blocklist"].entries.map((item) => item.id),
      second.stores["pnp-email-blocklist"].entries.map((item) => item.id)
    );
    assert.equal(first.sendHistory.length, second.sendHistory.length);
  } finally { cleanup(fx); }
});

test("I: hidratação une commercial_state com a tabela e cache vazio não esconde", () => {
  const fx = fixture();
  try {
    fx.database.saveCommercialStore("pnp-campaigns", { campaigns: [campaign("store-only")] });
    fx.database.saveCommercialStore("pnp-campaigns", { campaigns: [] });
    const hydrated = fx.database.hydration();
    assert.ok(hydrated.stores["pnp-campaigns"].campaigns.some((item) => item.id === "store-only"));
  } finally { cleanup(fx); }
});

test("source: skipHydration e merge SQLite-first estão nos stores duráveis", () => {
  const campaignStore = readFileSync(new URL("../src/store/campaign-store.ts", import.meta.url), "utf8");
  const blocklistStore = readFileSync(new URL("../src/store/email-blocklist-store.ts", import.meta.url), "utf8");
  const leadStore = readFileSync(new URL("../src/store/lead-store.ts", import.meta.url), "utf8");
  const bootstrap = readFileSync(new URL("../src/components/providers/local-data-bootstrap.tsx", import.meta.url), "utf8");
  assert.match(campaignStore, /skipHydration:\s*true/);
  assert.match(blocklistStore, /skipHydration:\s*true/);
  assert.match(leadStore, /skipHydration:\s*true/);
  assert.match(campaignStore, /sqliteWinsArrayMerge/);
  assert.match(bootstrap, /rehydratePersistCaches/);
});

test("J: providerMessageId oficial torna reindexação de campanhas idempotente", () => {
  const fx = fixture();
  try {
    fx.database.saveCommercialStore("pnp-lead-finder", { savedLeads: [lead()] });
    const first = campaign("campaign-provider-a");
    first.leadStatuses = [{ leadId: "lead-1", status: "sent", sentAt: at, providerMessageId: "provider-shared-proof" }];
    first.sentCount = 1;
    fx.database.putCampaign(first);

    const recovered = campaign("campaign-provider-b");
    recovered.leadStatuses = [{ leadId: "lead-1", status: "sent", sentAt: at, providerMessageId: "provider-shared-proof" }];
    recovered.sentCount = 1;
    assert.doesNotThrow(() => fx.database.putCampaign(recovered));
    assert.equal(fx.database.hydration().stores["pnp-campaigns"].campaigns.length, 2);
    assert.equal(
      fx.database.hydration().sendHistory.filter(
        (item) => item.providerMessageId === "provider-shared-proof"
      ).length,
      1
    );
  } finally { cleanup(fx); }
});
