/**
 * Regression: autonomous daily remaining getters used during React render
 * must be pure. Day-rollover reset is an action, not a selector.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeAutonomousDailyRemaining,
  computeAutonomousDailySentCount,
  settingsDayKey,
} from "../src/lib/autonomous-daily-quota.ts";

const root = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(root, "..", "src", rel), "utf8");

function getterSource(name) {
  const file = src("store/settings-store.ts");
  const impl = file.indexOf("persist(");
  const start = file.indexOf(`\n      ${name}:`, impl);
  assert.ok(start >= 0, `missing implementation of ${name}`);
  const rest = file.slice(start + 1);
  const next = rest.search(/\n      [A-Za-z]/);
  return next >= 0 ? rest.slice(0, next) : rest.slice(0, 1200);
}

test("A. BatchSendSettings render path does not mutate Zustand", () => {
  const batch = src("components/campaigns/batch-send-settings.tsx");
  assert.equal(batch.includes("s.getAutonomousDailyRemaining"), false);
  assert.equal(batch.includes("getAutonomousDailyRemaining("), false);
  assert.match(batch, /computeAutonomousDailyRemaining\(/);
  assert.match(
    batch,
    /useEffect\(\(\) => \{\s*resetAutonomousDailyCountIfNeeded\(\);/s
  );
  assert.equal(batch.includes("suppressHydrationWarning"), false);

  const remaining = computeAutonomousDailyRemaining("2020-01-01", 17, 50);
  assert.equal(remaining, 50);
});

test("B. getAutonomousDailyRemaining is pure", () => {
  const getter = getterSource("getAutonomousDailyRemaining");
  assert.equal(getter.includes("resetAutonomousDailyCountIfNeeded"), false);
  assert.equal(getter.includes("set("), false);
  assert.equal(getter.includes("persist("), false);
  assert.match(getter, /computeAutonomousDailyRemaining/);
  assert.equal(
    computeAutonomousDailyRemaining("2019-12-31", 40, 100),
    100
  );
});

test("C. day change still resets the counter outside render", () => {
  const reset = getterSource("resetAutonomousDailyCountIfNeeded");
  assert.match(reset, /settingsDayKey\(\)/);
  assert.match(reset, /set\(\{\s*autonomousDailySentDate: day,\s*autonomousDailySentCount: 0\s*\}\)/s);

  const increment = getterSource("incrementAutonomousDailySent");
  assert.match(increment, /resetAutonomousDailyCountIfNeeded\(\)/);
  assert.match(increment, /autonomousDailySentCount: get\(\)\.autonomousDailySentCount \+ 1/);

  const bootstrap = src("components/providers/local-data-bootstrap.tsx");
  assert.match(
    bootstrap,
    /useSettingsStore\.getState\(\)\.resetAutonomousDailyCountIfNeeded\(\)/
  );
  const persist = src("store/settings-store.ts");
  assert.match(persist, /onRehydrateStorage:/);
  assert.match(
    persist,
    /state\?\.resetAutonomousDailyCountIfNeeded\(\)/
  );

  const sender = src("lib/campaign-batch-sender.ts");
  const remainingAt = sender.indexOf("getAutonomousDailyRemaining(dailyLimit)");
  const resetAt = sender.lastIndexOf(
    "resetAutonomousDailyCountIfNeeded()",
    remainingAt
  );
  assert.ok(remainingAt > 0);
  assert.ok(resetAt >= 0 && resetAt < remainingAt);

  const today = settingsDayKey();
  assert.equal(computeAutonomousDailyRemaining("2019-12-31", 12, 50, today), 50);
  assert.equal(computeAutonomousDailyRemaining(today, 0, 50, today), 50);
  assert.equal(computeAutonomousDailyRemaining(today, 1, 50, today), 49);
});

test("D. CreateCampaignFormContent still mounts BatchSendSettings", () => {
  const form = src("components/campaigns/create-campaign-form.tsx");
  assert.match(form, /function CreateCampaignFormContent/);
  assert.match(form, /<BatchSendSettings/);
  assert.equal(form.includes("suppressHydrationWarning"), false);
});

test("E. daily remaining stays correct for same-day and new-day", () => {
  const today = settingsDayKey();
  assert.equal(computeAutonomousDailySentCount(today, 8, today), 8);
  assert.equal(computeAutonomousDailyRemaining(today, 8, 50, today), 42);
  assert.equal(computeAutonomousDailyRemaining(today, 50, 50, today), 0);
  assert.equal(computeAutonomousDailyRemaining(today, 80, 50, today), 0);
  assert.equal(
    computeAutonomousDailyRemaining("1999-01-01", 80, 50, today),
    50
  );
  assert.equal(computeAutonomousDailySentCount("1999-01-01", 80, today), 0);
  assert.equal(
    computeAutonomousDailyRemaining(today, 1, 0, today),
    Number.POSITIVE_INFINITY
  );
  assert.equal(
    computeAutonomousDailyRemaining(today, 1, -5, today),
    Number.POSITIVE_INFINITY
  );
});

test("F. nearby render getters stay read-only", () => {
  for (const name of [
    "getEffectiveMaxResults",
    "getEffectiveWorkers",
    "getDelayBounds",
    "getActiveQuickSearchMode",
    "getActiveAutonomousSources",
    "getSearchConfig",
    "getEmailProviderCredentials",
    "getAutonomousDailyRemaining",
  ]) {
    const body = getterSource(name);
    assert.equal(body.includes("set("), false, `${name} mutates via set(`);
    assert.equal(
      body.includes("resetAutonomousDailyCountIfNeeded"),
      false,
      `${name} resets during read`
    );
  }
});
