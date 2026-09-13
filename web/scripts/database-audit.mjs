import { DatabaseSync } from "node:sqlite";
import { statSync, existsSync } from "node:fs";
import { resolveLocalDataPaths } from "../src/lib/server/local-database.ts";
const path = resolveLocalDataPaths().databasePath;
const database = new DatabaseSync(path, { readOnly: true });
try {
  const sizes = Object.fromEntries(["", "-wal", "-shm"].map(suffix => [suffix || "db", existsSync(path + suffix) ? statSync(path + suffix).size : 0]));
  const state = database.prepare("SELECT store_key,length(CAST(data_json AS BLOB)) bytes FROM commercial_state ORDER BY bytes DESC").all();
  const row = database.prepare("SELECT data_json FROM commercial_state WHERE store_key='pnp-agent-three'").get();
  const queues = Object.entries(JSON.parse(String(row?.data_json ?? "{}" )).operations ?? {}).map(([operation, value]) => ({ operation,
    status: value.status, queue: (value.queue ?? []).length, history: (value.history ?? []).length, sentIndex: (value.sentIndex ?? []).length,
    statuses: Object.fromEntries(["ready", "sent", "failed", "unknown", "blocked", "sending"].map(status => [status, (value.queue ?? []).filter(item => item.queueStatus === status).length])) }));
  console.log(JSON.stringify({ sizes, state, queues }, null, 2));
} finally { database.close(); }
