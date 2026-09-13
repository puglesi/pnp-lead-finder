import { backup, DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalDatabaseAdapter } from "./local-database.ts";

const OFFICIAL_TABLES = ["campaigns", "leads", "send_history", "search_history", "blocklist", "dedupe_history", "signatures", "commercial_state", "send_leases", "agent_three_archive"];

export function fingerprintDatabase(database: DatabaseSync) {
  return Object.fromEntries(OFFICIAL_TABLES.map(table => {
    const exists = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
    const rows = exists ? database.prepare(`SELECT * FROM ${table}`).all() : [];
    const records = rows.map(row => JSON.stringify(row)).sort();
    return [table, { count: rows.length, sha256: createHash("sha256").update(JSON.stringify(records)).digest("hex") }];
  }));
}

/** Online backup includes committed WAL; all migration/restore writes are temporary. */
export async function restoreDrill(sourcePath: string) {
  const root = mkdtempSync(join(tmpdir(), "pnp-restore-drill-"));
  const copyPath = join(root, "copy.sqlite");
  const restoredPath = join(root, "restored.sqlite");
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try { await backup(source, copyPath); } finally { source.close(); }
  const copy = new DatabaseSync(copyPath);
  let before: ReturnType<typeof fingerprintDatabase>;
  try { before = fingerprintDatabase(copy); await backup(copy, restoredPath); }
  finally { copy.close(); }
  const migrated = new LocalDatabaseAdapter({ databasePath: restoredPath, backupDirectory: join(root, "backups"), allowVercel: true });
  migrated.close();
  const restored = new DatabaseSync(restoredPath, { readOnly: true });
  try {
    const integrity = restored.prepare("PRAGMA integrity_check").all();
    const after = fingerprintDatabase(restored);
    const pass = integrity.every(row => Object.values(row).includes("ok")) && JSON.stringify(before) === JSON.stringify(after);
    return { pass, root, before, after, integrity };
  } finally { restored.close(); }
}

/** Dedicated connection retains an exclusive lock across COMMIT and VACUUM.
 * No waiting, and no maintenance if a runner, search or unresolved send exists.
 */
export function maintainOffline(path: string, mode: "TRUNCATE" | "VACUUM") {
  const database = new DatabaseSync(path);
  try {
    database.exec("PRAGMA busy_timeout=0; PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE");
    const now = new Date().toISOString();
    const busy = database.prepare("SELECT 1 FROM runner_leases WHERE expires_at>? LIMIT 1").get(now)
      || database.prepare("SELECT 1 FROM send_leases WHERE status IN ('claimed','unknown') LIMIT 1").get()
      || database.prepare("SELECT 1 FROM search_batches WHERE status IN ('running','searching','processing') LIMIT 1").get();
    const snapshots = database.prepare("SELECT data_json FROM commercial_state WHERE store_key IN ('pnp-agent-one','pnp-agent-two','pnp-agent-three')").all();
    const active = snapshots.some(row => {
      const state = JSON.parse(String(row.data_json));
      return state.status === "running" || Object.values(state.operations ?? {}).some(value => (value as { status?: string }).status === "running");
    });
    if (busy || active) { database.exec("ROLLBACK"); return { skipped: true, reason: "active_operation" }; }
    database.exec("COMMIT");
    const checkpoint = database.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
    if (Number(checkpoint?.busy ?? 1) !== 0) return { skipped: true, reason: "busy" };
    if (mode === "VACUUM") database.exec("VACUUM");
    return { skipped: false, checkpoint };
  } catch { return { skipped: true, reason: "busy_or_unavailable" }; }
  finally { try { database.exec("ROLLBACK"); } catch {} database.close(); }
}
