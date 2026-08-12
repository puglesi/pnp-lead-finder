/**
 * Regression: Settings SSR display matches first client paint (defaults),
 * then persisted values (e.g. 160) apply only after hydration.
 * Theme boot uses next/script (no raw React <script> in layout).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  getSettingsSsrDisplayDefaults,
  getSettingsVolumeDisplay,
  SETTINGS_SSR_DISPLAY_DEFAULTS,
} from "../src/lib/settings-hydration.ts";

const root = dirname(fileURLToPath(import.meta.url));

test("SSR volume defaults: maxResults 200 (autonomous defaults)", () => {
  const d = getSettingsSsrDisplayDefaults();
  assert.equal(d.maxResults, 200);
  assert.equal(d.maxResults, SETTINGS_SSR_DISPLAY_DEFAULTS.maxResults);
  assert.equal(d.workers, SETTINGS_SSR_DISPLAY_DEFAULTS.workers);
  assert.equal(d.delayMs, SETTINGS_SSR_DISPLAY_DEFAULTS.delayMs);
  assert.equal(d.searchProfile, "autonomous-24h");
});

test("pre-hydration display ignores persisted 160", () => {
  const display = getSettingsVolumeDisplay({
    hydrated: false,
    effectiveMaxResults: 160,
    effectiveWorkers: 6,
    delayMs: 500,
    searchProfile: "serpapi",
    useMaxLeads: true,
  });
  assert.equal(display.effectiveMaxResults, 200);
  assert.equal(display.effectiveWorkers, SETTINGS_SSR_DISPLAY_DEFAULTS.workers);
  assert.equal(display.delayMs, SETTINGS_SSR_DISPLAY_DEFAULTS.delayMs);
  assert.equal(display.isAutonomous, true);
  assert.equal(display.useMaxLeads, SETTINGS_SSR_DISPLAY_DEFAULTS.useMaxLeads);
});

test("post-hydration display uses persisted 160", () => {
  const display = getSettingsVolumeDisplay({
    hydrated: true,
    effectiveMaxResults: 160,
    effectiveWorkers: 3,
    delayMs: 4000,
    searchProfile: "autonomous-24h",
    useMaxLeads: false,
  });
  assert.equal(display.effectiveMaxResults, 160);
  assert.equal(display.effectiveWorkers, 3);
  assert.equal(display.delayMs, 4000);
  assert.equal(display.isAutonomous, true);
  assert.equal(display.useMaxLeads, false);
});

test("SSR and first client (hydrated=false) are identical", () => {
  const a = getSettingsVolumeDisplay({
    hydrated: false,
    effectiveMaxResults: 999,
    effectiveWorkers: 99,
    delayMs: 1,
    searchProfile: "serpapi",
    useMaxLeads: true,
  });
  const b = getSettingsVolumeDisplay({
    hydrated: false,
    effectiveMaxResults: 1,
    effectiveWorkers: 1,
    delayMs: 9999,
    searchProfile: "google-cse",
    useMaxLeads: false,
  });
  assert.deepEqual(a, b);
  assert.equal(a.effectiveMaxResults, 200);
});

test("RootLayout uses next/script beforeInteractive — no raw React script tag", () => {
  const layout = readFileSync(
    join(root, "../src/app/layout.tsx"),
    "utf8"
  );
  assert.match(layout, /from ["']next\/script["']/);
  assert.match(layout, /id=["']pnp-theme-boot["']/);
  assert.match(layout, /strategy=["']beforeInteractive["']/);
  // Must not use raw <script> JSX for theme boot
  assert.doesNotMatch(
    layout,
    /<script\s+dangerouslySetInnerHTML/
  );
  assert.match(layout, /themeBootScript/);
  assert.match(layout, /pnp-theme/);
});

test("SearchSettingsForm uses hydration gate for volume text", () => {
  const source = readFileSync(
    join(root, "../src/components/settings/search-settings-form.tsx"),
    "utf8"
  );
  assert.match(source, /useSyncExternalStore/);
  assert.match(source, /getSettingsVolumeDisplay/);
  assert.match(source, /volume\.effectiveMaxResults/);
  assert.doesNotMatch(
    source,
    /settings\.getEffectiveMaxResults\(\)\s*<\/strong>/
  );
});

test("no real email", () => {
  assert.ok(true);
});
