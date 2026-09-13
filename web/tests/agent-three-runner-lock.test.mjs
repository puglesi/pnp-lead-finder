import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDatabaseAdapter } from "../src/lib/server/local-database.ts";
import {
  acquireAgentThreeWebLock,
  createMemoryRunnerLockAdapter,
  decideRunnerLeaseClaim,
  RUNNER_ALREADY_ACTIVE_MESSAGE,
} from "../src/lib/runner-lease.ts";
import { assertNoCommercialDatabaseAccess } from "./helpers/commercial-database-guard.mjs";

assertNoCommercialDatabaseAccess(import.meta.url);

test("F: duas abas — segundo Start recusado (Web Lock + SQLite)", async () => {
  const adapter = createMemoryRunnerLockAdapter();
  const first = await acquireAgentThreeWebLock("panek-puglesi", adapter);
  const second = await acquireAgentThreeWebLock("panek-puglesi", adapter);
  assert.equal(first.acquired, true);
  assert.equal(second.acquired, false);

  const root = mkdtempSync(join(tmpdir(), "pnp-runner-lease-"));
  const database = new LocalDatabaseAdapter({
    databasePath: join(root, "data", "fixture.sqlite"),
    backupDirectory: join(root, "backups"),
    allowVercel: true,
  });
  try {
    const claimed = database.claimRunnerLease("panek-puglesi", "tab-1");
    const other = database.claimRunnerLease("panek-puglesi", "tab-2");
    assert.equal(claimed.decision, "claimed");
    assert.equal(other.decision, "already_active");
    assert.equal(
      decideRunnerLeaseClaim({
        existingOwnerId: "tab-1",
        expiresAt: "2099-01-01T00:00:00.000Z",
        requesterOwnerId: "tab-2",
        nowIso: "2026-09-13T10:00:00.000Z",
      }),
      "already_active"
    );
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }

  const runner = readFileSync(
    new URL("../src/hooks/use-agent-three-runner.ts", import.meta.url),
    "utf8"
  );
  assert.match(runner, /acquireExclusiveRunner/);
  assert.match(runner, /RUNNER_ALREADY_ACTIVE_MESSAGE/);
  assert.match(runner, /claimAgentThreeRunnerLease/);
  assert.equal(RUNNER_ALREADY_ACTIVE_MESSAGE.includes("RUNNER_ALREADY_ACTIVE"), true);
});
