import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { LocalDatabaseAdapter } from "../src/lib/server/local-database.ts";
import { restoreDrill, fingerprintDatabase, maintainOffline } from "../src/lib/server/database-maintenance.ts";
import { OperationalWorker } from "../src/lib/server/operational-worker.ts";
import { smtpBackoff } from "../src/lib/smtp-backoff.ts";
import { classifyAgentThreeSmtpError } from "../src/lib/server/agent-three-smtp-core.ts";
import { executeAgentThreeSendWithLease } from "../src/lib/server/agent-three-send-pipeline.ts";
import { createInitialAgentThreeSnapshot, selectAgentThreeCampaign, loadAgentThreeLeads } from "../src/lib/agent-three-queue.ts";
import { INITIAL_AGENT_ONE_SNAPSHOT, addAgentOneSector } from "../src/lib/agent-one-queue.ts";
import { buildAgentTwoQueue } from "../src/lib/agent-two-queue.ts";
import { validateEmailLocally } from "../src/lib/email-validation.ts";
import { rotatingWorkerLog } from "../src/lib/server/worker-logging.ts";

const operation = "panek-puglesi";
const request = { operation, recipient: "recipient@example.test", subject: "Hello", html: "<p>Test</p>", ownerId: "test-owner", campaignId: "campaign", leadId: "lead", queueItemId: "queue" };
const environment = { AGENT3_REAL_SEND_ENABLED: "true", PNP_SMTP_HOST: "smtp.example.test", PNP_SMTP_PORT: "587", PNP_SMTP_SECURE: "false", PNP_SMTP_USER: "sender@example.test", PNP_SMTP_APP_PASSWORD: "fixture-not-real", PNP_FROM_NAME: "Fixture", PNP_REPLY_TO: "sender@example.test" };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pnp-operational-test-"));
  const options = { databasePath: join(root, "data", "fixture.sqlite"), backupDirectory: join(root, "backups"), allowVercel: true };
  const a = new LocalDatabaseAdapter(options);
  const b = new LocalDatabaseAdapter(options);
  return { root, options, a, b, close() { a.close(); b.close(); rmSync(root, { recursive: true, force: true }); } };
}
function noNetwork() {
  return { async search() { throw new Error("REAL_SEARCH_FORBIDDEN"); }, async validate() { throw new Error("REAL_DNS_FORBIDDEN"); }, async send() { throw new Error("REAL_SMTP_FORBIDDEN"); } };
}
function runningQueue(status = "ready") {
  const now = new Date().toISOString();
  const lead = { id: "lead", company: "Fixture", website: "https://example.test", email: request.recipient, phone: "", address: "London", category: "clinic", aiScore: 80, emailValidationStatus: "valid", normalizedEmail: request.recipient };
  const selected = selectAgentThreeCampaign(createInitialAgentThreeSnapshot(), operation, "campaign", now);
  const state = loadAgentThreeLeads(selected, operation, "campaign", [lead], 1, now).snapshot;
  state.operations[operation].status = "running";
  state.operations[operation].minIntervalSeconds = 0;
  state.operations[operation].maxIntervalSeconds = 0;
  state.operations[operation].queue = state.operations[operation].queue.map(item => ({ ...item, id: "queue", queueStatus: status }));
  if (status === "sending") state.operations[operation].currentItemId = "queue";
  return state;
}
test("A: PASSIVE checkpoint preserves committed WAL data; active maintenance skips", () => {
  const fx = fixture();
  try {
    fx.a.saveCommercialStore("pnp-lead-finder", { savedLeads: [{ id: "a", company: "Fixture" }] });
    const inspection = new DatabaseSync(fx.options.databasePath, { readOnly: true });
    const before = fingerprintDatabase(inspection);
    assert.equal(fx.a.maintainPassive().skipped, false);
    assert.deepEqual(fingerprintDatabase(inspection), before);
    inspection.close();
    fx.a.claimRunnerLease(operation, "browser");
    assert.equal(maintainOffline(fx.options.databasePath, "VACUUM").skipped, true);
    assert.equal(fx.a.compactAgentThreeSnapshots().skipped, true);
  } finally { fx.close(); }
});
test("B: WAL-safe restore drill preserves counts and every critical record after migration", async () => {
  const fx = fixture();
  let drill;
  try {
    fx.a.saveCommercialStore("pnp-lead-finder", { savedLeads: [{ id: "a", company: "Fixture" }], fullSearchHistory: [{ id: "search", keyword: "fixture", location: "London", resultsCount: 1 }] });
    const intent = fx.a.claimSendLease(request);
    fx.a.finishSendIntent(intent, { status: "sent", message: "mock", messageId: "<confirmed@example.test>" });
    drill = await restoreDrill(fx.options.databasePath);
    assert.equal(drill.pass, true);
    assert.equal(drill.after.leads.count, 1);
    assert.equal(drill.after.send_history.count, 1);
    assert.equal(drill.after.search_history.count, 1);
    assert.deepEqual(drill.after, drill.before);
  } finally { fx.close(); if (drill) rmSync(drill.root, { recursive: true, force: true }); }
});
test("C/H: second worker and browser runner cannot own the same operation", async () => {
  const fx = fixture();
  const first = new OperationalWorker(fx.a, noNetwork());
  const second = new OperationalWorker(fx.b, noNetwork());
  try {
    assert.equal(first.start(), true);
    assert.equal(second.start(), false);
    fx.a.claimRunnerLease(operation, first.ownerId);
    assert.equal(fx.b.claimRunnerLease(operation, "browser").decision, "already_active");
    fx.a.releaseRunnerLease(operation, first.ownerId);
    fx.b.claimRunnerLease(operation, "browser");
    fx.a.saveCommercialStore("pnp-agent-three", runningQueue());
    const executing = new OperationalWorker(fx.a, noNetwork(), false);
    assert.equal(fx.a.claimRunnerLease(operation, executing.ownerId).decision, "already_active");
    await first.tick(); // Monitor never calls any network dependency.
    await first.shutdown();
    assert.equal(executing.start(), true);
    await executing.tick();
    assert.equal(fx.a.readCommercialStore("pnp-agent-three").operations[operation].queue[0].queueStatus, "ready");
    await executing.shutdown();
  } finally { await first.shutdown(); fx.close(); }
});
test("Agent 2 worker reuses DNS validation and persists the lead result", async () => {
  const fx = fixture();
  const lead = { id: "lead", company: "Fixture", website: "https://example.test", email: request.recipient, phone: "", address: "London", category: "clinic", aiScore: 80, emailIsGuessed: false, emailSourceUrl: "https://example.test/contact", emailDiscoveryMethod: "website_contact" };
  const worker = new OperationalWorker(fx.a, { ...noNetwork(), validate: email => validateEmailLocally(email,
    async domain => ({ domain, exists: true, hasMxRecords: true, reason: null })) }, false);
  try {
    fx.a.saveCommercialStore("pnp-lead-finder", { savedLeads: [lead] });
    fx.a.saveCommercialStore("pnp-agent-two", { status: "running", queue: buildAgentTwoQueue([lead], new Date().toISOString()), currentItemId: null, errorMessage: null });
    worker.start(); await worker.tick();
    assert.equal(fx.a.readCommercialStore("pnp-agent-two").queue[0].reason, "mailbox_not_verified");
    assert.equal(fx.a.readCommercialStore("pnp-lead-finder").savedLeads[0].hasMxRecords, true);
  } finally { await worker.shutdown(); fx.close(); }
});
test("health and controls expose safe status, reject cross-origin and unknown restart", async () => {
  const fx = fixture();
  const worker = new OperationalWorker(fx.a, noNetwork(), false);
  try {
    fx.a.saveCommercialStore("pnp-agent-three", runningQueue("unknown")); worker.start();
    const code = `
      import assert from 'node:assert/strict';
      import { GET } from './src/app/api/operational-health/route.ts';
      import { POST } from './src/app/api/worker-control/route.ts';
      const health = await (await GET()).json();
      assert.equal(health.sqliteOk, true); assert.equal(health.workerOnline, true);
      assert.equal(health.queues[0].counts.unknown, 1);
      assert.doesNotMatch(JSON.stringify(health), /password|credentials|smtp_host|smtp_user|apiKey/i);
      const request = (origin, desiredState) => new Request('http://localhost/api/worker-control', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'panek-puglesi', desiredState }) });
      assert.equal((await POST(request('https://external.example.test','paused'))).status, 403);
      assert.equal((await POST(request('http://localhost','running'))).status, 409);
      assert.equal((await POST(request('http://localhost','paused'))).status, 200);
      console.log('HEALTH_CONTROL_PASS');
    `;
    const child = spawn(process.execPath, ["--import", "./scripts/worker-loader.mjs", "--input-type=module", "-e", code], {
      cwd: resolve(import.meta.dirname, ".."), env: { ...process.env, PNP_LOCAL_DATABASE_PATH: fx.options.databasePath, PNP_LOCAL_BACKUP_DIR: fx.options.backupDirectory }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; child.stdout.on("data", value => { output += value; }); child.stderr.on("data", value => { output += value; });
    assert.equal(await new Promise(resolve => child.on("exit", resolve)), 0, output);
    assert.match(output, /HEALTH_CONTROL_PASS/);
  } finally { await worker.shutdown(); fx.close(); }
});
test("rotating logs retain fixed events without payloads or secrets", () => {
  const root = mkdtempSync(join(tmpdir(), "pnp-log-test-"));
  try {
    for (let index = 0; index < 12; index++) rotatingWorkerLog(root, "START", 50);
    assert.equal(existsSync(join(root, "worker.log.3")), true);
    assert.equal(existsSync(join(root, "worker.log.4")), false);
    assert.doesNotMatch(readFileSync(join(root, "worker.log"), "utf8"), /password|recipient|smtp|token/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("D/J: restart reconciles interrupted send to unknown and never invokes SMTP", async () => {
  const fx = fixture();
  let calls = 0;
  const worker = new OperationalWorker(fx.a, { ...noNetwork(), async send() { calls++; throw new Error("SMTP_FORBIDDEN"); } }, false);
  try {
    fx.a.saveCommercialStore("pnp-agent-three", runningQueue("sending"));
    assert.equal(worker.start(), true);
    await worker.tick();
    const state = fx.a.readCommercialStore("pnp-agent-three").operations[operation];
    assert.equal(state.queue[0].queueStatus, "unknown");
    assert.equal(state.status, "paused");
    assert.equal(calls, 0);
  } finally { await worker.shutdown(); fx.close(); }
});
test("E: 454/421/450 give exponential backoff, configurable ceiling and sender cooldown", async () => {
  for (const responseCode of [454, 421, 450]) {
    const status = classifyAgentThreeSmtpError({ responseCode, command: "AUTH" });
    assert.equal(smtpBackoff({ status }, 0, 0).classification, "TRANSIENT");
  }
  assert.deepEqual([0, 1, 2, 3, 4].map(count => Date.parse(smtpBackoff({ status: "transient_error" }, count, 0).untilAt)), [30_000, 60_000, 120_000, 300_000, 300_000]);
  assert.equal(Date.parse(smtpBackoff({ status: "transient_error" }, 4, 0, 90_000).untilAt), 90_000);
  const fx = fixture();
  let calls = 0;
  const createTransport = () => ({ async sendMail() { calls++; throw Object.assign(new Error("fixture 454"), { responseCode: 454, command: "AUTH" }); } });
  try {
    const first = await executeAgentThreeSendWithLease(request, { database: fx.a, environment, createTransport });
    assert.equal(first.status, "auth_transient");
    await executeAgentThreeSendWithLease({ ...request, recipient: "second@example.test", ownerId: "other" }, { database: fx.b, environment, createTransport });
    assert.equal(calls, 1);
    assert.equal(fx.a.operationCooldowns(operation)[0].classification, "TRANSIENT");
  } finally { fx.close(); }
});
test("F: 535/5.7.x pause permanently without retry", async () => {
  assert.equal(classifyAgentThreeSmtpError({ responseCode: 535 }), "authentication_error");
  assert.equal(classifyAgentThreeSmtpError({ response: "550 5.7.1 forbidden" }), "authentication_error");
  assert.equal(smtpBackoff({ status: "authentication_error" }, 0).paused, true);
  const fx = fixture();
  let calls = 0;
  const createTransport = () => ({ async sendMail() { calls++; throw Object.assign(new Error("fixture"), { responseCode: 535 }); } });
  try {
    await executeAgentThreeSendWithLease(request, { database: fx.a, environment, createTransport });
    await executeAgentThreeSendWithLease(request, { database: fx.b, environment, createTransport });
    assert.equal(calls, 1);
    assert.equal(fx.a.operationCooldowns(operation)[0].paused, 1);
  } finally { fx.close(); }
});
test("G: confirmed is reconciled on restart and never retried", async () => {
  const fx = fixture();
  const worker = new OperationalWorker(fx.a, noNetwork(), false);
  try {
    fx.a.saveCommercialStore("pnp-agent-three", runningQueue("sending"));
    const intent = fx.a.claimSendLease(request);
    fx.a.finishSendIntent(intent, { status: "sent", message: "mock", messageId: "<confirmed@example.test>" });
    worker.start(); await worker.tick();
    assert.equal(fx.a.readCommercialStore("pnp-agent-three").operations[operation].queue[0].queueStatus, "sent");
    const result = await executeAgentThreeSendWithLease(request, { database: fx.b, environment,
      createTransport() { throw new Error("REAL_SMTP_FORBIDDEN"); } });
    assert.equal(result.status, "sent");
  } finally { await worker.shutdown(); fx.close(); }
});
test("I: graceful shutdown drains work, preserves queue and releases lease", async () => {
  const fx = fixture();
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const worker = new OperationalWorker(fx.a, { ...noNetwork(), async search() { entered(); await new Promise(resolve => { release = resolve; }); return { leads: [], source: "autonomous" }; } }, false);
  try {
    const state = addAgentOneSector(INITIAL_AGENT_ONE_SNAPSHOT, { sector: "clinic", location: "London", targetLeadCount: 1 }, "sector", new Date().toISOString());
    state.status = "running";
    fx.a.saveCommercialStore("pnp-agent-one", state);
    worker.start(); const ticking = worker.tick(); await started;
    const stopping = worker.shutdown(); release(); await ticking; await stopping;
    assert.equal(fx.a.readCommercialStore("pnp-agent-one").queue[0].status, "completed");
    assert.equal(fx.b.claimRunnerLease("worker", "next").decision, "claimed");
  } finally { fx.close(); }
});
test("timeout requires reconciliation, no automatic retry", async () => {
  const fx = fixture();
  let calls = 0;
  const dependencies = { database: fx.a, environment, createTransport: () => ({ async sendMail() { calls++; throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }); } }) };
  try {
    assert.equal((await executeAgentThreeSendWithLease(request, dependencies)).status, "reconciliation_required");
    assert.equal((await executeAgentThreeSendWithLease(request, dependencies)).status, "reconciliation_required");
    assert.equal(calls, 1);
  } finally { fx.close(); }
});
test("worker CLI: two processes, monitor safety and graceful stop request", { timeout: 30_000 }, async () => {
  const fx = fixture();
  const runtime = join(fx.root, "worker-runtime");
  const env = { ...process.env, PNP_LOCAL_DATABASE_PATH: fx.options.databasePath, PNP_LOCAL_BACKUP_DIR: fx.options.backupDirectory };
  const cwd = resolve(import.meta.dirname, "..");
  const children = [];
  const launch = () => {
    const child = spawn(process.execPath, ["scripts/worker.mjs"], { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    children.push(child);
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { output += chunk; });
    const finished = new Promise(resolve => child.on("exit", code => resolve({ code, output })));
    return { child, finished };
  };
  try {
    const first = launch();
    for (let attempt = 0; attempt < 100 && !existsSync(join(runtime, "worker.pid")); attempt++) await delay(100);
    assert.equal(existsSync(join(runtime, "worker.pid")), true);
    const second = await launch().finished;
    assert.equal(second.code, 2); assert.match(second.output, /WORKER_ALREADY_ACTIVE/);
    const stop = spawn(process.env.ComSpec ?? "cmd.exe", ["/c", "scripts\\stop-worker.cmd"], { cwd, env, windowsHide: true, stdio: "ignore" });
    assert.equal(await new Promise(resolve => stop.on("exit", resolve)), 0);
    assert.equal((await first.finished).code, 0);
    assert.match(readFileSync(join(runtime, "worker.log"), "utf8"), /STOP/);
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill();
    fx.close();
  }
});
test("offline TRUNCATE/VACUUM skips readers and preserves records when exclusive", () => {
  const root = mkdtempSync(join(tmpdir(), "pnp-offline-test-"));
  const path = join(root, "fixture.sqlite");
  const database = new LocalDatabaseAdapter({ databasePath: path, backupDirectory: join(root, "backups") });
  database.saveCommercialStore("pnp-lead-finder", { savedLeads: [{ id: "lead", company: "Fixture" }] });
  const reader = new DatabaseSync(path, { readOnly: true });
  reader.exec("BEGIN"); reader.prepare("SELECT * FROM leads").all();
  const before = fingerprintDatabase(reader);
  assert.equal(maintainOffline(path, "TRUNCATE").skipped, true);
  reader.exec("COMMIT"); reader.close(); database.close();
  try {
    assert.equal(maintainOffline(path, "TRUNCATE").skipped, false);
    assert.equal(maintainOffline(path, "VACUUM").skipped, false);
    const after = new DatabaseSync(path, { readOnly: true });
    assert.deepEqual(fingerprintDatabase(after), before); after.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("archiving old confirmed queue preserves authoritative record and resists stale mirrors", () => {
  const fx = fixture();
  try {
    const snapshot = runningQueue("sent");
    const op = snapshot.operations[operation];
    op.status = "completed"; op.currentCampaignId = "new-campaign";
    op.queue[0].updatedAt = "2025-01-01T00:00:00.000Z";
    op.queue[0].providerMessageId = "<confirmed@example.test>";
    const intent = fx.a.claimSendLease(request);
    fx.a.finishSendIntent(intent, { status: "sent", message: "mock", messageId: "<confirmed@example.test>" });
    fx.a.saveCommercialStore("pnp-agent-three", snapshot);
    const before = fx.a.listSendHistory();
    assert.equal(fx.a.compactAgentThreeSnapshots().archived, 1);
    assert.equal(fx.a.readCommercialStore("pnp-agent-three").operations[operation].queue.length, 0);
    assert.deepEqual(fx.a.listSendHistory(), before);
    fx.a.saveCommercialStore("pnp-agent-three", snapshot);
    assert.equal(fx.a.readCommercialStore("pnp-agent-three").operations[operation].queue.length, 0);
    const inspect = new DatabaseSync(fx.options.databasePath, { readOnly: true });
    assert.equal(inspect.prepare("SELECT COUNT(*) n FROM agent_three_archive").get().n, 1); inspect.close();
  } finally { fx.close(); }
});
test("Agent 3 worker uses shared send pipeline, persistent cooldown and confirmed campaign state", async () => {
  const fx = fixture();
  let calls = 0;
  const createTransport = () => ({ async sendMail() {
    calls++;
    if (calls === 1) throw Object.assign(new Error("fixture 454"), { responseCode: 454, command: "AUTH" });
    return { messageId: "<worker-confirmed@example.test>" };
  } });
  const worker = new OperationalWorker(fx.a, { ...noNetwork(), send: input => executeAgentThreeSendWithLease(input, { database: fx.a, environment, createTransport }) }, false);
  try {
    fx.a.saveCommercialStore("pnp-agent-three", runningQueue());
    fx.a.saveCommercialStore("pnp-campaigns", { campaigns: [{ id: "campaign", campaignProfileId: operation, name: "Fixture", status: "active", subject: "Fixture", body: "<p>Fixture</p>", leadIds: ["lead"], leadStatuses: [], signature: { enabled: true, body: "<p>P&P</p>", operation }, unsubscribeLink: "https://example.test/unsubscribe", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] });
    fx.a.putSignatures([{ operationId: operation, enabled: true, html: "<p>P&amp;P</p>", plainText: "P&P", version: 1, updatedAt: new Date().toISOString() }]);
    worker.start(); await worker.tick();
    assert.equal(calls, 1);
    assert.equal(fx.a.readCommercialStore("pnp-agent-three").operations[operation].queue[0].queueStatus, "ready");
    await worker.tick(); assert.equal(calls, 1);
    const edit = new DatabaseSync(fx.options.databasePath);
    edit.exec("UPDATE smtp_cooldowns SET until_at='2000-01-01T00:00:00.000Z'"); edit.close();
    // Wait for the configured 1-second minimum interval, without real transport.
    await delay(1_050); await worker.tick();
    assert.equal(calls, 2);
    assert.equal(fx.a.listSendHistory()[0].status, "confirmed");
    assert.equal(fx.a.readCommercialStore("pnp-agent-three").operations[operation].queue[0].queueStatus, "sent");
    await worker.tick(); assert.equal(calls, 2);
  } finally { await worker.shutdown(); fx.close(); }
});
