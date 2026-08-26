import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { LocalDatabaseAdapter } from "../src/lib/server/local-database.ts";

const now = "2026-08-15T10:00:00.000Z";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pnp-local-db-"));
  const database = new LocalDatabaseAdapter({
    databasePath: join(root, "data", "test.sqlite"),
    backupDirectory: join(root, "backups"),
    allowVercel: true,
  });
  return {
    root,
    database,
    close() {
      try { database.close(); } catch {}
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function lead(id = "lead-1") {
  return {
    id,
    company: "Empresa Fictícia",
    website: "https://example.test",
    email: "teste@example.test",
    phone: "+44 20 0000 0000",
    address: "London",
    category: "Cleaning",
    aiScore: 91,
    batchId: "batch-1",
    enrichmentStatus: "completed",
    emailValidationStatus: "valid",
    scoringStatus: "completed",
    lastProcessedAt: now,
  };
}

function campaign(id = "campaign-1") {
  return {
    id,
    campaignProfileId: "panek-puglesi",
    contactKind: "first_contact",
    name: "Campanha fictícia",
    subject: "Assunto",
    body: "<p>Corpo</p>",
    fromName: "P&P",
    fromEmail: "outreach@panekpugliesi.co.uk",
    replyTo: "info@panekpugliesi.co.uk",
    unsubscribeLink: "https://example.test/unsubscribe",
    followUp: { enabled: false, delayDays: 3, subject: "", body: "" },
    leadIds: ["lead-1"],
    leadStatuses: [{
      leadId: "lead-1",
      status: "sent",
      sentAt: now,
      providerMessageId: "provider-message-preserved-" + id,
    }],
    leadSource: "saved",
    batchId: "batch-1",
    status: "completed",
    createdAt: now,
    updatedAt: now,
    sentCount: 1,
    openedCount: 0,
    clickedCount: 0,
    repliedCount: 0,
    failedCount: 0,
    attachment: null,
    signature: {
      enabled: true,
      body: "<p>P&P oficial</p>",
      operation: "panek-puglesi",
    },
    batchSend: {
      batchSize: 75,
      delayBetweenBatchesMs: 30000,
      delayBetweenEmailsMs: 400,
      autoSaveSentLeads: true,
      dailyLimit: 0,
    },
    sendErrors: [],
    emailProvider: "smtp-gmail",
  };
}

function batch() {
  return {
    batchId: "batch-1",
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
    lastSavedAt: now,
    status: "interrupted",
    currentStage: "enrichment",
    sectorsInput: "Cleaning, Roofing",
    sectors: [
      { index: 0, sector: "Cleaning", status: "completed", leadsFound: 1, completedAt: now, updatedAt: now },
      { index: 1, sector: "Roofing", status: "pending", leadsFound: 0, updatedAt: now },
    ],
    location: "London",
    configuredQuantity: 100,
    provider: "autonomous",
    searchProfile: "autonomous-24h",
    workers: 2,
    leadsFound: 1,
    deduplicatedLeads: 1,
    completedSectors: 1,
    pendingSectors: 1,
    failedSectors: 0,
    enrichmentCompleted: 1,
    enrichmentFailed: 0,
    validationCompleted: 1,
    validationFailed: 0,
    scoringCompleted: 1,
    scoringFailed: 0,
  };
}

function snapshot() {
  const fixtureLead = lead();
  return {
    migrationVersion: 1,
    stores: {
      "pnp-lead-finder": {
        savedLeads: [fixtureLead],
        importedLeads: [],
        recentSearches: [{ id: "search-1", keyword: "Cleaning", location: "London", resultsCount: 1, date: now, leads: [fixtureLead], batchId: "batch-1" }],
        fullSearchHistory: [{ id: "search-1", keyword: "Cleaning", location: "London", resultsCount: 1, date: now, leads: [fixtureLead], batchId: "batch-1" }],
      },
      "pnp-campaigns": { campaigns: [campaign()] },
      "pnp-email-templates": {
        templates: [
          { id: "template-pnp", name: "P&P template", operation: "panek-puglesi", subject: "P&P", body: "<p>P&P</p>", sender: "outreach@panekpugliesi.co.uk", replyTo: "info@panekpugliesi.co.uk", contactKind: "first_contact", isDefault: true, createdAt: now, updatedAt: now },
          { id: "template-modeclean", name: "Modeclean template", operation: "modeclean", subject: "Modeclean", body: "<p>Modeclean</p>", sender: "outreach@modeclean.co.uk", replyTo: "info@modeclean.co.uk", contactKind: "first_contact", isDefault: true, createdAt: now, updatedAt: now },
        ],
      },
      "pnp-email-blocklist": {
        entries: [{ id: "block-1", normalizedEmail: "blocked@example.test", reason: "manual", operation: "both", blockedAt: now, source: "manual" }],
      },
      "pnp-batch-pipeline": {
        batches: {
          "batch-1": { batchId: "batch-1", sector: "Cleaning", location: "London", createdAt: now, foundCount: 1, stage: "garimpo", label: "Cleaning — London", leadIds: ["lead-1"] },
        },
      },
      "pnp-settings": {
        workers: 2,
        delayMs: 4000,
        smtpPassword: "NEVER_STORE",
        serpApiKey: "NEVER_STORE",
      },
    },
    indexedDb: {
      signatures: [
        { operationId: "panek-puglesi", enabled: true, html: "<p>P&P oficial</p>", plainText: "P&P oficial", updatedAt: now, version: 1 },
        { operationId: "modeclean", enabled: true, html: "<p>Modeclean oficial</p>", plainText: "Modeclean oficial", updatedAt: now, version: 1 },
      ],
      searchBatches: [{ batch: batch(), leads: [fixtureLead] }],
    },
  };
}

test("A-I: SQLite restaura dados comerciais com localStorage e IndexedDB vazios", () => {
  const fx = fixture();
  try {
    fx.database.mergeLegacySnapshot(snapshot());
    const restored = fx.database.hydration();
    assert.equal(restored.stores["pnp-campaigns"].campaigns[0].id, "campaign-1");
    assert.equal(restored.stores["pnp-lead-finder"].savedLeads[0].id, "lead-1");
    assert.equal(restored.stores["pnp-lead-finder"].fullSearchHistory[0].id, "search-1");
    assert.equal(restored.stores["pnp-email-templates"].templates.length, 2);
    assert.equal(restored.stores["pnp-email-blocklist"].entries.length, 1);
    assert.equal(restored.searchBatches[0].batch.status, "interrupted");
    assert.equal(restored.stores["pnp-campaigns"].campaigns[0].leadStatuses[0].providerMessageId, "provider-message-preserved-campaign-1");
    assert.equal(restored.signatures.length, 2);
    assert.equal(fx.database.health().counts.confirmedSends, 1);
  } finally { fx.close(); }
});

test("J: checkpoint completed permanece completo e não volta à fila", () => {
  const fx = fixture();
  try {
    fx.database.mergeLegacySnapshot(snapshot());
    const restored = fx.database.getSearchBatch("batch-1");
    assert.equal(restored.batch.sectors[0].status, "completed");
    assert.deepEqual(
      restored.batch.sectors.filter((sector) => sector.status === "pending" || sector.status === "running").map((sector) => sector.sector),
      ["Roofing"]
    );
  } finally { fx.close(); }
});

test("K-L: migração é idempotente e vazia não sobrescreve valores válidos", () => {
  const fx = fixture();
  try {
    fx.database.mergeLegacySnapshot(snapshot());
    const first = fx.database.health().counts;
    fx.database.mergeLegacySnapshot(snapshot());
    assert.deepEqual(fx.database.health().counts, first);
    fx.database.mergeLegacySnapshot({
      migrationVersion: 1,
      stores: {
        "pnp-campaigns": { campaigns: [] },
        "pnp-email-templates": { templates: [] },
      },
      indexedDb: { signatures: [], searchBatches: [] },
    });
    const restored = fx.database.hydration();
    assert.equal(restored.stores["pnp-campaigns"].campaigns[0].name, "Campanha fictícia");
    assert.equal(restored.stores["pnp-email-templates"].templates.length, 2);
    assert.equal(restored.signatures.length, 2);
  } finally { fx.close(); }
});

test("M-O: backup íntegro, restore recupera dados e cria PRE-RESTORE", async () => {
  const fx = fixture();
  try {
    fx.database.mergeLegacySnapshot(snapshot());
    const backupPath = await fx.database.createBackup();
    fx.database.validateDatabaseFile(backupPath);
    fx.database.saveCommercialStore("pnp-campaigns", {
      campaigns: [campaign("campaign-after-backup")],
    });
    const beforeRestore = readdirSync(join(fx.root, "backups")).length;
    const preRestorePath = await fx.database.restoreFromFile(backupPath);
    const afterRestore = readdirSync(join(fx.root, "backups")).length;
    assert.ok(preRestorePath.endsWith(".sqlite"));
    assert.ok(afterRestore > beforeRestore);
    assert.equal(
      fx.database.hydration().stores["pnp-campaigns"].campaigns.some((item) => item.id === "campaign-after-backup"),
      false
    );
  } finally { fx.close(); }
});

test("Q/S/T: envio real exige intent gravável e suíte não chama SMTP/SerpAPI", () => {
  const smtpSource = readFileSync(new URL("../src/lib/server/agent-three-smtp.ts", import.meta.url), "utf8");
  const routeSource = readFileSync(new URL("../src/app/api/email/send/route.ts", import.meta.url), "utf8");
  assert.match(smtpSource, /createSendIntent\(input\)/);
  assert.match(smtpSource, /envio real bloqueado antes do SMTP/i);
  assert.match(routeSource, /LOCAL_DATABASE_UNAVAILABLE/);
});

test("R: assinaturas P&P e Modeclean permanecem isoladas", () => {
  const fx = fixture();
  try {
    fx.database.putSignatures(snapshot().indexedDb.signatures);
    assert.equal(fx.database.getSignature("panek-puglesi").html, "<p>P&P oficial</p>");
    assert.equal(fx.database.getSignature("modeclean").html, "<p>Modeclean oficial</p>");
    assert.equal(fx.database.getSignature("panek-puglesi").operationId, "panek-puglesi");
    assert.equal(fx.database.getSignature("modeclean").operationId, "modeclean");
  } finally { fx.close(); }
});

test("secrets de settings não entram no SQLite", () => {
  const fx = fixture();
  try {
    fx.database.mergeLegacySnapshot(snapshot());
    const raw = readFileSync(join(fx.root, "data", "test.sqlite")).toString("utf8");
    assert.equal(raw.includes("NEVER_STORE"), false);
  } finally { fx.close(); }
});

test("health verifica SELECT, migrations, escrita com rollback e path gravável", () => {
  const fx = fixture();
  try {
    fx.database.mergeLegacySnapshot(snapshot());
    const before = fx.database.health().counts;
    const health = fx.database.health();
    assert.equal(health.ok, true);
    assert.equal(health.status, "ok");
    assert.equal(health.writable, true);
    assert.ok(health.databasePath.endsWith("test.sqlite"));
    assert.equal(health.migrationVersion, 1);
    assert.deepEqual(health.counts, before);
    const reader = new DatabaseSync(health.databasePath, { readOnly: true });
    try {
      const row = reader.prepare("SELECT 1 AS present FROM metadata WHERE key='__write_test'").get();
      assert.equal(row, undefined);
    } finally {
      reader.close();
    }
  } finally { fx.close(); }
});
