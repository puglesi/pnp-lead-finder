import "./worker-loader.mjs";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { LocalDatabaseAdapter, resolveLocalDataPaths } from "../src/lib/server/local-database.ts";
import { OperationalWorker } from "../src/lib/server/operational-worker.ts";
import { rotatingWorkerLog } from "../src/lib/server/worker-logging.ts";
import { executeAgentThreeSendWithLease } from "../src/lib/server/agent-three-send-pipeline.ts";

// Credentials are inherited from the host environment. Never loads or edits .env.local.
const execute = process.argv.includes("--execute");
const paths = resolveLocalDataPaths();
const runtime = resolve(dirname(paths.databasePath), "..", "worker-runtime");
mkdirSync(runtime, { recursive: true });
let database;
while (!database) {
  if (existsSync(paths.databasePath)) {
    try { database = new LocalDatabaseAdapter(paths); } catch { /* Wait for DB availability. */ }
  }
  if (!database) await delay(5_000);
}
const worker = new OperationalWorker(database, {
  async search(sector, location, limit) {
    const { executeSearch } = await import("../src/lib/search/engine.ts");
    return executeSearch({ keyword: sector, location, maxResults: limit, delayMs: 1000,
      provider: "autonomous", autonomousEnrichWebsites: true, allowArtificialResults: false });
  },
  async validate(email) {
    const { validateEmailLocally } = await import("../src/lib/email-validation.ts");
    const { checkEmailDomain } = await import("../src/lib/email-domain-check.ts");
    return validateEmailLocally(email, checkEmailDomain);
  },
  async send(request) {
    const { default: nodemailer } = await import("nodemailer");
    return executeAgentThreeSendWithLease(request, { database, environment: process.env,
      createTransport: options => nodemailer.createTransport(options) });
  },
}, !execute);
if (!worker.start()) { database.close(); console.error("WORKER_ALREADY_ACTIVE"); process.exit(2); }
const pidPath = resolve(runtime, "worker.pid");
const stopPath = resolve(runtime, "stop.request");
if (existsSync(stopPath)) unlinkSync(stopPath);
writeFileSync(pidPath, String(process.pid));
rotatingWorkerLog(runtime, "START");
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK"]) process.on(signal, () => { stopping = true; worker.requestShutdown(); });
const heartbeat = setInterval(() => {
  if (existsSync(stopPath)) { stopping = true; worker.requestShutdown(); }
  try { if (!worker.heartbeat()) stopping = true; }
  catch { stopping = true; }
}, 10_000);
let maintenanceAt = Date.now();
let pendingBackup = null;
try {
  while (!stopping) {
    if (existsSync(stopPath)) { stopping = true; break; }
    try { await worker.tick(); }
    catch { rotatingWorkerLog(runtime, "TICK_FAILED"); }
    if (Date.now() - maintenanceAt >= 60_000) {
      database.maintainPassive(); database.compactAgentThreeSnapshots(); maintenanceAt = Date.now();
      if (execute && !pendingBackup) {
        pendingBackup = database.ensureDailyBackup(true).catch(() => { rotatingWorkerLog(runtime, "TICK_FAILED"); })
          .finally(() => { pendingBackup = null; });
      }
    }
    await delay(1_000);
  }
} finally {
  await worker.shutdown();
  if (pendingBackup) await pendingBackup;
  clearInterval(heartbeat);
  if (existsSync(pidPath) && readFileSync(pidPath, "utf8") === String(process.pid)) unlinkSync(pidPath);
  if (existsSync(stopPath)) unlinkSync(stopPath);
  rotatingWorkerLog(runtime, "STOP");
  database.close();
}
