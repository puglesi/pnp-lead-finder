import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
/** Fixed event codes only; no request payload, address, SMTP response or env values. */
export function rotatingWorkerLog(directory: string, event: "START" | "STOP" | "TICK_FAILED" | "LEASE_LOST", maxBytes = 1_000_000) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "worker.log");
  if (existsSync(path) && statSync(path).size >= maxBytes) {
    for (let index = 3; index >= 1; index--) {
      const source = index === 1 ? path : `${path}.${index - 1}`;
      const target = `${path}.${index}`;
      if (existsSync(target)) unlinkSync(target);
      if (existsSync(source)) renameSync(source, target);
    }
  }
  appendFileSync(path, JSON.stringify({ at: new Date().toISOString(), event }) + "\n");
}
